// Three fixed public riverside stills. No arbitrary URLs, video sweep or identity inference.
import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { computeFrameMetrics } from "../src/lib/cnx/haze-vision-core.ts";
import { WATER_CAMERAS, WATER_CLOCK_SKEW_MS, waterImageStatus } from "../src/lib/cnx/water-vision-core.ts";

const EVERY_MS = 15 * 60_000;
const MAX_BYTES = 12 * 1024 * 1024;
const CACHE_DIR = process.env.CNX_RELAY_CACHE_DIR ?? "/Volumes/Data/CNX/relay-cache";
const STATE_FILE = `${CACHE_DIR}/water-history.json`;
let lastRunAt = 0;
function loadState() { try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return {}; } }
function saveState(state) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify(state));
  renameSync(`${STATE_FILE}.tmp`, STATE_FILE);
}
async function readBytes(response) {
  if (Number(response.headers.get("content-length")) > MAX_BYTES) { await response.body?.cancel(); throw new Error("oversized image"); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("missing image body");
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error("oversized image"); }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally { reader.releaseLock(); }
}

async function collectAndPush({ baseUrl, secret }) {
  const now = Date.now();
  const state = loadState();
  const lastAttempt = Math.max(lastRunAt, Number(state.lastAttemptAt) || 0);
  if (lastAttempt <= now && now - lastAttempt < EVERY_MS) return;
  lastRunAt = now; state.lastAttemptAt = now;
  // Persist attempt before I/O: a restart must not turn a failed upstream into a tight probe loop.
  saveState(state);
  const cameras = [];
  for (const camera of WATER_CAMERAS) {
    const collectedAt = new Date().toISOString();
    try {
      const path = new URL(camera.snapshotUrl).pathname + new URL(camera.snapshotUrl).search;
      const response = await fetch(`http://127.0.0.1:8340${path}`, { redirect: "error", signal: AbortSignal.timeout(15_000), headers: { Accept: "image/jpeg,image/png,image/webp", "User-Agent": "CNX water-view relay (15-minute samples)" } });
      if (!response.ok || !/^image\/(jpeg|png|webp)(;|$)/i.test(response.headers.get("content-type") ?? "")) { await response.body?.cancel(); throw new Error("source image unavailable"); }
      const header = response.headers.get("x-taken-at");
      const parsed = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(header ?? "") ? Date.parse(header) : NaN;
      const normalized = header?.includes(".") ? header : header?.replace(/Z$/, ".000Z");
      const sourceAt = Number.isFinite(parsed) && new Date(parsed).toISOString() === normalized && parsed <= Date.now() + WATER_CLOCK_SKEW_MS ? new Date(parsed).toISOString() : null;
      const { data, info } = await sharp(await readBytes(response), { limitInputPixels: 24_000_000 }).resize({ width: 320, withoutEnlargement: true }).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const raw = computeFrameMetrics(data, info.width, info.height, info.channels);
      const metrics = { meanLuminance: raw.meanLuminance, contrast: raw.contrast, luminanceRange: raw.luminanceRange };
      // DWR burns its clock/title into the top band. Exclude that band from scene identity.
      const fingerprint = createHash("sha256").update(`${info.width}:${info.height}:${info.channels}:`).update(data.subarray(Math.floor(info.height * 0.2) * info.width * info.channels)).digest("hex");
      const past = state[camera.cameraId] ?? { lastFingerprint: null, frames: [] };
      const frames = past.frames.filter(f => Number.isFinite(f.firstSeenAt) && f.firstSeenAt >= now - 30 * 86_400_000 && f.firstSeenAt <= now);
      const previous = frames.find(f => f.fingerprint === fingerprint);
      // A source clock changing over identical pixels never creates a new capture.
      const observedAt = previous ? previous.observedAt : sourceAt;
      if (!previous) frames.push({ fingerprint, observedAt, firstSeenAt: now });
      const frameChanged = past.lastFingerprint === null ? null : past.lastFingerprint !== fingerprint;
      state[camera.cameraId] = { lastFingerprint: fingerprint, frames: frames.slice(-3000) };
      cameras.push({ ...camera, collectedAt, observedAt, status: waterImageStatus(metrics, observedAt, Date.now()), metrics, frameChanged, note: "Image readability and scene change only; not a water, flood, depth or safe-road finding." });
    } catch {
      cameras.push({ ...camera, collectedAt, observedAt: null, status: "unavailable", metrics: null, frameChanged: null, note: "Could not obtain a bounded decoded source image; no water assessment is available." });
    }
  }
  saveState(state);
  const response = await fetch(`${baseUrl}/api/cnx/water-vision/ingest`, {
    method: "POST", redirect: "error", headers: { "Content-Type": "application/json", "X-Relay-Secret": secret },
    body: JSON.stringify({ generatedAt: new Date().toISOString(), cameras }), signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`water-view ingest ${response.status}`);
  console.log(`[water] sampled ${cameras.filter(c => c.metrics !== null).length}/${WATER_CAMERAS.length} DWR views (image quality only)`);
}

export async function runWaterVision(options) {
  try { await collectAndPush(options); }
  catch { console.warn("[water] collection or ingest failed; existing relay remains active and API copy will expire"); }
}
