// CNX DustBoy ingest — CMU Climate Change Data Center (CMU CCDC)
// ground PM2.5 sensor network, dense coverage across Chiang Mai and
// the upper northern provinces.
//
// Source: the public, keyless feed behind CMU CCDC's DustBoy web app
// (www-old.cmuccdc.org/assets/api/haze/pwa/json/stations.json) — ~400
// stations with hourly PM2.5 and province code. No API key: the report's
// "provision DUSTBOY_TOKEN" step is unnecessary, that variable is not
// read anywhere.
// The newer open-api.cmuccdc.org returns 403 without a token, and the
// /api/ccdc/stations list carries caretakers' names and phone numbers,
// so neither is used. Readings older than STALE_HOURS count as offline.
//
// Honest-data shape: "live" when the feed answered; otherwise "scenario"
// with an empty basin and a note — never fabricated sensor values.
//
// Cache: 10 min in-process; the upstream publishes hourly.

import type { SeverityLevel } from "../../types/cnx";

const DUSTBOY_FEED = "https://www-old.cmuccdc.org/assets/api/haze/pwa/json/stations.json";
const STALE_HOURS = 3;

/** Thai province code → name, upper-north basin only. */
const UPPER_NORTH_PROVINCES: Record<string, string> = {
  "50": "เชียงใหม่",
  "51": "ลำพูน",
  "52": "ลำปาง",
  "54": "แพร่",
  "55": "น่าน",
  "56": "พะเยา",
  "57": "เชียงราย",
  "58": "แม่ฮ่องสอน",
};

export interface DustboyStation {
  /** CMU CCDC station id (e.g. "35tH") */
  stationId: string;
  /** Thai station name. */
  nameTh: string;
  /** District (amphoe). */
  district: string;
  /** Province (changwat). */
  province: string;
  longitude: number;
  latitude: number;
  /** Live PM2.5 µg/m³. null when sensor is offline or stale. */
  pm25: number | null;
  /** Reading age in hours. null when unknown. */
  readingAgeHours: number | null;
  severity: SeverityLevel;
  observedAt: string;
}

export interface DustboyResponse {
  generatedAt: string;
  /** All CMU CCDC stations with a reading in CNX or the upper-north basin. */
  stations: DustboyStation[];
  /** Aggregates for fast-reading — operator wants "what's the basin avg" first. */
  basin: {
    stationCount: number;
    onlineCount: number;
    avgPm25: number | null;
    maxPm25: number | null;
    /** Worst-affected province in the basin right now. */
    worstProvince: string | null;
    /** Worst-affected district in the basin right now. */
    worstDistrict: string | null;
    /** Chiang Mai province only — the number the city operator acts on.
     *  `avgPm25` above mixes in Chiang Rai, Mae Hong Son, and the rest. */
    chiangMai: {
      stationCount: number;
      onlineCount: number;
      avgPm25: number | null;
      maxPm25: number | null;
      /** Age of the newest Chiang Mai row, including stale ones. */
      newestReadingAgeHours: number | null;
    };
  };
  /** Provenance — "live" when the public feed answered, "scenario" otherwise. */
  provenance: "live" | "needs-key" | "scenario";
  /** Honest message about why there's no live data (only set when provenance != live). */
  note: string | null;
}


function severityForPm25(pm: number | null): SeverityLevel {
  if (pm === null) return "good";
  if (pm < 25) return "good";
  if (pm < 50) return "watch";
  if (pm < 90) return "alert";
  return "critical";
}

export interface DustboyRawStation {
  dustboy_uri?: string;
  dustboy_name?: string;
  dustboy_lat?: string | number;
  dustboy_lon?: string | number;
  pm25?: number | null;
  province_code?: string;
  /** UTC, "YYYY-MM-DD HH:mm:ss". The feed stamps in UTC even though the
   *  site is Bangkok-local — see parseLogDatetime for how this is known. */
  log_datetime?: string;
}

/**
 * Parse the feed's `log_datetime`.
 *
 * The field LOOKS Bangkok-local (the site is Thai and every other
 * timestamp on the page is +07:00), but it is UTC. Proven two ways
 * against the live feed on 2026-09-29:
 *   1. Every row carried `log_datetime: "2026-09-29 12:00:00"` while the
 *      response's own `Last-Modified` was `12:09:46 GMT` — the file is
 *      written 9 minutes after the stamp it contains, in the same clock.
 *      Read as Bangkok, the reading was 8 h old and the hourly feed looked
 *      7 h stale; read as UTC it is 1 h old, matching the hourly cadence.
 *   2. Reading it as +07:00 pushed every station past STALE_HOURS and
 *      blanked all 197 northern sensors to `pm25: null` — the panel
 *      reported "offline" while the upstream was healthy.
 *
 * Keep this as UTC. If the feed ever switches to local time, the hourly
 * cadence and the Last-Modified delta are the two signals that catch it.
 */
function parseLogDatetime(logDatetime: string): number {
  return Date.parse(`${logDatetime.replace(" ", "T")}Z`);
}

export function normaliseStation(raw: DustboyRawStation, nowMs = Date.now()): DustboyStation | null {
  const province = UPPER_NORTH_PROVINCES[raw.province_code ?? ""];
  if (!province) return null;
  const lat = Number(raw.dustboy_lat);
  const lng = Number(raw.dustboy_lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !raw.dustboy_uri) return null;
  const observedMs = raw.log_datetime ? parseLogDatetime(raw.log_datetime) : NaN;
  const readingAgeHours = Number.isFinite(observedMs) ? Math.max(0, Math.round((nowMs - observedMs) / 3_600_000)) : null;
  const fresh = readingAgeHours !== null && readingAgeHours <= STALE_HOURS;
  const pm = fresh && typeof raw.pm25 === "number" && Number.isFinite(raw.pm25) ? raw.pm25 : null;
  const name = raw.dustboy_name ?? "";
  return {
    stationId: raw.dustboy_uri,
    nameTh: name,
    district: /อ\.\s*([^\s]+)/.exec(name)?.[1] ?? "",
    province,
    longitude: lng,
    latitude: lat,
    pm25: pm,
    readingAgeHours,
    severity: severityForPm25(pm),
    observedAt: Number.isFinite(observedMs) ? new Date(observedMs).toISOString() : "",
  };
}

async function fetchLiveDustboy(): Promise<DustboyStation[] | null> {
  try {
    const res = await fetch(DUSTBOY_FEED, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      console.warn(`[dustboy] upstream ${res.status}`);
      return null;
    }
    const raw = (await res.json()) as DustboyRawStation[];
    if (!Array.isArray(raw)) return null;
    return raw.map((r) => normaliseStation(r)).filter((s): s is DustboyStation => s !== null);
  } catch (e) {
    console.warn(`[dustboy] fetch failed: ${(e as Error).message}`);
    return null;
  }
}

function aggregate(stations: DustboyStation[]): {
  stationCount: number;
  onlineCount: number;
  avgPm25: number | null;
  maxPm25: number | null;
  worst: DustboyStation | null;
} {
  const online = stations.filter((s) => s.pm25 !== null);
  if (online.length === 0) {
    return { stationCount: stations.length, onlineCount: 0, avgPm25: null, maxPm25: null, worst: null };
  }
  let avgSum = 0;
  let maxPm = 0;
  let worst: DustboyStation | null = null;
  for (const s of online) {
    if (s.pm25 === null) continue;
    avgSum += s.pm25;
    if (s.pm25 > maxPm) {
      maxPm = s.pm25;
      worst = s;
    }
  }
  return {
    stationCount: stations.length,
    onlineCount: online.length,
    avgPm25: Math.round((avgSum / online.length) * 10) / 10,
    maxPm25: maxPm,
    worst,
  };
}

export function summariseBasin(stations: DustboyStation[]): DustboyResponse["basin"] {
  const all = aggregate(stations);
  const cm = aggregate(stations.filter((s) => s.province === "เชียงใหม่"));
  return {
    stationCount: all.stationCount,
    onlineCount: all.onlineCount,
    avgPm25: all.avgPm25,
    maxPm25: all.maxPm25,
    worstProvince: all.worst?.province ?? null,
    worstDistrict: all.worst?.district ?? null,
    chiangMai: {
      stationCount: cm.stationCount,
      onlineCount: cm.onlineCount,
      avgPm25: cm.avgPm25,
      maxPm25: cm.maxPm25,
      newestReadingAgeHours: newestAge(stations.filter((s) => s.province === "เชียงใหม่")),
    },
  };
}

function newestAge(stations: DustboyStation[]): number | null {
  let best: number | null = null;
  for (const s of stations) {
    if (s.readingAgeHours === null) continue;
    if (best === null || s.readingAgeHours < best) best = s.readingAgeHours;
  }
  return best;
}

const EMPTY_BASIN: DustboyResponse["basin"] = {
  stationCount: 0,
  onlineCount: 0,
  avgPm25: null,
  maxPm25: null,
  worstProvince: null,
  worstDistrict: null,
  chiangMai: { stationCount: 0, onlineCount: 0, avgPm25: null, maxPm25: null, newestReadingAgeHours: null },
};

let cache: { at: number; data: DustboyResponse } | null = null;
const TTL_MS = 10 * 60_000;

export async function fetchCnxDustboy(): Promise<DustboyResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const now = new Date().toISOString();
  const live = await fetchLiveDustboy();
  if (live && live.length > 0) {
    const data: DustboyResponse = {
      generatedAt: now,
      stations: live,
      basin: summariseBasin(live),
      provenance: "live",
      note: null,
    };
    cache = { at: Date.now(), data };
    return data;
  }
  const data: DustboyResponse = {
    generatedAt: now,
    stations: [],
    basin: EMPTY_BASIN,
    provenance: "scenario",
    note: "CMU CCDC DustBoy feed did not answer — no ground PM2.5 readings this cycle.",
  };
  cache = { at: Date.now(), data };
  return data;
}
