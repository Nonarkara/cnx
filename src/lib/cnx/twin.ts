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
import { fetchCnxDustboy } from "./dustboy";
import { fetchSmokeTrajectory } from "./smoke-feed";
import { fetchRiverLevel, isPingMainstem, type RiverGauge } from "./river-level";
import { computeVerdict, isCurrentGaugeReading, type VerdictCard, type VerdictInputs, type PingMeasured } from "./verdict";

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
      /** Measurement or scenario fill. Always present — mirrors
       *  `haze.smoke_provenance`, and exists precisely for the consumer
       *  who forgets to check. */
      provenance: "live" | "scenario";
      /** Null whenever `provenance !== "live"`, so a scenario gauge ratio
       *  cannot be quoted as a river level downstream. */
      ping_capacity_ratio: number | null;
      stations_rising: number | null;
      stations_total: number | null;
      reservoir_surge: boolean | null;
      rain_now_24h_mm: number | null;
      /**
       * The MEASURED river, from ThaiWater. Separate from
       * `ping_capacity_ratio` above, which is null unless the scenario
       * flood module is live — so a consumer gets a real river reading
       * even while the flood module's own numbers stay a scenario fill.
       *
       * `gauge_count` is the number of basin gauges that reported; it is
       * NOT the number of gauges the province has. Coverage lives at
       * `/api/cnx/river-level`, which also reports the catalogue size.
       */
      measured: {
        station_code: string | null;
        station_name_th: string;
        level_msl: number;
        below_bank_m: number | null;
        headroom_m: number | null;
        observed_at: string;
        gauge_count: number;
        provenance: "live" | "unavailable";
      } | null;
    };
    air: {
      pm25_now: number | null;
      pm25_fc_24h: number | null;
      rain_fc_24h_mm: number | null;
      washout_band: "none" | "light" | "moderate" | "strong";
      washout_expected_pct: number | null;
      danger_score: number | null;
      wind_kmh: number | null;
    };
    fire: {
      hotspots_24h: number | null;
      forest_share: number | null;
    };
    haze: {
      dustboy_pm25: number | null;
      dustboy_online: number;
      smoke_near_cnx: number | null;
      smoke_hits_cnx: number | null;
      smoke_origin_en: string | null;
      smoke_provenance: "live" | "unavailable";
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
  expected_pct: number | null;
} {
  if (rain_fc_24h_mm === null || rain_fc_24h_mm < 2)
    return { band: "none", expected_pct: null };
  if (rain_fc_24h_mm < 10)
    return { band: "light", expected_pct: null };
  if (rain_fc_24h_mm < 25)
    return { band: "moderate", expected_pct: null };
  return { band: "strong", expected_pct: null };
}

/** Composite Danger Score — AirDash's "right now" score. */
function dangerScore(args: {
  pm25_now: number | null;
  wind_kmh: number | null;
  rain_fc_24h_mm: number | null;
  fire_count: number | null;
}): number | null {
  if (args.pm25_now === null) return null;
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
      "https://api.open-meteo.com/v1/forecast?latitude=18.788&longitude=98.985&current=wind_speed_10m&wind_speed_unit=kmh&timezone=Asia%2FBangkok";
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { current?: { wind_speed_10m?: number } };
    const kmh = j.current?.wind_speed_10m;
    return typeof kmh === "number" && Number.isFinite(kmh) && kmh >= 0 ? kmh : null;
  } catch {
    return null;
  }
}

/** Fetch a 24 h forecast slice from Open-Meteo CAMS for the city centre.
 *  Returns null on failure so the engine can degrade. */
async function fetchForecastPm25(): Promise<number | null> {
  try {
    const url =
      "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=18.788&longitude=98.985&hourly=pm2_5&forecast_days=2&timezone=UTC&timeformat=unixtime";
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      hourly?: { time?: number[]; pm2_5?: number[] };
    };
    if (!j.hourly?.time?.length) return null;
    const nowMs = Date.now();
    let pmSum = 0;
    let pmCount = 0;
    for (let i = 0; i < j.hourly.time.length; i += 1) {
      const t = j.hourly.time[i] * 1000;
      const diffH = (t - nowMs) / 3_600_000;
      if (diffH > 0 && diffH <= 24) {
        const pm = j.hourly.pm2_5?.[i];
        if (typeof pm === "number" && Number.isFinite(pm) && pm >= 0) {
          pmSum += pm;
          pmCount += 1;
        }
      }
    }
    if (pmCount === 0) return null;
    return Math.round((pmSum / pmCount) * 10) / 10;
  } catch {
    return null;
  }
}

/** Sum the next 24 hourly precipitation intervals, not either calendar day. */
async function fetchRainNext24h(): Promise<number | null> {
  try {
    const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=18.788&longitude=98.985&hourly=precipitation&forecast_days=2&timezone=UTC&timeformat=unixtime", { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { hourly?: { time?: number[]; precipitation?: (number | null)[] } };
    const now = Date.now();
    const values = (j.hourly?.time ?? []).flatMap((t, i) => t * 1000 > now && t * 1000 <= now + 24 * 3_600_000 ? [j.hourly?.precipitation?.[i]] : []);
    if (values.length !== 24 || values.some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0)) return null;
    return Math.round(values.reduce<number>((sum, v) => sum + (v as number), 0) * 10) / 10;
  } catch { return null; }
}

export async function fetchCnxTwin(): Promise<CnxTwinResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  // Gather in parallel — the slowest upstream dictates wall-clock latency.
  const [flood, air, fires, wind, pm25_fc, rain_fc_24h_mm_from_air, dustboy, smoke, river] = await Promise.all([
    fetchCnxFlood(),
    fetchCnxAirQuality(),
    fetchCnxFires(),
    fetchWindKmh(),
    fetchForecastPm25(),
    fetchRainNext24h(),
    fetchCnxDustboy(),
    fetchSmokeTrajectory(),
    fetchRiverLevel(),
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
  const firesAreLive = fires.provenance === "live";
  const fireCount = firesAreLive ? fires.totalCount : null;
  const forestShare = firesAreLive ? (fires.forestShare ?? null) : null;
  const dustboyPm =
    dustboy.provenance === "live" ? dustboy.basin.chiangMai.avgPm25 : null;
  const smokeLive = smoke.provenance === "live";

  // ─── The measured river, for the verdict ──────────────────────
  //
  // One station speaks for the province, and it is chosen deliberately
  // rather than by "whichever returned first":
  //
  //   1. mainstem gauges only — a tributary at 1.3 m below its own bank
  //      is not a statement about the Ping in Chiang Mai;
  //   2. among those, the one closest to its bank, because that is the
  //      binding constraint on the river, not the average;
  //   3. a published critical level outranks everything, because it is
  //      the only threshold in the feed that carries an authority. In
  //      practice this is P.1 สะพานนวรัฐ (Nawarat Bridge), the station
  //      this board used as a guessed bank-full figure for its whole
  //      scenario life.
  //
  // Ties break toward the station with the newer observation, so a stale
  // gauge does not represent a fresher one standing beside it.
  const usableGauges: RiverGauge[] =
    river.provenance === "live" ? river.gauges.filter((g) => isPingMainstem(g) && isCurrentGaugeReading(g.observedAt)) : [];

  const pickGauge = (g: RiverGauge): number => {
    // hasThreshold first, then tightness, then freshness.
    const hasThreshold = g.criticalLevelMsl !== null ? 0 : 1;
    const tightness = g.belowBankM ?? Number.POSITIVE_INFINITY;
    const freshness = -Date.parse(g.observedAt);
    return hasThreshold * 1e12 + tightness * 1e6 + (Number.isFinite(freshness) ? freshness / 1e6 : 0);
  };

  const headGauge = usableGauges.length > 0 ? [...usableGauges].sort((a, b) => pickGauge(a) - pickGauge(b))[0] : null;

  const pingMeasured: PingMeasured | null = headGauge
    ? {
        stationCode: headGauge.code,
        stationNameTh: headGauge.nameTh,
        headroomM: headGauge.headroomM,
        belowBankM: headGauge.belowBankM,
        levelMsl: headGauge.levelMsl,
        reportingCount: river.gaugeCount,
        observedAt: headGauge.observedAt,
      }
    : null;

  const washout = washoutBand(rain_fc_24h_mm_from_air);
  const danger = dangerScore({
    pm25_now,
    wind_kmh: wind,
    rain_fc_24h_mm: rain_fc_24h_mm_from_air,
    fire_count: fireCount,
  });

  // Provenance: live if at least flood + air are live-fetched, scenario otherwise.
  // Read `flood.provenance` — NOT `process.env.CNX_FLOOD_LIVE`. The env var is
  // only the *gate*; `fetchCnxFlood()` sets provenance to "live" solely when
  // `fetchLive()` actually returned a payload, and that function is still a
  // `return null` placeholder. Keying off the gate would mean that setting
  // CNX_FLOOD_LIVE=1 today publishes hash-seeded scenario numbers labelled
  // live — the exact failure this file's header claims cannot happen.
  const floodLive = flood.provenance === "live";
  const airLive = pm25_now !== null;
  const dustboyLive = dustboyPm !== null;
  const provenance: "live" | "scenario" | "mixed" =
    floodLive && airLive && firesAreLive
      ? "live"
      : floodLive || airLive || firesAreLive || dustboyLive || smokeLive
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
    flood_provenance: flood.provenance,
    ping_measured: pingMeasured,
    dustboy_pm25: dustboyPm,
    smoke_hits_cnx: smokeLive ? smoke.summary.hitsCnx : null,
    smoke_near_cnx: smokeLive ? smoke.summary.nearCnx : null,
    smoke_origin_th: smokeLive ? smoke.summary.origin_th : null,
    smoke_origin_en: smokeLive ? smoke.summary.origin_en : null,
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
        provenance: flood.provenance,
        ping_capacity_ratio: floodLive ? pingCapacity : null,
        stations_rising: floodLive ? stationsRising : null,
        stations_total: floodLive ? stationsTotal : null,
        reservoir_surge: floodLive ? reservoirSurge : null,
        rain_now_24h_mm: floodLive ? rainNow24hMm : null,
        measured: pingMeasured
          ? {
              station_code: pingMeasured.stationCode,
              station_name_th: pingMeasured.stationNameTh,
              level_msl: pingMeasured.levelMsl,
              below_bank_m: pingMeasured.belowBankM,
              headroom_m: pingMeasured.headroomM,
              observed_at: pingMeasured.observedAt,
              gauge_count: pingMeasured.reportingCount,
              provenance: "live" as const,
            }
          : null,
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
      haze: {
        dustboy_pm25: dustboyPm,
        dustboy_online: dustboy.provenance === "live" ? dustboy.basin.chiangMai.onlineCount : 0,
        smoke_near_cnx: smokeLive ? smoke.summary.nearCnx : null,
        smoke_hits_cnx: smokeLive ? smoke.summary.hitsCnx : null,
        smoke_origin_en: smokeLive ? smoke.summary.origin_en : null,
        smoke_provenance: smoke.provenance,
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
