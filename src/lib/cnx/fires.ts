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
import { inChiangMaiProvince, CNX_PROVINCE_RING } from "./province-boundary";
import type { CnxFiresResponse, FireHotspot, SeverityLevel } from "../../types/cnx";

const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
/** Preserve regional smoke context while covering the province's southern tip. */
export const CNX_FIRMS_BBOX = {
  ...CNX_PROVINCE.bbox,
  south: Math.min(CNX_PROVINCE.bbox.south, ...CNX_PROVINCE_RING.map(p => p[1])),
};
/** Days requested per pass — see fetchFirmsInBbox for why not 1. */
const FIRMS_WINDOW_DAYS = 2;

/**
 * NRT archive names, most-preferred first.
 *
 * FIRMS renames and retires archives as platforms end: NOAA-20 and NOAA-21
 * NRT sources were added as older ones were retired, and a hardcoded source
 * silently goes dark when that happens. It is not a loud failure either —
 * an unknown source returns HTTP 200 with the body "Invalid source.", and
 * the key is validated BEFORE the source, so a bad key masks a bad source
 * entirely (verified 2026-09-30: with a rejected key, both a valid and a
 * bogus archive returned "Invalid MAP_KEY.").
 *
 * So: try each in turn, and surface which source answered so a rotation
 * is visible rather than mysterious. VIIRS_SNPP_NRT leads because it has
 * the longest history of availability; NOAA-20 is the next most likely.
 */
const FIRMS_SOURCES = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"] as const;

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
// NASA FIRMS satellite codes, as they appear in the CSV (checked against
// the live 24 h files, 2026-10-03): VIIRS "N" = Suomi-NPP, "N20" = NOAA-20
// (JPSS-1), "N21" = NOAA-21 (JPSS-2); MODIS "T" = Terra, "A" = Aqua. The
// old table read "N" as NOAA-20 and had no N20/N21, so every NOAA
// detection fell through to "SUOMI-NPP".
const SATELLITE_MAP: Record<string, FireHotspot["satellite"]> = {
  n: "SUOMI-NPP",
  s: "SUOMI-NPP",
  npp: "SUOMI-NPP",
  "suomi-npp": "SUOMI-NPP",
  "suomi npp": "SUOMI-NPP",
  n20: "NOAA-20",
  j1: "NOAA-20",
  "noaa-20": "NOAA-20",
  n21: "NOAA-21",
  j2: "NOAA-21",
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
  bbox: { west: number; south: number; east: number; north: number } = CNX_FIRMS_BBOX,
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
/** Why the last FIRMS request produced no answer — surfaced in the fires
 *  response so "no live" says which failure it is (no key, rejected key,
 *  HTTP error…) instead of one sentence covering all of them. */
let lastFirmsFailure: string | null = null;
export function firmsFailureReason(): string | null {
  return lastFirmsFailure;
}

/** Which path produced the last live answer. */
export type FirmsSource = "area-api" | "open-24h";
let lastFirmsSource: FirmsSource | null = null;
export function firmsSource(): FirmsSource | null {
  return lastFirmsSource;
}

/**
 * NASA's open, keyless "active fire" files: the last 24 h of VIIRS
 * detections for Southeast Asia, one file per satellite, same columns as
 * the area API. Used when the keyed API fails (the stored MAP_KEY has been
 * rejected since 2026-09-30), so a key problem no longer blanks the fire
 * layer. warroom.pro's NASA layer is built on the same files.
 */
const OPEN_FIRMS_FILES = [
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_SouthEast_Asia_24h.csv",
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_SouthEast_Asia_24h.csv",
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_SouthEast_Asia_24h.csv",
] as const;

type Bbox = { west: number; south: number; east: number; north: number };

/**
 * Keeps the header and only the rows inside the box, reading just the
 * leading latitude/longitude fields. Each file is 1–2 MB and ~20k rows; a
 * full split costs ~70 ms of CPU per file, this ~5 ms.
 */
export function prefilterFirmsCsv(csv: string, bbox: Bbox): string {
  const headerEnd = csv.indexOf("\n");
  if (headerEnd < 0) return csv;
  const header = csv.slice(0, headerEnd).trim();
  if (!header.startsWith("latitude,longitude,")) return csv; // unexpected layout: let the full parser decide
  const kept = [header];
  let i = headerEnd + 1;
  while (i < csv.length) {
    let end = csv.indexOf("\n", i);
    if (end < 0) end = csv.length;
    const c1 = csv.indexOf(",", i);
    if (c1 > i && c1 < end) {
      const lat = Number(csv.slice(i, c1));
      if (lat >= bbox.south && lat <= bbox.north) {
        const c2 = csv.indexOf(",", c1 + 1);
        const lon = Number(csv.slice(c1 + 1, c2));
        if (lon >= bbox.west && lon <= bbox.east) kept.push(csv.slice(i, end).trim());
      }
    }
    i = end + 1;
  }
  return kept.join("\n");
}

/** All three satellites' open 24 h files, merged. Null only when none answered. */
async function fetchOpenFirmsInBbox(bbox: Bbox): Promise<FireHotspot[] | null> {
  const bodies = await Promise.all(
    OPEN_FIRMS_FILES.map(async (url) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
        if (!res.ok) return null;
        const csv = await res.text();
        return csv.startsWith("latitude,") ? prefilterFirmsCsv(csv, bbox) : null;
      } catch {
        return null;
      }
    }),
  );
  const answered = bodies.filter((b): b is string => b !== null);
  if (answered.length === 0) return null;
  return answered.flatMap((csv) => finishLivePass(csv, bbox));
}

export async function fetchFirmsInBbox(bbox: Bbox): Promise<FireHotspot[] | null> {
  lastFirmsSource = null;
  const keyed = await fetchFirmsKeyed(bbox);
  if (keyed !== null) {
    lastFirmsSource = "area-api";
    return keyed;
  }
  // Keep lastFirmsFailure (why the key path failed) for the response.
  const open = await fetchOpenFirmsInBbox(bbox);
  if (open !== null) lastFirmsSource = "open-24h";
  return open;
}

async function fetchFirmsKeyed(bbox: Bbox): Promise<FireHotspot[] | null> {
  const mapKey = process.env.FIRMS_MAP_KEY;
  lastFirmsFailure = null;
  if (!mapKey) {
    lastFirmsFailure = "FIRMS_MAP_KEY is not visible to the Worker";
    return null;
  }
  // Ask for the two most recent days: today and yesterday (UTC).
  //
  // The URL carries NO date. FIRMS reads a date as the START of the window
  // ("Returns data for [DATE] .. [DATE + DAY_RANGE-1]"); without one it
  // returns "TODAY to TODAY - (DAY_RANGE-1)". The old /2/<today> asked for
  // today and tomorrow, so until NASA published the first pass of the new
  // UTC day — every Bangkok morning — the board read 0 detections while
  // NASA held 16 from the night before (seen 2026-10-05 12:28 BKK).
  //
  // FIRMS NRT is a near-real-time product with a publishing delay of a few
  // hours, and the request is anchored to UTC while the province runs on
  // UTC+7. Requesting /1/<today> therefore returns a valid, EMPTY body for
  // much of the day — which this module cannot distinguish from "there are
  // genuinely no fires". On a haze board that reads as a clean sky, which
  // is the most dangerous failure available: it is a false all-clear
  // produced by a clock, not by data. Two days costs one extra row and
  // removes most of that window.
  const box = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
  // Last status seen, so a failure that is not the key (HTTP 429, a
  // network error) is distinguishable from "key not visible" downstream.
  let lastStatus = 0;
  // A typed binding: narrowing `mapKey` across a loop with `continue` in
  // its catch sends TypeScript's flow analysis in a circle (TS7022).
  const key: string = mapKey;
  const answered: FireHotspot[] = [];
  let anyAnswered = false;
  for (const source of FIRMS_SOURCES) {
    const url = `${FIRMS_BASE}/${key}/${source}/${box}/${FIRMS_WINDOW_DAYS}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      lastStatus = res.status;
      // 400 with "Invalid MAP_KEY" is a KEY failure and applies to every
      // source, so stop immediately rather than burning the quota.
      // 429 is a quota failure, also key-wide. Both fall back to scenario
      // rather than render as "0 fires, live".
      if (!res.ok) {
        if (res.status === 400 || res.status === 401 || res.status === 429) {
          // Include FIRMS's own wording. It is the only thing that tells a
          // mistyped key apart from an exhausted quota — NASA answers
          // "Invalid MAP_KEY." for a 400, but its mapkey_status page uses
          // "invalid or you have exceeded your transaction/time limit" for
          // both, so the status code alone cannot separate them. The body
          // is a fixed phrase with no key material in it, so it is safe to
          // surface verbatim.
          let detail = "";
          try {
            const body = (await res.text()).trim();
            if (body && body.length <= 120 && !body.includes(key)) detail = `: ${body}`;
          } catch {
            // Body already consumed or unreadable; the status is enough.
          }
          lastFirmsFailure = `FIRMS answered HTTP ${res.status}${detail}`;
          return null;
        }
        continue; // this archive is unusable; try the next one
      }
      const csv = await res.text();
      if (csv.trimStart().startsWith("Invalid MAP_KEY")) {
        lastFirmsFailure = "FIRMS rejected the MAP_KEY";
        return null;
      }
      if (csv.trimStart().startsWith("Invalid source")) {
        // This archive name is retired. Try the next; do not report it as
        // a failure yet, another source may be serving normally.
        continue;
      }
      if (!csv.trim() || csv.trimStart().startsWith("<")) {
        lastFirmsFailure = csv.trim() ? "FIRMS returned an HTML page, not CSV" : "FIRMS returned an empty body";
        continue;
      }
      // FIRMS answers some over-quota paths with a bare string in the body
      // and a 200, so guard the content explicitly.
      if (csv.trimStart().startsWith("-1")) {
        lastFirmsFailure = "FIRMS rejected the request: -1 (no data / quota)";
        return null;
      }
      // Keep going: each archive is a different satellite (S-NPP, NOAA-20,
      // NOAA-21) passing at a different time. Returning the first one that
      // answered showed 0 fires on 2026-10-03 while NOAA-20/21 had 16
      // detections in the box from passes that afternoon.
      answered.push(...finishLivePass(csv, bbox));
      anyAnswered = true;
      continue;
    } catch (e) {
      lastStatus = 0;
      lastFirmsFailure = `FIRMS request failed: ${(e as Error).message}`;
      // One satellite's archive timing out must not discard the others'.
      if (anyAnswered) continue;
      return null;
    }
  }
  if (anyAnswered) return answered;
  // Every archive refused. If none of them answered with a status at all,
  // this is a network problem; otherwise the sources themselves are gone.
  lastFirmsFailure =
    lastFirmsFailure ??
    (lastStatus === 0
      ? "FIRMS did not answer for any known NRT archive"
      : "FIRMS: every known NRT archive was refused (they may have been retired)");
  return null;
}

/** Parse a successful CSV body into the three outcomes, including the
 *  24 h reporting cutoff that separates "the pass answered" from "the pass
 *  is published". */
function finishLivePass(csv: string, bbox: { west: number; south: number; east: number; north: number }): FireHotspot[] {
  const rows = parseFirmsCsv(csv, bbox);
  // A valid CSV with zero rows is an ANSWER, not a missing pass. The
  // window is two days, so yesterday's passes are already published even
  // when today's are not; "header only" therefore means no VIIRS
  // detection in ~48 h of published passes — the normal state for the
  // whole wet season (May–Oct). Treating it as unknown made the board say
  // "key missing, or NASA did not answer" for months while NASA was
  // answering clearly (verified 2026-09-30: NASA's keyless 48 h SE-Asia
  // file had 0 detections in the CNX bbox while this path read
  // "scenario"). Unknown is reserved for real failures: no key, HTTP
  // error, rejected key, over quota. Cloud can still hide fires — the
  // panel says so; that caveat applies to every pass, zero or not.
  if (rows.length === 0) return [];

  const cutoff = Date.now() - FIRMS_REPORT_HOURS * 3_600_000;
  return rows.filter((h) => {
    const t = Date.parse(h.detectedAt);
    return Number.isFinite(t) && t >= cutoff;
  });
}

async function fetchLiveFirms(): Promise<FireHotspot[] | null> {
  return fetchFirmsInBbox(CNX_FIRMS_BBOX);
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
    const source = firmsSource() ?? undefined;
    const response: CnxFiresResponse = {
      generatedAt: now,
      hotspots: live,
      totalCount: live.length,
      provinceCount: live.filter((h) => inChiangMaiProvince(h.longitude, h.latitude)).length,
      provenance: "live",
      liveSource: source,
      // Still say why the keyed API was skipped, so a rejected key stays visible.
      liveFailure: source === "open-24h" ? firmsFailureReason() ?? undefined : undefined,
    };
    cache = { at: Date.now(), data: response };
    return response;
  }
  const scenario = { ...buildScenario(now), liveFailure: firmsFailureReason() ?? undefined };
  cache = { at: Date.now(), data: scenario };
  return scenario;
}
