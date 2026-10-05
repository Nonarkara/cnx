// Measured rainfall read-out: the relay (scripts/rain-relay.mjs) pushes
// compacted ThaiWater rain_24h rows for Chiang Mai — the Worker is
// rate-limited by ThaiWater, like the river levels — and the banding runs
// here in rain-core.ts, so the relay cannot push a verdict.

import { summariseRain, rainObservationTime, RAIN_RELAY_MAX_AGE_MS, type RainRow, type RainSummary } from "./rain-core";
import { isNum, isObj, isStr, readRelayJson } from "./relay-kv";

export const RAIN_KV_KEY = "rain-24h-latest";
/** The relay pushes every 15 min; 60 min without one means it is down. */
const STALE_MS = RAIN_RELAY_MAX_AGE_MS;
const MAX_ROWS = 1_000;

export interface RainPayload {
  generatedAt: string;
  rows: RainRow[];
}

export interface RainResponse extends RainSummary {
  /** Relay collection time, distinct from gauge observation and response generation. */
  collectedAt?: string;
  provenance: "live" | "unavailable";
  source: string;
  note: string;
}

const SOURCE = "ThaiWater (HII) rain gauges · DWR, RID, TMD, HII and others";

function isRow(v: unknown): v is RainRow {
  return (
    isObj(v) &&
    isStr(v.id, 60) &&
    isNum(v.rain24h) &&
    v.rain24h >= 0 &&
    v.rain24h <= 500 &&
    isStr(v.at, 20) &&
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v.at) &&
    rainObservationTime(v.at) !== null &&
    isStr(v.station, 200) &&
    isStr(v.amphoeTh, 100) &&
    isStr(v.amphoeEn, 100) &&
    isStr(v.tambonTh, 100) &&
    isNum(v.lat) &&
    v.lat >= -90 && v.lat <= 90 &&
    isNum(v.lon) &&
    v.lon >= -180 && v.lon <= 180 &&
    isStr(v.agency, 40)
  );
}

export function isRainPayload(v: unknown): v is RainPayload {
  return isObj(v) && isStr(v.generatedAt, 40) && !Number.isNaN(Date.parse(v.generatedAt)) && Array.isArray(v.rows) && v.rows.length <= MAX_ROWS && v.rows.every(isRow);
}

export async function fetchCnxRain(): Promise<RainResponse> {
  const data = await readRelayJson(RAIN_KV_KEY, STALE_MS, isRainPayload);
  const summary = summariseRain(data?.rows ?? []);
  if (data && summary.stations.length) {
    return {
      ...summary,
      collectedAt: data.generatedAt,
      provenance: "live",
      source: SOURCE,
      note: "Measured 24-hour rainfall at gauges, TMD classes (heavy 35.1–90, very heavy ≥90.1 mm). Rain on slopes can cause flash floods far from any river gauge; gauges are points, not area totals.",
    };
  }
  return {
    ...summariseRain([]),
    provenance: "unavailable",
    source: SOURCE,
    note: data ? "The relay answered, but no gauge observations are current within six hours — rainfall is unknown, not zero." : "The rain-gauge relay has not reported in the last hour — no rainfall is shown, which is not the same as no rain.",
  };
}
