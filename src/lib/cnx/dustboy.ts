// CNX DustBoy ingest — CMU Climate Change Data Center (CMU CCDC)
// ground PM2.5 sensor network, dense coverage across Chiang Mai and
// the upper northern provinces.
//
// Why DustBoy is the keystone for Chiang Mai haze:
//   - Hundreds of low-cost sensors across CNX + Chiang Rai + Lamphun +
//     Lampang + Mae Hong Son — density no other network matches
//   - Hourly readings, published within minutes
//   - Open API at https://open-api.cmuccdc.org/ with Bearer token after
//     registration (https://www.cmuccdc.org — public/researchers/gov tiers)
//   - Cross-validates satellite PM estimates (GISTDA) and Open-Meteo CAMS
//     — the three together give a defensible basin-average
//
// Honest-data shape:
//   - With token: live readings per station + summary stats
//   - Without token: returns null + provenance="needs-key", panel renders
//     a "needs API key" chip honestly — never fabricates CMU sensor data
//
// Endpoints probed 2026-09-28 (all 403 = token-gated, none anonymous):
//   - GET /api/dustboy/getLatest  (live readings)
//   - GET /api/dustboy/getStation (station metadata)
//
// Cache: 10 min in-process. Readings move slowly enough that more frequent
// polls just hammer the upstream; the upstream itself publishes hourly.

import type { SeverityLevel } from "../../types/cnx";

const DUSTBOY_BASE = "https://open-api.cmuccdc.org";

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
  };
  /** Provenance — "live" with key, "needs-key" without, "scenario" otherwise. */
  provenance: "live" | "needs-key" | "scenario";
  /** Honest message about why there's no live data (only set when provenance != live). */
  note: string | null;
}

const UPPER_NORTH_PROVINCES = new Set([
  "เชียงใหม่", // Chiang Mai
  "เชียงราย", // Chiang Rai
  "ลำพูน", // Lamphun
  "ลำปาง", // Lampang
  "แม่ฮ่องสอน", // Mae Hong Son
  "พะเยา", // Phayao
  "แพร่", // Phrae
  "น่าน", // Nan
]);

function severityForPm25(pm: number | null): SeverityLevel {
  if (pm === null) return "good";
  if (pm < 25) return "good";
  if (pm < 50) return "watch";
  if (pm < 90) return "alert";
  return "critical";
}

interface DustboyRawStation {
  station_id?: string;
  station_name?: string;
  station_name_th?: string;
  amphoe?: string;
  district?: string;
  province?: string;
  changwat?: string;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  pm25?: number | null;
  pm25_value?: number | null;
  pm25_avg?: number | null;
  /** ISO timestamp of the latest reading. */
  reading_at?: string;
  updated_at?: string;
  timestamp?: string;
}

interface DustboyRawResponse {
  data?: DustboyRawStation[];
  stations?: DustboyRawStation[];
  result?: DustboyRawStation[];
}

function normaliseStation(raw: DustboyRawStation): DustboyStation | null {
  const lat = typeof raw.latitude === "number" ? raw.latitude : typeof raw.lat === "number" ? raw.lat : null;
  const lng = typeof raw.longitude === "number" ? raw.longitude : typeof raw.lng === "number" ? raw.lng : null;
  if (lat === null || lng === null) return null;
  const province = raw.province ?? raw.changwat ?? "";
  // Filter to upper-northern provinces only (the basin CNX covers).
  if (province && !UPPER_NORTH_PROVINCES.has(province)) return null;
  const pmRaw = raw.pm25 ?? raw.pm25_value ?? raw.pm25_avg ?? null;
  const pm = typeof pmRaw === "number" && Number.isFinite(pmRaw) ? Math.round(pmRaw * 10) / 10 : null;
  const observedAt = raw.reading_at ?? raw.updated_at ?? raw.timestamp ?? new Date().toISOString();
  const readingAgeMs = Date.now() - new Date(observedAt).getTime();
  const readingAgeHours = Number.isFinite(readingAgeMs) ? Math.max(0, Math.round(readingAgeMs / 3_600_000)) : null;
  return {
    stationId: raw.station_id ?? "",
    nameTh: raw.station_name_th ?? raw.station_name ?? "",
    district: raw.amphoe ?? raw.district ?? "",
    province,
    longitude: lng,
    latitude: lat,
    pm25: pm,
    readingAgeHours,
    severity: severityForPm25(pm),
    observedAt,
  };
}

async function fetchLiveDustboy(): Promise<DustboyStation[] | null> {
  const token = process.env.DUSTBOY_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${DUSTBOY_BASE}/api/dustboy/getLatest`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      console.warn(`[dustboy] upstream ${res.status}`);
      return null;
    }
    const json = (await res.json()) as DustboyRawResponse;
    const raw = json.data ?? json.stations ?? json.result ?? [];
    const out: DustboyStation[] = [];
    for (const r of raw) {
      const s = normaliseStation(r);
      if (s && s.stationId) out.push(s);
    }
    return out;
  } catch (e) {
    console.warn(`[dustboy] fetch failed: ${(e as Error).message}`);
    return null;
  }
}

function buildBasin(stations: DustboyStation[]): DustboyResponse["basin"] {
  const online = stations.filter((s) => s.pm25 !== null);
  if (online.length === 0) {
    return {
      stationCount: stations.length,
      onlineCount: 0,
      avgPm25: null,
      maxPm25: null,
      worstProvince: null,
      worstDistrict: null,
    };
  }
  let avgSum = 0;
  let maxPm = 0;
  let maxStation: DustboyStation | null = null;
  for (const s of online) {
    if (s.pm25 === null) continue;
    avgSum += s.pm25;
    if (s.pm25 > maxPm) {
      maxPm = s.pm25;
      maxStation = s;
    }
  }
  return {
    stationCount: stations.length,
    onlineCount: online.length,
    avgPm25: Math.round((avgSum / online.length) * 10) / 10,
    maxPm25: maxPm,
    worstProvince: maxStation?.province ?? null,
    worstDistrict: maxStation?.district ?? null,
  };
}

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
      basin: buildBasin(live),
      provenance: "live",
      note: null,
    };
    cache = { at: Date.now(), data };
    return data;
  }
  // Honest-data fallback: no token = no live data, but the operator
  // should see the basin skeleton (zero stations) with a clear note
  // rather than fabricated readings. This is the documented "needs key"
  // surface — when the operator provisions DUSTBOY_TOKEN, this module
  // upgrades to provenance="live" automatically.
  const hasToken = !!process.env.DUSTBOY_TOKEN;
  const data: DustboyResponse = {
    generatedAt: now,
    stations: [],
    basin: {
      stationCount: 0,
      onlineCount: 0,
      avgPm25: null,
      maxPm25: null,
      worstProvince: null,
      worstDistrict: null,
    },
    provenance: hasToken ? "scenario" : "needs-key",
    note: hasToken
      ? "DUSTBOY_TOKEN is set but the upstream returned no stations — check token scope or upstream status."
      : "DUSTBOY_TOKEN is not set. Provision a free API key at https://www.cmuccdc.org to light up the basin-wide PM2.5 ground sensor network.",
  };
  cache = { at: Date.now(), data };
  return data;
}
