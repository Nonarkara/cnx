// CNX /api/twin — single endpoint that joins what we already have
// (flood + air + fires + reservoir) into one province-level risk
// surface with bilingual verdict, score, band, level, reasons,
// checklist, and provenance.
//
// Mirrors the FloodDash / AirDash /api/twin contract (see
// docs/TWIN-API.md in FloodDash) so any other dashboard — or a
// future AirDash for CNX — can join on province code = "50".
//
// Honest by construction:
//   - score/band/level come from the verdict engine, never invented
//   - reasons are pushed only when the input data justifies them
//   - data_provenance is `live` | `scenario` | `mixed` so the wall
//     can't silently present fabricated numbers as ground truth
//
// Caching: 60 s in-process. The verdict moves slowly enough that
// more frequent polls just hammer the upstream feeds; the upstream
// rain / PM2.5 / reservoir endpoints already cache for 5–10 min.

import { fetchCnxFlood } from "./flood";
import { fetchCnxAirQuality } from "./air-quality";
import { fetchCnxFires } from "./fires";
import { computeVerdict, type VerdictCard, type VerdictInputs } from "./verdict";

export interface CnxTwinResponse {
  system: "cnx";
  domain: "war-room";
  version: string;
  updated: string;
  licence: string;
  province_code: string;
  province_th: string;
  province_en: string;
  /** The unified risk card — the wall reads THIS first. */
  verdict: VerdictCard;
  /** Domain-specific deltas, kept small so the wire payload is cheap. */
  deltas: {
    flood: {
      ping_capacity_ratio: number | null;
      stations_rising: number;
      stations_total: number;
      reservoir_surge: boolean;
      rain_now_24h_mm: number | null;
    };
    air: {
      pm25_now: number | null;
      pm25_fc_24h: number | null;
      rain_fc_24h_mm: number | null;
      washout_band: "none" | "light" | "moderate" | "strong";
      washout_expected_pct: number;
      danger_score: number;
      wind_kmh: number | null;
    };
    fire: {
      hotspots_24h: number | null;
      forest_share: number | null;
    };
  };
  /** Honest-data disclaimer — same wording as FloodDash / AirDash. */
  disclaimer_th: string;
  disclaimer_en: string;
}

const VERSION = "1.0.0";
const LICENCE =
  "CC BY 4.0 — attribute CNX War Room and keep upstream agency credits (HII, RID, TMD, PCD, GISTDA, NASA FIRMS)";

/** Wind-based washout band — how much PM2.5 relief rain is expected to bring. */
function washoutBand(rain_fc_24h_mm: number | null): {
  band: "none" | "light" | "moderate" | "strong";
  expected_pct: number;
} {
  if (rain_fc_24h_mm === null || rain_fc_24h_mm < 2)
    return { band: "none", expected_pct: 0 };
  if (rain_fc_24h_mm < 10)
    return { band: "light", expected_pct: 15 };
  if (rain_fc_24h_mm < 25)
    return { band: "moderate", expected_pct: 35 };
  return { band: "strong", expected_pct: 60 };
}

/** Composite Danger Score — AirDash's "right now" score. */
function dangerScore(args: {
  pm25_now: number | null;
  wind_kmh: number | null;
  rain_fc_24h_mm: number | null;
  fire_count: number | null;
}): number {
  if (args.pm25_now === null) return 0;
  // Base: PM2.5 / 2 capped at 75
  const base = Math.min(75, args.pm25_now / 2);
  // Wind-basin amplification: low wind = smoke doesn't disperse
  const windAmp = args.wind_kmh !== null && args.wind_kmh < 12 ? 10 : 0;
  // Fire contribution: every 10 hotspots adds 1 point (cap 10)
  const fireAdd = args.fire_count !== null ? Math.min(10, Math.floor(args.fire_count / 10)) : 0;
  // Rain relief: subtract up to 15 if forecast rain is meaningful
  const rainRelief =
    args.rain_fc_24h_mm !== null ? Math.min(15, Math.floor(args.rain_fc_24h_mm / 2)) : 0;
  return Math.max(0, Math.min(100, Math.round(base + windAmp + fireAdd - rainRelief)));
}

let cache: { at: number; data: CnxTwinResponse } | null = null;
const TTL_MS = 60_000;

/** Estimate surface wind from Open-Meteo (free, no key). Returns null on
 *  failure so the verdict engine can degrade gracefully. */
async function fetchWindKmh(): Promise<number | null> {
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=18.788&longitude=98.985&current=wind_speed_10m&timezone=Asia%2FBangkok";
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const j = (await res.json()) as { current?: { wind_speed_10m?: number } };
    const mps = j.current?.wind_speed_10m;
    return typeof mps === "number" ? Math.round(mps * 3.6) : null;
  } catch {
    return null;
  }
}

/** Fetch a 24 h forecast slice from Open-Meteo CAMS for the city centre.
 *  Returns null on failure so the engine can degrade. */
async function fetchForecastPm25(): Promise<number | null> {
  try {
    const url =
      "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=18.788&longitude=98.985&hourly=pm2_5,precipitation&forecast_days=2&timezone=Asia%2FBangkok";
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      hourly?: { time?: string[]; pm2_5?: number[]; precipitation?: number[] };
    };
    if (!j.hourly?.time?.length) return null;
    const nowMs = Date.now();
    let pmSum = 0;
    let pmCount = 0;
    let rainSum = 0;
    for (let i = 0; i < j.hourly.time.length; i += 1) {
      const t = Date.parse(j.hourly.time[i] ?? "");
      const diffH = (t - nowMs) / 3_600_000;
      if (diffH > 0 && diffH <= 24) {
        const pm = j.hourly.pm2_5?.[i];
        if (typeof pm === "number") {
          pmSum += pm;
          pmCount += 1;
        }
        const rain = j.hourly.precipitation?.[i];
        if (typeof rain === "number") rainSum += rain;
      }
    }
    if (pmCount === 0) return null;
    return Math.round((pmSum / pmCount) * 10) / 10;
  } catch {
    return null;
  }
}

export async function fetchCnxTwin(): Promise<CnxTwinResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  // Gather in parallel — the slowest upstream dictates wall-clock latency.
  const [flood, air, fires, wind, pm25_fc, rain_fc_24h_mm_from_air] = await Promise.all([
    fetchCnxFlood(),
    fetchCnxAirQuality(),
    fetchCnxFires(),
    fetchWindKmh(),
    fetchForecastPm25(),
    fetchForecastPm25().then(async () => {
      // Try to also pull rain forecast from the same call (already requested
      // pm2_5_24h, but we re-pull here to keep types clean). If the dual-pull
      // is too costly we can refactor fetchForecastPm25 to return both.
      try {
        const url =
          "https://api.open-meteo.com/v1/forecast?latitude=18.788&longitude=98.985&daily=precipitation_sum&forecast_days=2&timezone=Asia%2FBangkok";
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) return null;
        const j = (await res.json()) as { daily?: { precipitation_sum?: number[] } };
        const arr = j.daily?.precipitation_sum;
        if (!arr || arr.length < 2) return null;
        // arr[0] is today, arr[1] is tomorrow — pick the bigger of the two
        // so an evening-today rain is reflected honestly.
        return Math.max(arr[0] ?? 0, arr[1] ?? 0);
      } catch {
        return null;
      }
    }),
  ]);

  const pm25_now = air.provinceAvgPm25 ?? null;
  const pingCapacity = flood.pingCapacityFraction ?? null;
  const stationsRising = flood.gauges.filter((g) => g.trend === "rising").length;
  const stationsTotal = flood.gauges.length;
  const reservoirSurge = flood.reservoirs.some(
    (r) =>
      typeof r.inflowM3s === "number" &&
      typeof r.outflowM3s === "number" &&
      r.outflowM3s >= r.inflowM3s * 1.5,
  );
  const rainNow24hMm = flood.rainfall.reduce(
    (m, s) => Math.max(m, s.rainfall24hMm),
    0,
  ) || null;
  const fireCount = fires.totalCount ?? null;
  const forestShare = fires.forestShare ?? null;

  const washout = washoutBand(rain_fc_24h_mm_from_air);
  const danger = dangerScore({
    pm25_now,
    wind_kmh: wind,
    rain_fc_24h_mm: rain_fc_24h_mm_from_air,
    fire_count: fireCount,
  });

  // Provenance: live if at least flood + air are live-fetched, scenario otherwise.
  // CNX flood module is scenario by default (CNX_FLOOD_LIVE gate is off); air
  // is live when Open-Meteo returns 200. Honour both honestly.
  const floodLive = process.env.CNX_FLOOD_LIVE === "1";
  const airLive = pm25_now !== null;
  const firesLive = process.env.FIRMS_MAP_KEY ? fireCount !== null : false;
  const provenance: "live" | "scenario" | "mixed" =
    floodLive && airLive && firesLive
      ? "live"
      : floodLive || airLive || firesLive
        ? "mixed"
        : "scenario";

  const verdictInputs: VerdictInputs = {
    pm25_now,
    pm25_fc_24h: pm25_fc,
    rain_fc_24h_mm: rain_fc_24h_mm_from_air,
    rain_now_24h_mm: rainNow24hMm,
    ping_capacity_ratio: pingCapacity,
    reservoir_surge: reservoirSurge,
    fire_count: fireCount,
    wind_kmh: wind,
    provenance,
  };
  const verdict = computeVerdict(verdictInputs);

  const data: CnxTwinResponse = {
    system: "cnx",
    domain: "war-room",
    version: VERSION,
    updated: new Date().toISOString(),
    licence: LICENCE,
    province_code: "50",
    province_th: "เชียงใหม่",
    province_en: "Chiang Mai",
    verdict,
    deltas: {
      flood: {
        ping_capacity_ratio: pingCapacity,
        stations_rising: stationsRising,
        stations_total: stationsTotal,
        reservoir_surge: reservoirSurge,
        rain_now_24h_mm: rainNow24hMm,
      },
      air: {
        pm25_now,
        pm25_fc_24h: pm25_fc,
        rain_fc_24h_mm: rain_fc_24h_mm_from_air,
        washout_band: washout.band,
        washout_expected_pct: washout.expected_pct,
        danger_score: danger,
        wind_kmh: wind,
      },
      fire: {
        hotspots_24h: fireCount,
        forest_share: forestShare,
      },
    },
    disclaimer_th:
      "ข้อมูลจากเซ็นเซอร์และแบบจำลอง ไม่ใช่ประกาศราชการ — คำสั่งอพยพเป็นของ ปภ. 1784 และ อปท. เท่านั้น",
    disclaimer_en:
      "Sensor- and model-derived; not an official warning. Evacuation orders belong to DDPM 1784 and local authorities alone.",
  };
  cache = { at: Date.now(), data };
  return data;
}
