// Webcam haze scoring, run from scripts/relay-flights.mjs every 10 min.
// Cloudflare Workers can't decode images, so this runs on the relay Mac:
// pull every public camera snapshot the dashboard lists, score it with the
// pure maths in src/lib/cnx/haze-vision-core.ts, attach the nearest
// DustBoy ground PM2.5 for context, keep a 30-day history per camera (the
// per-camera clear-day baseline) and push the result to
// /api/cnx/haze-vision/ingest.

import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { classifyFrame, computeFrameMetrics, isScorable, pearson } from "../src/lib/cnx/haze-vision-core.ts";
import { HAZE_TESTABLE_SPREAD } from "../src/lib/cnx/haze-vision.ts";
import { normaliseStation } from "../src/lib/cnx/dustboy.ts";

const EVERY_MS = 10 * 60_000;
const HISTORY_DAYS = 30;
/** Windy previews refresh a few times a day (some cameras are dead for days); older frames are not scored. */
const MAX_FRAME_AGE_MS = 6 * 60 * 60_000;
const NEAREST_SENSOR_KM = 15;
const ANALYSIS_WIDTH = 320;
const DUSTBOY_FEED = "https://www-old.cmuccdc.org/assets/api/haze/pwa/json/stations.json";
const CACHE_DIR = "/Volumes/Data/CNX/relay-cache";
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
    return raw.map((r) => normaliseStation(r)).filter((s) => s && s.pm25 !== null);
  } catch {
    return [];
  }
}

function nearestPm25(cam, sensors) {
  let best = null;
  for (const s of sensors) {
    const d = distanceKm(cam.latitude, cam.longitude, s.latitude, s.longitude);
    if (d <= NEAREST_SENSOR_KM && (!best || d < best.distanceKm)) {
      best = { stationName: s.nameTh || s.stationId, pm25: s.pm25, distanceKm: Math.round(d * 10) / 10, observedAt: s.observedAt };
    }
  }
  return best;
}

async function scoreSnapshot(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "cnx-dashboard haze relay" } });
  if (!res.ok) throw new Error(`snapshot ${res.status}`);
  const modified = Date.parse(res.headers.get("last-modified") ?? "");
  const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
    .resize({ width: ANALYSIS_WIDTH, withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    metrics: computeFrameMetrics(data, info.width, info.height, info.channels),
    observedAt: Number.isFinite(modified) ? modified : Date.now(),
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
  const xs = [];
  const ys = [];
  for (const entries of Object.values(history)) {
    for (const e of entries) {
      if (typeof e.score === "number" && typeof e.pm25 === "number") {
        xs.push(e.score);
        ys.push(e.pm25);
      }
    }
  }
  const pm25Min = ys.length ? Math.min(...ys) : null;
  const pm25Max = ys.length ? Math.max(...ys) : null;
  return {
    r: pearson(xs, ys),
    pairs: xs.length,
    pm25Min,
    pm25Max,
    spansHazeEvent: pm25Min !== null && pm25Max - pm25Min >= HAZE_TESTABLE_SPREAD,
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

    for (const cam of cams) {
      try {
        const { metrics, observedAt } = await scoreSnapshot(cam.posterUrl);
        if (Date.now() - observedAt > MAX_FRAME_AGE_MS) {
          console.warn(`[haze] ${cam.id}: snapshot is ${Math.round((Date.now() - observedAt) / 3_600_000)} h old, skipped`);
          continue;
        }
        const past = (history[cam.id] ?? []).filter((e) => e.t >= cutoff);
        const verdict = classifyFrame(metrics, past.map((e) => e.m));
        const pm = nearestPm25(cam, sensors);
        // Same frame as last run (Windy refreshes slower than we poll) — don't double-count it.
        // isScorable (not just isDaylight) so monochrome IR night-vision frames
        // never enter the baseline or the stored history.
        if (past.at(-1)?.t !== observedAt && isScorable(metrics)) {
          past.push({ t: observedAt, m: metrics, score: verdict.score, pm25: pm?.pm25 ?? null });
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
