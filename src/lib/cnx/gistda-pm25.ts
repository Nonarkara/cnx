// CNX PM2.5 — GISTDA / Longdo map.longdo.com endpoint.
//
// Single endpoint, parameterised by lat/lng, returns a single
// location's PM2.5 (current + 24h avg) plus the province-wide
// `pm25_amphoe` array — every district's current PM2.5 + 24-hour
// average in one call. This is the primary "AQI by district" feed
// the dashboard uses.
//
// The amphoe array is the keystone: the dashboard renders a row per
// amphoe with the colour-ramped PM2.5 + 24h trend, so the governor
// sees "which district is haze-affected today" at a glance.
//
// China-side AQI (aqicn.org) is also proxied here for the same lat/lng
// via the pm25_cn endpoint. Both endpoints are free, no auth.

import { CNX_PROVINCE } from "./config";
import type { SeverityLevel } from "../../types/cnx";

const GISTDA_BASE = "https://map.longdo.com/ws/etc/gistda_pm25_by_location";
const CN_AQI_BASE = "https://map.longdo.com/getaqicn.php";

function severityForPm25(pm: number): SeverityLevel {
  if (pm < 25) return "good";
  if (pm < 50) return "watch";
  if (pm < 90) return "alert";
  return "critical";
}

export interface CnAmphoe {
  /** Thai name, e.g. แม่ริม */
  ap_tn: string;
  /** English / romanised name, e.g. Mae Rim */
  ap_en: string;
  /** CNX amphoe ID 5001–5025 */
  ap_idn: number;
  /** Current PM2.5 µg/m³ */
  pm25: number;
  /** 24-hour rolling average PM2.5 µg/m³ */
  pm25Avg24hr: number;
  /** ISO time the reading was issued */
  dt: string;
  /** Severity colour band derived from current PM2.5 */
  severity: SeverityLevel;
}

export interface CnPm25HistoryPoint {
  pm25: number;
  ts: string;
}

export interface GistdaPm25Response {
  generatedAt: string;
  location: { lat: number; lon: number };
  locName: { th: string; en: string; ap_th: string; ap_en: string };
  provenance: "live" | "unavailable";
  provenanceNote: string | null;
  observedAt: string | null;
  pm25: number | null;
  pm25Avg24hrs: number | null;
  pm25Aqi: number | null;
  severity: SeverityLevel;
  history24h: CnPm25HistoryPoint[];
  amphoe: CnAmphoe[];
  provinceAveragePm25: number | null;
  worstAmphoe: CnAmphoe | null;
}

interface RawData {
  pm25: number;
  pm25Avg24hrs: number;
  pm25_aqi: number;
  graphHistory24hrs: [number, string][];
  loc: { loctext: string; loctext_en: string; ap_tn: string; ap_en: string };
  pm25_amphoe: {
    ap_tn: string;
    ap_en: string;
    ap_idn: number;
    pm25: number;
    pm25Avg24hr: number;
    dt: string;
  }[];
}

interface RawResponse {
  status: number;
  data?: RawData;
}

function validPm(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// An unzoned publisher timestamp is not enough to infer an observation age.
function observationTime(value: unknown): string | null {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) && at <= Date.now() + 5 * 60_000 ? new Date(at).toISOString() : null;
}

export async function fetchCnxGistdaPm25(fetchImpl: typeof fetch = fetch): Promise<GistdaPm25Response> {
  // Anchor the lookup at Chiang Mai old-city center (Phra Singh).
  const lat = CNX_PROVINCE.center.latitude;
  const lon = CNX_PROVINCE.center.longitude;
  try {
    const res = await fetchImpl(`${GISTDA_BASE}?lat=${lat}&lng=${lon}`, {
      headers: { Accept: "application/json", "User-Agent": "cnx-dashboard/1.0 (cnx.nonarkara.org)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`gistda ${res.status}`);
    const json = (await res.json()) as RawResponse;
    if (json.status !== 200 || !json.data) {
      throw new Error(`gistda status ${json.status}`);
    }
    const d = json.data;
    if (!validPm(d.pm25) || !d.loc) throw new Error("GISTDA reading missing or invalid");
    const history24h = (d.graphHistory24hrs ?? [])
      .filter(([pm]) => validPm(pm))
      .map(([pm25, ts]) => ({ pm25, ts }));
    const observationTimes = history24h.map((p) => observationTime(p.ts)).filter((t): t is string => t !== null).sort();
    const amphoe: CnAmphoe[] = (d.pm25_amphoe ?? [])
      .filter((a) => a.ap_idn >= 5001 && a.ap_idn <= 5025 && validPm(a.pm25) && validPm(a.pm25Avg24hr))
      .map((a) => ({
        ap_tn: a.ap_tn,
        ap_en: a.ap_en,
        ap_idn: a.ap_idn,
        pm25: a.pm25,
        pm25Avg24hr: a.pm25Avg24hr,
        dt: a.dt,
        severity: severityForPm25(a.pm25),
      }))
      .sort((a, b) => b.pm25 - a.pm25);
    const provinceAvg =
      amphoe.reduce((a, x) => a + x.pm25, 0) / Math.max(1, amphoe.length);
    return {
      generatedAt: new Date().toISOString(),
      location: { lat, lon },
      locName: {
        th: d.loc.loctext,
        en: d.loc.loctext_en,
        ap_th: d.loc.ap_tn,
        ap_en: d.loc.ap_en,
      },
      provenance: "live",
      provenanceNote: null,
      observedAt: observationTimes.at(-1) ?? null,
      pm25: d.pm25,
      pm25Avg24hrs: validPm(d.pm25Avg24hrs) ? d.pm25Avg24hrs : null,
      pm25Aqi: validPm(d.pm25_aqi) ? d.pm25_aqi : null,
      severity: severityForPm25(d.pm25),
      history24h,
      amphoe,
      provinceAveragePm25: amphoe.length ? Math.round(provinceAvg * 10) / 10 : null,
      worstAmphoe: amphoe[0] ?? null,
    };
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      location: { lat, lon },
      locName: { th: "เชียงใหม่", en: "Chiang Mai", ap_th: "เมืองเชียงใหม่", ap_en: "Mueang Chiang Mai" },
      provenance: "unavailable",
      provenanceNote: "GISTDA district air readings are unavailable. Check the current DustBoy sensors or Air4Thai; missing readings are not an all-clear.",
      observedAt: null,
      pm25: null,
      pm25Avg24hrs: null,
      pm25Aqi: null,
      severity: "unknown",
      history24h: [],
      amphoe: [],
      provinceAveragePm25: null,
      worstAmphoe: null,
    };
  }
}

/** Province-wide CN AQI (aqicn.org) for the same lat/lng — useful
 *  for cross-checking the GISTDA reading against the Chinese AQI
 *  network when imported data is suspected. */
export async function fetchCnxCnAqi(): Promise<{
  center: { lat: number; lon: number; aqi?: number; pm25?: number };
  bbox: { lat: number; lon: number; aqi?: number; pm25?: number }[];
}> {
  const url = new URL(CN_AQI_BASE);
  url.searchParams.set("locale", "th");
  url.searchParams.set("minlat", String(CNX_PROVINCE.bbox.south));
  url.searchParams.set("maxlat", String(CNX_PROVINCE.bbox.north));
  url.searchParams.set("minlon", String(CNX_PROVINCE.bbox.west));
  url.searchParams.set("maxlon", String(CNX_PROVINCE.bbox.east));
  try {
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return { center: { lat: CNX_PROVINCE.center.latitude, lon: CNX_PROVINCE.center.longitude }, bbox: [] };
    const json = (await res.json()) as { result?: { id: string; location: { lat: string; lon: string }; aqi_value?: string; pm25?: string }[] };
    const points = (json.result ?? []).map((r) => ({
      lat: parseFloat(r.location.lat),
      lon: parseFloat(r.location.lon),
      aqi: r.aqi_value ? parseFloat(r.aqi_value) : undefined,
      pm25: r.pm25 ? parseFloat(r.pm25) : undefined,
    }));
    const center = points.find(
      (p) =>
        Math.abs(p.lat - CNX_PROVINCE.center.latitude) < 0.1 &&
        Math.abs(p.lon - CNX_PROVINCE.center.longitude) < 0.1,
    ) ?? points[0];
    return { center: { lat: center?.lat ?? CNX_PROVINCE.center.latitude, lon: center?.lon ?? CNX_PROVINCE.center.longitude, aqi: center?.aqi, pm25: center?.pm25 }, bbox: points };
  } catch {
    return { center: { lat: CNX_PROVINCE.center.latitude, lon: CNX_PROVINCE.center.longitude }, bbox: [] };
  }
}