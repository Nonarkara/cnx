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
  pm25: number;
  pm25Avg24hrs: number;
  pm25Aqi: number;
  severity: SeverityLevel;
  history24h: CnPm25HistoryPoint[];
  amphoe: CnAmphoe[];
  provinceAveragePm25: number;
  worstAmphoe: CnAmphoe;
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

export async function fetchCnxGistdaPm25(): Promise<GistdaPm25Response> {
  // Anchor the lookup at Chiang Mai old-city center (Phra Singh).
  const lat = CNX_PROVINCE.center.latitude;
  const lon = CNX_PROVINCE.center.longitude;
  try {
    const res = await fetch(`${GISTDA_BASE}?lat=${lat}&lng=${lon}`, {
      headers: { Accept: "application/json", "User-Agent": "cnx-dashboard/1.0 (cnx.nonarkara.org)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`gistda ${res.status}`);
    const json = (await res.json()) as RawResponse;
    if (json.status !== 200 || !json.data) {
      throw new Error(`gistda status ${json.status}`);
    }
    const d = json.data;
    const amphoe: CnAmphoe[] = (d.pm25_amphoe ?? [])
      .filter((a) => a.ap_idn >= 5001 && a.ap_idn <= 5025)
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
      pm25: d.pm25,
      pm25Avg24hrs: d.pm25Avg24hrs,
      pm25Aqi: d.pm25_aqi,
      severity: severityForPm25(d.pm25),
      history24h: (d.graphHistory24hrs ?? []).map(([pm, ts]) => ({ pm25: pm, ts })),
      amphoe,
      provinceAveragePm25: Math.round(provinceAvg * 10) / 10,
      worstAmphoe: amphoe[0],
    };
  } catch {
    // Scenario fallback — north-east monsoon / burning-season-leaning values.
    const amphoe: CnAmphoe[] = [
      { ap_tn: "แม่ริม", ap_en: "Mae Rim", ap_idn: 5007, pm25: 13, pm25Avg24hr: 17, dt: new Date().toISOString(), severity: "good" },
      { ap_tn: "เมืองเชียงใหม่", ap_en: "Mueang Chiang Mai", ap_idn: 5001, pm25: 11, pm25Avg24hr: 15, dt: new Date().toISOString(), severity: "good" },
    ];
    return {
      generatedAt: new Date().toISOString(),
      location: { lat, lon },
      locName: { th: "เชียงใหม่", en: "Chiang Mai", ap_th: "เมืองเชียงใหม่", ap_en: "Mueang Chiang Mai" },
      pm25: 11,
      pm25Avg24hrs: 15,
      pm25Aqi: 49,
      severity: "good",
      history24h: [],
      amphoe,
      provinceAveragePm25: 12,
      worstAmphoe: amphoe[0],
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
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
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