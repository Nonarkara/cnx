// Webcam haze scoring, run from scripts/relay-flights.mjs every 10 min.
// Cloudflare Workers can't decode images, so this runs on the relay Mac:
// pull every public camera snapshot the dashboard lists, score it with the
// pure maths in src/lib/cnx/haze-vision-core.ts, attach the nearest
// DustBoy ground PM2.5 for context, keep a 30-day history per camera (the
// per-camera clear-day baseline) and push the result to
// /api/cnx/haze-vision/ingest.

import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { classifyFrame, computeFrameMetrics, HAZE_SCORER_VERSION, isScorable, pearson } from "../src/lib/cnx/haze-vision-core.ts";
import { flagSuspects, normaliseStation } from "../src/lib/cnx/dustboy.ts";

const EVERY_MS = 10 * 60_000;
const HISTORY_DAYS = 30;
/** Windy previews refresh a few times a day (some cameras are dead for days); older frames are not scored. */
const MAX_FRAME_AGE_MS = 6 * 60 * 60_000;
const NEAREST_SENSOR_KM = 15;
const MAX_SENSOR_TIME_DELTA_MS = 90 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;
const ANALYSIS_WIDTH = 320;
const MAX_SNAPSHOT_BYTES = 12 * 1024 * 1024;
const MAX_SNAPSHOT_PIXELS = 24_000_000;
/**
 * PM2.5 spread (µg/m³) below which a correlation cannot discriminate a
 * working scorer from a broken one. Duplicated from
 * HAZE_TESTABLE_SPREAD in src/lib/cnx/haze-vision.ts on purpose: that file
 * uses extensionless imports ("./haze-vision-core") that only a bundler
 * resolves, so importing it here crashed the relay under Node's native TS
 * stripping. haze-vision-core.ts and dustboy.ts are safe to import because
 * they are import-free. Keep the two in step — haze-vision-core.test.ts
 * does not cover this, so it is asserted in the relay's own smoke check.
 */
const HAZE_TESTABLE_SPREAD = 20;
/** A reading at or above this is an unhealthy one; an EVENT needs several. */
const HAZE_EVENT_UG = 50;
const DUSTBOY_FEED = "https://www-old.cmuccdc.org/assets/api/haze/pwa/json/stations.json";
const CACHE_DIR = process.env.CNX_RELAY_CACHE_DIR ?? "/Volumes/Data/CNX/relay-cache";
const HISTORY_FILE = `${CACHE_DIR}/haze-history.json`;

let lastRunAt = 0;

function loadHistory() {
  try {
    return JSON.parse(readFileSync(HISTORY_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveHistory(history) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(HISTORY_FILE, JSON.stringify(history));
}

function distanceKm(aLat, aLon, bLat, bLon) {
  const r = (d) => (d * Math.PI) / 180;
  const x = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLon - aLon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

async function fetchDustboyOnline() {
  try {
    const res = await fetch(DUSTBOY_FEED, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return [];
    const raw = await res.json();
    return flagSuspects(raw.map((r) => normaliseStation(r)).filter((s) => s !== null))
      .filter((s) => s.pm25 !== null && !s.suspect);
  } catch {
    return [];
  }
}

function nearestPm25(cam, sensors, observedAt) {
  let best = null;
  for (const s of sensors) {
    const sensorTime = Date.parse(s.observedAt);
    if (!Number.isFinite(sensorTime) || sensorTime > Date.now() + CLOCK_SKEW_MS ||
        Math.abs(sensorTime - observedAt) > MAX_SENSOR_TIME_DELTA_MS) continue;
    const d = distanceKm(cam.latitude, cam.longitude, s.latitude, s.longitude);
    if (d <= NEAREST_SENSOR_KM && (!best || d < best.distanceKm)) {
      best = { stationId: s.stationId, stationName: s.nameTh || s.stationId, pm25: s.pm25, distanceKm: Math.round(d * 10) / 10, observedAt: s.observedAt };
    }
  }
  return best;
}

async function readSnapshotBytes(res) {
  if (Number(res.headers.get("content-length")) > MAX_SNAPSHOT_BYTES) {
    await res.body?.cancel();
    throw new Error("snapshot exceeds 12 MiB — not scored");
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("snapshot body is missing — not scored");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SNAPSHOT_BYTES) {
        await reader.cancel();
        throw new Error("snapshot exceeds 12 MiB — not scored");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    reader.releaseLock();
  }
}

async function scoreSnapshot(url, capturedAt) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "cnx-dashboard haze relay" } });
  if (!res.ok) throw new Error(`snapshot ${res.status}`);
  const headerTime = Date.parse(res.headers.get("last-modified") ?? "");
  const observedAt = Number.isFinite(headerTime) ? headerTime : Date.parse(capturedAt ?? "");
  if (!Number.isFinite(observedAt)) throw new Error("snapshot capture time is unknown — not scored");
  if (observedAt > Date.now() + CLOCK_SKEW_MS) throw new Error("snapshot capture time is in the future — not scored");
  if (Date.now() - observedAt > MAX_FRAME_AGE_MS) throw new Error("snapshot is older than 6 hours — not scored");
  const { data, info } = await sharp(await readSnapshotBytes(res), { limitInputPixels: MAX_SNAPSHOT_PIXELS })
    .resize({ width: ANALYSIS_WIDTH, withoutEnlargement: true })
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    metrics: computeFrameMetrics(data, info.width, info.height, info.channels),
    observedAt,
    fingerprint: createHash("sha256").update(`${info.width}:${info.height}:${info.channels}:`).update(data).digest("hex"),
  };
}

/** Pearson r of stored scores vs co-located PM2.5 across every camera.
 *
 *  Also reports the ground reading's range. A bare r is not interpretable on
 *  its own: Pearson against a near-constant response yields a small number
 *  regardless of whether the scorer works. The first month of operation
 *  paired only clean air (3-20 µg/m³), so `r` sat near 0.12 for want of a
 *  haze event rather than any fault in the image statistics. Carrying
 *  pm25Min/pm25Max/spansHazeEvent lets the panel say "not yet testable"
 *  instead of printing a number that reads as a verdict. */
function agreement(history) {
  // One hourly ground observation is one validation sample, even when
  // multiple frames/cameras pair with it. Average their visual scores.
  const paired = new Map();
  for (const entries of Object.values(history)) {
    for (const e of entries) {
      if (e.scorerVersion !== HAZE_SCORER_VERSION || typeof e.pmPairKey !== "string" ||
          typeof e.score !== "number" || typeof e.pm25 !== "number") continue;
      const group = paired.get(e.pmPairKey) ?? { sum: 0, count: 0, pm25: e.pm25 };
      paired.set(e.pmPairKey, { sum: group.sum + e.score, count: group.count + 1, pm25: group.pm25 });
    }
  }
  const xs = [...paired.values()].map((p) => p.sum / p.count);
  const ys = [...paired.values()].map((p) => p.pm25);
  const sorted = [...ys].sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null);
  const pm25Min = sorted.length ? sorted[0] : null;
  const pm25Max = sorted.length ? sorted[sorted.length - 1] : null;
  const median = pct(0.5);
  const p95 = pct(0.95);
  // A haze EVENT means readings a sensor network would call unhealthy,
  // sustained. Haze is regional: it lifts many stations at once. One
  // spiking station is the fault we already detect in dustboy.ts, and
  // counting it as an "event" lets a single broken unit manufacture a
  // testable window — which is how the first version of this metric
  // reported r = -0.01 over "clean air 3-149 µg/m³".
  const eventReadings = ys.filter((v) => v >= HAZE_EVENT_UG).length;
  const robustSpread = median !== null && p95 !== null ? p95 - median : null;
  return {
    r: pearson(xs, ys),
    pairs: xs.length,
    pm25Min,
    pm25Max,
    pm25Median: median,
    pm25P95: p95,
    eventReadings,
    spansHazeEvent: robustSpread !== null && robustSpread >= HAZE_TESTABLE_SPREAD && eventReadings >= 3,
  };
}

export async function runHazeVision({ baseUrl, secret }) {
  if (Date.now() - lastRunAt < EVERY_MS) return;
  lastRunAt = Date.now();
  try {
    const cctvRes = await fetch(`${baseUrl}/api/cnx/cctv`, { signal: AbortSignal.timeout(20_000) });
    if (!cctvRes.ok) throw new Error(`cctv list ${cctvRes.status}`);
    // Only score cameras the wall reports as reachable. The Windy roster is
    // mostly stale (8 of 9 were 34–79 h old on 2026-09-29), and scoring
    // those stills wastes a download per camera per cycle and buries the
    // real signal in dead frames.
    const cams = ((await cctvRes.json()).slots ?? []).filter(
      (c) => c.reachable !== false && typeof c.posterUrl === "string" && c.posterUrl.startsWith("https://"),
    );
    const sensors = await fetchDustboyOnline();
    const history = loadHistory();
    const cutoff = Date.now() - HISTORY_DAYS * 86_400_000;
    const cameras = [];
    for (const [id, entries] of Object.entries(history)) {
      history[id] = entries.filter((e) => e.t >= cutoff && isScorable(e.m));
    }

    for (const cam of cams) {
      try {
        const snapshot = await scoreSnapshot(cam.posterUrl, cam.capturedAt);
        const { metrics, fingerprint } = snapshot;
        const past = history[cam.id] ?? [];
        // A CDN may update Last-Modified without changing the pixels. Keep the
        // original observation time so a frozen scene cannot look newly captured.
        const previous = past.find((e) => e.fingerprint === fingerprint);
        const observedAt = previous?.t ?? snapshot.observedAt;
        if (Date.now() - observedAt > MAX_FRAME_AGE_MS) {
          history[cam.id] = past;
          console.warn(`[haze] ${cam.id}: unchanged snapshot is older than 6 hours — not scored`);
          continue;
        }
        const verdict = classifyFrame(metrics, past.map((e) => e.m));
        const pm = nearestPm25(cam, sensors, observedAt);
        // Same frame as last run (Windy refreshes slower than we poll) — don't double-count it.
        // isScorable (not just isDaylight) so monochrome IR night-vision frames
        // never enter the baseline or the stored history.
        if (!previous && !past.some((e) => e.t === observedAt) && isScorable(metrics)) {
          past.push({ t: observedAt, m: metrics, score: verdict.score, pm25: pm?.pm25 ?? null, pmPairKey: pm ? `${pm.stationId}:${pm.observedAt}` : null, fingerprint, scorerVersion: HAZE_SCORER_VERSION });
        }
        history[cam.id] = past;
        cameras.push({
          cameraId: cam.id,
          label: cam.label,
          latitude: cam.latitude,
          longitude: cam.longitude,
          snapshotUrl: cam.posterUrl,
          observedAt: new Date(observedAt).toISOString(),
          verdict: verdict.label,
          score: verdict.score,
          metrics,
          baselineSamples: past.length,
          nearestPm25: pm,
        });
      } catch (e) {
        console.warn(`[haze] ${cam.id}: ${e.message}`);
      }
    }
    saveHistory(history);

    const res = await fetch(`${baseUrl}/api/cnx/haze-vision/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Secret": secret },
      body: JSON.stringify({ generatedAt: new Date().toISOString(), cameras, agreement: agreement(history) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`ingest ${res.status} ${(await res.text()).slice(0, 160)}`);
    const tally = cameras.reduce((m, c) => ({ ...m, [c.verdict]: (m[c.verdict] ?? 0) + 1 }), {});
    console.log(`[haze] scored ${cameras.length}/${cams.length} cameras`, tally);
  } catch (e) {
    console.warn(`[haze] run failed: ${e.message}`);
  }
}
