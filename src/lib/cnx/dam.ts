// Reservoir read-out: the relay (scripts/dam-relay.mjs) pushes compacted
// ThaiWater `analyst/dam` rows — Ping-basin large dams and Chiang Mai medium
// reservoirs — because ThaiWater rate-limits Cloudflare's shared egress. The
// grading (percent of normal storage, bands, staleness) runs here at the edge
// in dam-core.ts, so the relay cannot push a verdict.

import { summariseDams, damReportTime, DAM_RELAY_MAX_AGE_MS, type DamRow, type DamSummary } from "./dam-core";
import { isNum, isNumOrNull, isObj, isStr, readRelayJson } from "./relay-kv";

export const DAM_KV_KEY = "dam-daily-latest";
const MAX_ROWS = 200;

export interface DamPayload {
  generatedAt: string;
  rows: DamRow[];
}

export interface DamResponse extends DamSummary {
  /** Relay collection time, distinct from the RID report day. */
  collectedAt?: string;
  provenance: "live" | "unavailable";
  source: string;
  note: string;
  /** Set when provenance === "unavailable": why, in plain words. */
  unavailableReason: string | null;
}

const SOURCE = "ThaiWater (HII) · RID daily dam report, EGAT";
const nonNegOrNull = (v: unknown) => v === null || (isNum(v) && v >= 0 && v <= 30_000);

function isRow(v: unknown): v is DamRow {
  return (
    isObj(v) &&
    isStr(v.id, 80) &&
    (v.kind === "large" || v.kind === "medium") &&
    isStr(v.nameTh, 200) && v.nameTh.length > 0 &&
    isStr(v.nameEn, 200) &&
    isStr(v.provinceTh, 100) &&
    isStr(v.amphoeTh, 100) &&
    isNum(v.lat) && v.lat >= -90 && v.lat <= 90 &&
    isNum(v.lon) && v.lon >= -180 && v.lon <= 180 &&
    isStr(v.date, 10) && damReportTime(v.date) !== null &&
    isNum(v.storageMcm) && v.storageMcm >= 0 && v.storageMcm <= 30_000 &&
    nonNegOrNull(v.normalMcm) &&
    nonNegOrNull(v.maxMcm) &&
    isNumOrNull(v.upstreamPct) && (v.upstreamPct === null || (v.upstreamPct > 0 && v.upstreamPct <= 300)) &&
    nonNegOrNull(v.inflowMcm) &&
    nonNegOrNull(v.releaseMcm) &&
    nonNegOrNull(v.spillMcm) &&
    isStr(v.agency, 40)
  );
}

export function isDamPayload(v: unknown): v is DamPayload {
  return isObj(v) && isStr(v.generatedAt, 40) && !Number.isNaN(Date.parse(v.generatedAt)) && Array.isArray(v.rows) && v.rows.length <= MAX_ROWS && v.rows.every(isRow);
}

const NOTE =
  "Storage as % of normal storage (ระดับเก็บกักปกติ) as RID publishes it, recomputed from storage ÷ normal storage only where the published figure is 0 or missing; inflow, release and spill in million m³ per day from the RID daily report. A daily report, not a live sensor: it says where the reservoir stood this morning.";

export async function fetchCnxDam(nowMs: number = Date.now()): Promise<DamResponse> {
  const data = await readRelayJson(DAM_KV_KEY, DAM_RELAY_MAX_AGE_MS, isDamPayload);
  const summary = summariseDams(data?.rows ?? [], nowMs);
  if (data && (summary.large.length > 0 || summary.medium.length > 0)) {
    return { ...summary, collectedAt: data.generatedAt, provenance: "live", source: SOURCE, note: NOTE, unavailableReason: null };
  }
  const unavailableReason = data
    ? `The relay answered, but no reservoir report is from the last ${summary.maxAgeDays + 1} days — storage is unknown, not normal.`
    : "The dam relay has not reported in the last three hours — reservoir storage is unknown, which is not the same as normal.";
  return { ...summariseDams([], nowMs), provenance: "unavailable", source: SOURCE, note: NOTE, unavailableReason };
}
