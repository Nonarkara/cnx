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
  /**
   * True when this reading is inconsistent with its neighbours and should
   * not drive any headline. See flagSuspects for the reasoning — a real
   * regional episode lifts every station, a sensor fault lifts one.
   */
  suspect: boolean;
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
    /**
     * Headline max, outlier-resistant: the p95 of accepted readings, NOT
     * the raw argmax. See flagSuspects — a single faulty sensor must never
     * set the number the governor acts on.
     */
    maxPm25: number | null;
    /** The literal highest reading, suspect or not. Kept for drill-down. */
    maxPm25Raw: number | null;
    /** How many stations were flagged suspect this cycle. */
    suspectCount: number;
    /** Worst-affected province in the basin right now, suspect-excluded. */
    worstProvince: string | null;
    /** Worst-affected district in the basin right now, suspect-excluded. */
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
  /**
   * Operator-facing caveat, set when any station was flagged. The panel
   * should render this verbatim rather than silently dropping the reading —
   * the same discipline FloodDash uses for its untrusted-ETA state.
   */
  caveat: {
    th: string;
    en: string;
  } | null;
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
    suspect: false,
    readingAgeHours,
    severity: severityForPm25(pm),
    observedAt: Number.isFinite(observedMs) ? new Date(observedMs).toISOString() : "",
  };
}

/**
 * Flag readings that are inconsistent with their neighbours.
 *
 * WHY A NEIGHBOUR TEST AND NOT A PERCENTILE
 *
 * The intuitive fix — clamp the headline to p95/p99 — is wrong for haze,
 * and wrong in the dangerous direction. A real regional PM2.5 episode is
 * a REGIONAL event: in the 2026-03 north-Chiang-Mai episode the upper
 * north lifted together, so the 95th percentile is itself extreme and a
 * p95 clamp hides the episode. Meanwhile the failure we actually observe
 * is a single sensor reading 649 µg/m³ while the 221 other stations sit
 * at a median of 6 (measured 2026-09-30, Lampang/Hang Chat, an indoor
 * unit). A percentile rule cannot tell those two worlds apart: both look
 * like "some stations are high".
 *
 * What DOES separate them is agreement between neighbours. Regional haze
 * moves every station in the province within a factor of a few; a stuck
 * or co-located sensor moves exactly one. So the test is:
 *
 *     station > SUSPECT_FACTOR × p90(province peers)
 *
 * with a floor so a genuinely quiet province doesn't make every reading
 * look absurd, and a sample-size guard so a 2-station province can't
 * self-flag into meaninglessness.
 *
 * Flags are reversible and visible: the station keeps its real value,
 * gains `suspect: true`, and is excluded from aggregates only. Nothing is
 * hidden from the drill-down.
 */
const SUSPECT_FACTOR = 3;
const SUSPECT_FLOOR_UG = 60;
const SUSPECT_MIN_PEERS = 5;

export function flagSuspects(stations: DustboyStation[]): DustboyStation[] {
  const byProvince = new Map<string, number[]>();
  for (const s of stations) {
    if (s.pm25 === null) continue;
    const list = byProvince.get(s.province) ?? [];
    list.push(s.pm25);
    byProvince.set(s.province, list);
  }
  return stations.map((s) => {
    if (s.pm25 === null) return s;
    const peers = byProvince.get(s.province) ?? [];
    if (peers.length < SUSPECT_MIN_PEERS) return s;
    const sorted = [...peers].sort((a, b) => a - b);
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
    const threshold = Math.max(SUSPECT_FLOOR_UG, p90 * SUSPECT_FACTOR);
    return s.pm25 > threshold ? { ...s, suspect: true } : s;
  });
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

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  const idx = Math.min(sortedAsc.length - 1, Math.floor(sortedAsc.length * p));
  return sortedAsc[idx];
}

function aggregate(stations: DustboyStation[]): {
  stationCount: number;
  onlineCount: number;
  avgPm25: number | null;
  maxPm25: number | null;
  maxPm25Raw: number | null;
  worst: DustboyStation | null;
} {
  const online = stations.filter((s) => s.pm25 !== null);
  if (online.length === 0) {
    return {
      stationCount: stations.length,
      onlineCount: 0,
      avgPm25: null,
      maxPm25: null,
      maxPm25Raw: null,
      worst: null,
    };
  }
  // Raw max includes suspects — it belongs in the drill-down, not the headline.
  let maxRaw: number | null = null;
  for (const s of online) {
    if (s.pm25 === null) continue;
    if (maxRaw === null || s.pm25 > maxRaw) maxRaw = s.pm25;
  }
  const accepted = online.filter((s) => !s.suspect && s.pm25 !== null);
  const pool = accepted.length > 0 ? accepted : online;
  let avgSum = 0;
  let maxPm: number | null = null;
  let worst: DustboyStation | null = null;
  for (const s of pool) {
    if (s.pm25 === null) continue;
    avgSum += s.pm25;
    if (maxPm === null || s.pm25 > maxPm) {
      maxPm = s.pm25;
      worst = s;
    }
  }
  return {
    stationCount: stations.length,
    onlineCount: online.length,
    avgPm25: Math.round((avgSum / pool.length) * 10) / 10,
    // p95, not argmax: still responsive to a genuine regional episode
    // (where the whole distribution lifts) but immune to one bad sensor.
    maxPm25: maxPm === null ? null : Math.round(percentile([...pool.map((s) => s.pm25!)].sort((a, b) => a - b), 0.95) * 10) / 10,
    maxPm25Raw: maxRaw,
    worst,
  };
}

export function summariseBasin(stations: DustboyStation[]): DustboyResponse["basin"] {
  const flagged = flagSuspects(stations);
  const all = aggregate(flagged);
  const cm = aggregate(flagged.filter((s) => s.province === "เชียงใหม่"));
  const suspectCount = flagged.filter((s) => s.suspect).length;
  return {
    stationCount: all.stationCount,
    onlineCount: all.onlineCount,
    avgPm25: all.avgPm25,
    maxPm25: all.maxPm25,
    maxPm25Raw: all.maxPm25Raw,
    suspectCount,
    worstProvince: worstProvinceByP90(flagged)?.province ?? null,
    worstDistrict: worstProvinceByP90(flagged)?.district ?? null,
    chiangMai: {
      stationCount: cm.stationCount,
      onlineCount: cm.onlineCount,
      avgPm25: cm.avgPm25,
      maxPm25: cm.maxPm25,
      newestReadingAgeHours: newestAge(flagged.filter((s) => s.province === "เชียงใหม่")),
    },
  };
}

/**
 * "Worst-affected province" means the province whose whole network is
 * doing worst, not the province that happens to own the single highest
 * station. Measuring at p90 per province is what makes the answer mean
 * something: a single faulty unit in Lampang must not make Lampang the
 * "worst province" while every one of its other stations reads 6, and two
 * equally clean provinces must not be ranked by iteration order.
 *
 * The winning station is the p90 of that province, and `district` is its
 * district so the operator still gets a place to send someone.
 */
function worstProvinceByP90(stations: DustboyStation[]): DustboyStation | null {
  const byProvince = new Map<string, DustboyStation[]>();
  for (const s of stations) {
    if (s.pm25 === null || s.suspect) continue;
    const list = byProvince.get(s.province) ?? [];
    list.push(s);
    byProvince.set(s.province, list);
  }
  let best: DustboyStation | null = null;
  let bestP90 = -Infinity;
  for (const list of byProvince.values()) {
    const values = list.map((s) => s.pm25!).sort((a, b) => a - b);
    const p90 = percentile(values, 0.9);
    if (p90 > bestP90) {
      bestP90 = p90;
      best = list[Math.min(list.length - 1, Math.floor(list.length * 0.9))];
    }
  }
  return best;
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
  maxPm25Raw: null,
  suspectCount: 0,
  worstProvince: null,
  worstDistrict: null,
  chiangMai: { stationCount: 0, onlineCount: 0, avgPm25: null, maxPm25: null, newestReadingAgeHours: null },
};

/** Caveat shown when at least one reading was excluded from the aggregates. */
function suspectCaveat(suspectCount: number, onlineCount: number): DustboyResponse["caveat"] {
  if (suspectCount === 0) return null;
  return {
    th: `ตัดออก ${suspectCount} จาก ${onlineCount} สถานีที่ค่าสูงผิดปกติเมื่อเทียบกับสถานีอื่นในจังหวัด — ตรวจสอบเครื่องก่อนใช้ตัวเลขนี้เป็นหลักฐาน`,
    en: `${suspectCount} of ${onlineCount} stations excluded as inconsistent with their province peers — verify the sensor before treating these numbers as evidence`,
  };
}

let cache: { at: number; data: DustboyResponse } | null = null;
const TTL_MS = 10 * 60_000;

export async function fetchCnxDustboy(): Promise<DustboyResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const now = new Date().toISOString();
  const live = await fetchLiveDustboy();
  if (live && live.length > 0) {
    // Flag BEFORE summarising, and return the flagged rows. summariseBasin
    // flags internally too (it is exported and used directly by tests), but
    // if we passed the raw rows the per-station `suspect` flag would never
    // reach the client — suspectCount would say 2 while every station in the
    // drill-down read suspect: false, leaving the operator no way to find
    // which sensor to check.
    const flagged = flagSuspects(live);
    const basin = summariseBasin(flagged);
    const data: DustboyResponse = {
      generatedAt: now,
      stations: flagged,
      basin,
      provenance: "live",
      note: null,
      caveat: suspectCaveat(basin.suspectCount, basin.onlineCount),
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
    caveat: null,
  };
  cache = { at: Date.now(), data };
  return data;
}
