// CNX air quality module.
//
// Live: Open-Meteo CAMS (Copernicus Atmosphere Monitoring Service)
// global air-quality forecast (free, no key). The /v1/air-quality
// endpoint gives PM2.5 / PM10 / O3 at hourly cadence; we pin to the
// last hourly reading per station.
//
// Burning-season watch metric: the fraction of stations with PM2.5
// above 50 µg/m³ (Thailand's "unhealthy" threshold) → provinceAvgAqiLevel.

import type { AirQualityResponse, AirStation, SeverityLevel, OfficeNotice } from "../../types/cnx";
import { CNX_PROVINCE } from "./config";

const OPEN_METEO_AQ = "https://air-quality-api.open-meteo.com/v1/air-quality";

// One model grid point at the city centre; it is not a monitoring station.
const MODEL_POINT = { stationId: "cm-city", name: "Chiang Mai city — CAMS model grid", longitude: 98.985, latitude: 18.788 };

function severityForPm25(pm: number): SeverityLevel {
  if (pm < 25) return "good";
  if (pm < 50) return "watch";
  if (pm < 90) return "alert";
  return "critical";
}

async function fetchOpenMeteo(): Promise<AirStation[] | null> {
  try {
    const s = MODEL_POINT;
    const url = `${OPEN_METEO_AQ}?latitude=${s.latitude}&longitude=${s.longitude}&hourly=pm10,pm2_5,ozone,nitrogen_dioxide&forecast_days=1&timezone=UTC&timeformat=unixtime`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      hourly?: { time?: number[]; pm2_5?: (number | null)[]; pm10?: (number | null)[]; ozone?: (number | null)[]; nitrogen_dioxide?: (number | null)[] };
    };
    const hourly = json.hourly;
    if (!hourly?.time?.length) return null;
    const now = Date.now();
    // Forecast arrays include future hours: only the latest current/past hour
    // can stand in for current conditions, and only for three hours.
    let index = -1;
    for (let i = 0; i < hourly.time.length; i += 1) {
      const t = hourly.time[i] * 1000;
      if (Number.isFinite(t) && t <= now && now - t <= AIR4THAI_STALE_MS && (index < 0 || t > hourly.time[index] * 1000)) index = i;
    }
    if (index < 0) return null;
    const valid = (v: number | null | undefined): number | undefined => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
    const pm25 = valid(hourly.pm2_5?.[index]);
    if (pm25 === undefined) return null;
    return [{ ...s, pm25, pm10: valid(hourly.pm10?.[index]), o3: valid(hourly.ozone?.[index]), no2: valid(hourly.nitrogen_dioxide?.[index]), source: "open-meteo", observedAt: new Date(hourly.time[index] * 1000).toISOString(), aqiLevel: severityForPm25(pm25) }];
  } catch {
    return null;
  }
}

const AIR4THAI = "https://air4thai.pcd.go.th/services/getNewAQI_JSON.php";
/** Air4Thai reports hourly; older readings are treated as offline. */
const AIR4THAI_STALE_MS = 3 * 60 * 60_000;

interface Air4ThaiStation {
  stationID?: string;
  nameEN?: string;
  nameTH?: string;
  areaTH?: string;
  lat?: string;
  long?: string;
  AQILast?: { date?: string; time?: string; PM25?: { value?: string }; PM10?: { value?: string } };
}

const reading = (v: string | undefined): number | undefined => {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** PCD's official ground monitors in Chiang Mai province (Air4Thai). */
export function parseAir4Thai(json: { stations?: Air4ThaiStation[] }, nowMs = Date.now()): AirStation[] {
  return (json.stations ?? [])
    .filter((s) => (s.areaTH ?? "").includes("เชียงใหม่"))
    .flatMap((s): AirStation[] => {
      const lat = Number(s.lat);
      const lon = Number(s.long);
      const last = s.AQILast;
      const observedMs = last?.date && last.time ? Date.parse(`${last.date}T${last.time}:00+07:00`) : NaN;
      if (!s.lat?.trim() || !s.long?.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || !inCnxBbox(lat, lon) || !Number.isFinite(observedMs)) return [];
      if (nowMs - observedMs > AIR4THAI_STALE_MS || observedMs > nowMs + 5 * 60_000) return [];
      const pm25 = reading(last?.PM25?.value);
      if (pm25 === undefined) return [];
      return [
        {
          stationId: `pcd-${s.stationID ?? ""}`,
          name: s.nameEN?.trim() || s.nameTH?.trim() || "PCD station",
          longitude: lon,
          latitude: lat,
          pm25,
          pm10: reading(last?.PM10?.value),
          source: "pcd",
          observedAt: new Date(observedMs).toISOString(),
          aqiLevel: severityForPm25(pm25),
        },
      ];
    });
}

async function fetchAir4Thai(): Promise<AirStation[]> {
  try {
    const res = await fetch(AIR4THAI, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];
    return parseAir4Thai((await res.json()) as { stations?: Air4ThaiStation[] });
  } catch {
    return [];
  }
}

let cache: { at: number; data: AirQualityResponse } | null = null;
const TTL_MS = 5 * 60_000;

/** Ground monitors (PCD Air4Thai) come first and drive the province
 *  average when any is reporting; Open-Meteo's CAMS model grid points fill
 *  in space and are the fallback average. If both fail the response is
 *  empty — no invented readings, and no advisory attributed to an agency
 *  that did not issue one. */
export async function fetchCnxAirQuality(): Promise<AirQualityResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const now = new Date().toISOString();
  const [ground, model] = await Promise.all([fetchAir4Thai(), fetchOpenMeteo()]);
  const stations = [...ground, ...(model ?? [])];
  const basis = ground.length > 0 ? ground : model ?? [];
  const withPm = basis.filter((s) => typeof s.pm25 === "number");
  const avg = withPm.length > 0 ? withPm.reduce((a, s) => a + (s.pm25 ?? 0), 0) / withPm.length : null;
  const level = avg === null ? undefined : severityForPm25(avg);
  const basisLabel = ground.length > 0 ? `${ground.length} PCD ground monitor(s)` : "Open-Meteo CAMS model";
  const office: OfficeNotice | undefined =
    level === "alert" || level === "critical"
      ? {
          source: `CNX dashboard — ${basisLabel}`,
          title: "High PM2.5 across Chiang Mai",
          detail: `Province-average PM2.5 ${avg?.toFixed(0)} µg/m³ (${basisLabel}). Not an official advisory — check PCD / provincial announcements.`,
          issuedAt: now,
          level,
        }
      : undefined;
  const response: AirQualityResponse = {
    generatedAt: now,
    stations,
    provinceAvgPm25: avg === null ? undefined : Math.round(avg),
    provinceAvgAqiLevel: level,
    office,
  };
  cache = { at: Date.now(), data: response };
  return response;
}

export function inCnxBbox(lat: number, lon: number): boolean {
  const b = CNX_PROVINCE.bbox;
  return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;
}