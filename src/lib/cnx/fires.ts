// CNX fires (FIRMS) module.
//
// Live: NASA FIRMS CSV download for Southeast Asia, 24-h window. The
// public endpoint is
//   https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/VIIRS_SNPP_NRT/97,17,101,21/1/2026-09-15
// We filter hotspots to the CNX bbox and project to FireHotspot.
//
// When FIRMS is not reachable (Cloudflare Workers egress is blocked
// to firms.modaps.eosdis.nasa.gov by default) we degrade to a
// deterministic scenario dataset — burning-season hotspots
// concentrated in the forest-edge districts.

import { CNX_PROVINCE } from "./config";
import type { CnxFiresResponse, FireHotspot, SeverityLevel } from "../../types/cnx";

const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
/** Days requested per pass — see fetchFirmsInBbox for why not 1. */
const FIRMS_WINDOW_DAYS = 2;

/**
 * What we actually report, and what the UI must say.
 *
 * These are different on purpose. The fetch asks for 2 days because a
 * 1-day request returns a valid but empty body during the NRT publishing
 * lag, and empty is indistinguishable from "clear". The 2-day body is
 * the *liveness proof*. What an operator is shown stays a 24-hour number,
 * because "FIRMS Hotspots (24 h)" next to a 48-hour count is a false
 * statement about how much ground the number covers.
 */
const FIRMS_REPORT_HOURS = 24;

function severityForBrightness(b: number): SeverityLevel {
  // An unreadable brightness is not a cool fire. `NaN >= 360` is false all
  // the way down this ladder, so without this guard a CSV that omits
  // `bright_ti4` — LANDSAT carries no brightness or FRP column at all —
  // returns `good` for every detection. That is a false all-clear printed
  // by a missing field, and it is the same failure mode the VIIRS
  // confidence letters caused one line up: unparseable in, quiet out.
  if (!Number.isFinite(b)) return "unknown";
  if (b >= 360) return "critical";
  if (b >= 340) return "alert";
  if (b >= 320) return "watch";
  return "good";
}

/**
 * FIRMS NRT reports confidence as the letter `n` / `l` / `h` (nominal /
 * low / high), NOT the 0-100 integer that the archived 2024 CSVs used.
 * A live /api/area/csv call therefore puts "n" in that column, and the old
 * `+cells[idx.confidence]` produced NaN -> `confidence: null` on a field
 * typed `number`. Every hotspot read "unknown confidence" while the panel
 * looked otherwise healthy.
 */
const CONFIDENCE_MAP: Record<string, number> = { l: 30, n: 65, h: 95 };

export function parseConfidence(cell: string | undefined): number {
  if (cell === undefined) return 0;
  const raw = cell.trim().toLowerCase();
  const letter = CONFIDENCE_MAP[raw];
  if (letter !== undefined) return letter;
  const numeric = Number(raw);
  // Archived feeds give a bare number; some give "90" as text. Anything
  // unparseable becomes 0, which the panel already renders as unknown.
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * NRT rows carry a single-letter satellite code, not the full name:
 *   S = Suomi NPP, N = NOAA-20, J = NOAA-21, T = Terra, A = Aqua
 * The archived CSVs spell it out. The old code cast the raw letter through
 * the FireHotspot union, so a live pass produced satellites like "N" —
 * a value the type system claimed was impossible but which reached the
 * UI and the trajectory weight unchanged.
 */
const SATELLITE_MAP: Record<string, FireHotspot["satellite"]> = {
  s: "SUOMI-NPP",
  "suomi-npp": "SUOMI-NPP",
  n: "NOAA-20",
  "noaa-20": "NOAA-20",
  j: "NOAA-21",
  "noaa-21": "NOAA-21",
  t: "TERRA",
  terra: "TERRA",
  a: "AQUA",
  aqua: "AQUA",
};

export function normaliseSatellite(cell: string | undefined): FireHotspot["satellite"] {
  const raw = (cell ?? "").trim().toLowerCase();
  return SATELLITE_MAP[raw] ?? "SUOMI-NPP";
}

export function parseFirmsCsv(
  csv: string,
  bbox: { west: number; south: number; east: number; north: number } = CNX_PROVINCE.bbox,
): FireHotspot[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const idx = {
    lat: header.indexOf("latitude"),
    lon: header.indexOf("longitude"),
    bright: header.indexOf("bright_ti4"),
    confidence: header.indexOf("confidence"),
    frp: header.indexOf("frp"),
    satellite: header.indexOf("satellite"),
    acq: header.indexOf("acq_date"),
    acqTime: header.indexOf("acq_time"),
  };
  return lines.slice(1).map((line, i) => {
    const cells = line.split(",");
    const lat = +cells[idx.lat];
    const lon = +cells[idx.lon];
    if (lon < bbox.west || lon > bbox.east || lat < bbox.south || lat > bbox.north) return null;
    const rawBright = cells[idx.bright];
    // A missing column index (or an empty cell) is not a temperature of 0.
    const brightness = rawBright === undefined || rawBright === "" ? null : +rawBright;
    const hotspot: FireHotspot = {
      id: `firms-${cells[0]}-${i}`,
      latitude: lat,
      longitude: lon,
      brightness: Number.isFinite(brightness) ? brightness : null,
      confidence: parseConfidence(cells[idx.confidence]),
      satellite: normaliseSatellite(cells[idx.satellite]),
      detectedAt: `${cells[idx.acq]}T${String(cells[idx.acqTime]).padStart(4, "0").slice(0, 2)}:${String(
        cells[idx.acqTime],
      ).padStart(4, "0").slice(2, 4)}:00Z`,
      severity: brightness === null || !Number.isFinite(brightness) ? "unknown" : severityForBrightness(brightness),
      frp: cells[idx.frp] ? +cells[idx.frp] : undefined,
    };
    return hotspot;
  }).filter((h): h is FireHotspot => h !== null);
}

/**
 * Live VIIRS pass for an arbitrary box. `null` means no key or the
 * upstream did not answer — never an empty illustration. `[]` is a real
 * pass with zero detections.
 */
export async function fetchFirmsInBbox(bbox: {
  west: number;
  south: number;
  east: number;
  north: number;
}): Promise<FireHotspot[] | null> {
  const mapKey = process.env.FIRMS_MAP_KEY;
  if (!mapKey) return null;
  // Ask for a two-day window ending today, not one day.
  //
  // FIRMS NRT is a near-real-time product with a publishing delay of a few
  // hours, and the request is anchored to UTC while the province runs on
  // UTC+7. Requesting /1/<today> therefore returns a valid, EMPTY body for
  // much of the day — which this module cannot distinguish from "there are
  // genuinely no fires". On a haze board that reads as a clean sky, which
  // is the most dangerous failure available: it is a false all-clear
  // produced by a clock, not by data. Two days costs one extra row and
  // removes most of that window.
  const today = new Date().toISOString().slice(0, 10);
  const url = `${FIRMS_BASE}/${mapKey}/VIIRS_SNPP_NRT/${bbox.west},${bbox.south},${bbox.east},${bbox.north}/${FIRMS_WINDOW_DAYS}/${today}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    // 400 with "Invalid MAP_KEY" is the single most likely first-day
    // failure; a 429 means we are rate-limited. Both must fall back to
    // scenario rather than render as "0 fires, live".
    if (!res.ok) return null;
    const csv = await res.text();
    if (!csv.trim() || csv.trimStart().startsWith("<")) return null;
    // FIRMS answers an over-quota or bad-source request with a bare
    // string in the body and a 200, so guard the content explicitly.
    if (csv.trimStart().startsWith("Invalid") || csv.trimStart().startsWith("-1")) return null;
    const rows = parseFirmsCsv(csv, bbox);
    // Three outcomes, and collapsing any two of them is how a haze board
    // ends up wrong in both directions:
    //
    //   header only, zero rows  → the pass is not published yet: UNKNOWN
    //   rows, none in last 24 h → the pass is LIVE and the sky is clear
    //   rows within 24 h        → the number
    //
    // The second case is the one a blanket `empty → null` cannot express,
    // and it is common: CNX sits in a real burn season, so yesterday had
    // fire and today may not. Returning null there tells the operator
    // "NASA did not answer" on a day when NASA answered clearly.
    if (rows.length === 0) return null;

    const cutoff = Date.now() - FIRMS_REPORT_HOURS * 3_600_000;
    return rows.filter((h) => {
      const t = Date.parse(h.detectedAt);
      return Number.isFinite(t) && t >= cutoff;
    });
  } catch {
    return null;
  }
}

async function fetchLiveFirms(): Promise<FireHotspot[] | null> {
  return fetchFirmsInBbox(CNX_PROVINCE.bbox);
}

function buildScenario(now: string): CnxFiresResponse {
  // 14 hotspots, deterministically scattered. Forest-edge (above
  // ~700 m elevation, west and south of city) carries the bulk.
  const hotspots: FireHotspot[] = [
    { lat: 18.51, lon: 98.62, sat: "SUOMI-NPP" },
    { lat: 18.62, lon: 98.71, sat: "NOAA-20" },
    { lat: 18.55, lon: 98.85, sat: "SUOMI-NPP" },
    { lat: 18.69, lon: 98.81, sat: "NOAA-20" },
    { lat: 18.73, lon: 98.93, sat: "SUOMI-NPP" },
    { lat: 18.83, lon: 99.21, sat: "NOAA-21" },
    { lat: 18.91, lon: 99.43, sat: "SUOMI-NPP" },
    { lat: 19.02, lon: 99.51, sat: "NOAA-20" },
    { lat: 19.18, lon: 99.31, sat: "SUOMI-NPP" },
    { lat: 19.42, lon: 99.07, sat: "NOAA-20" },
    { lat: 19.61, lon: 98.83, sat: "SUOMI-NPP" },
    { lat: 19.55, lon: 98.61, sat: "NOAA-21" },
    { lat: 19.71, lon: 99.81, sat: "SUOMI-NPP" },
    { lat: 18.34, lon: 99.27, sat: "NOAA-20" },
  ].map((s, i) => {
    const brightness = 330 + Math.sin(i * 1.7) * 18;
    return {
      id: `scenario-fire-${i}`,
      latitude: s.lat,
      longitude: s.lon,
      brightness: Math.round(brightness * 10) / 10,
      confidence: Math.round(60 + Math.sin(i) * 20 + 20),
      satellite: s.sat as FireHotspot["satellite"],
      detectedAt: now,
      severity: severityForBrightness(brightness),
      frp: Math.round((Math.sin(i) * 4 + 6) * 10) / 10,
    };
  });
  return {
    generatedAt: now,
    hotspots,
    totalCount: hotspots.length,
    forestShare: 0.71,
    provenance: "scenario",
  };
}

let cache: { at: number; data: CnxFiresResponse } | null = null;
const TTL_MS = 10 * 60_000;

export async function fetchCnxFires(): Promise<CnxFiresResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const now = new Date().toISOString();
  const live = await fetchLiveFirms();
  if (live) {
    const response: CnxFiresResponse = {
      generatedAt: now,
      hotspots: live,
      totalCount: live.length,
      provenance: "live",
    };
    cache = { at: Date.now(), data: response };
    return response;
  }
  const scenario = buildScenario(now);
  cache = { at: Date.now(), data: scenario };
  return scenario;
}