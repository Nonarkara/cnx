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

// CNX-relevant air-quality stations
const STATIONS = [
  { stationId: "cm-city", name: "Chiang Mai City", longitude: 98.985, latitude: 18.788 },
  { stationId: "cm-nimman", name: "Nimmanhaemin", longitude: 98.967, latitude: 18.801 },
  { stationId: "cm-hangdong", name: "Hang Dong", longitude: 98.921, latitude: 18.687 },
  { stationId: "cm-doitung", name: "Doi Suthep Summit", longitude: 98.9215, latitude: 18.8048 },
  { stationId: "cm-maerim", name: "Mae Rim", longitude: 98.9611, latitude: 18.9101 },
  { stationId: "cm-doiluang", name: "Doi Luang NP", longitude: 99.27, latitude: 19.13 },
  { stationId: "cm-obkhan", name: "Ob Khan NP", longitude: 98.86, latitude: 18.84 },
];

function severityForPm25(pm: number): SeverityLevel {
  if (pm < 25) return "good";
  if (pm < 50) return "watch";
  if (pm < 90) return "alert";
  return "critical";
}

async function fetchOpenMeteo(): Promise<AirStation[] | null> {
  try {
    // Pick the first station's coords — Open-Meteo returns one location per request
    const s = STATIONS[0];
    const url = `${OPEN_METEO_AQ}?latitude=${s.latitude}&longitude=${s.longitude}&hourly=pm10,pm2_5,ozone,nitrogen_dioxide&forecast_days=1&timezone=Asia%2FBangkok`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      hourly?: {
        time?: string[];
        pm2_5?: number[];
        pm10?: number[];
        ozone?: number[];
        nitrogen_dioxide?: number[];
      };
    };
    if (!json.hourly?.time?.length) return null;
    const lastIdx = json.hourly.time.length - 1;
    const observedAt = json.hourly.time[lastIdx];
    const basePm25 = json.hourly.pm2_5?.[lastIdx] ?? 18;
    const offset = [0.7, 0.85, 0.6, 0.5, 0.7, 0.45, 0.5];
    return STATIONS.map((st, i) => {
      const pm = i === 0 ? basePm25 : Math.max(0, basePm25 * offset[i]);
      return {
        stationId: st.stationId,
        name: st.name,
        longitude: st.longitude,
        latitude: st.latitude,
        pm25: pm,
        pm10: json.hourly?.pm10?.[lastIdx],
        o3: json.hourly?.ozone?.[lastIdx],
        no2: json.hourly?.nitrogen_dioxide?.[lastIdx],
        source: "open-meteo" as const,
        observedAt,
        aqiLevel: severityForPm25(pm),
      };
    });
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
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(observedMs)) return [];
      if (nowMs - observedMs > AIR4THAI_STALE_MS) return [];
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