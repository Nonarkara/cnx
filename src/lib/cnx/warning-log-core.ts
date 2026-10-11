// Warning log, pure part: what changed between the last stored snapshot of
// the board's levels and the current one (WMO-No. 1150: a warning service
// keeps a record of what it said and when, so it can be verified later).
//
// Rows are written on change only — a verdict level change, or an outlook
// item entering, changing level within, or leaving ≥ watch. No personal
// data: levels, scores, district names and a commit hash.

import { VERDICT_KEY, PROVINCE_DISTRICT, type WarningDomain } from "./board-warnings";
import { isNumOrNull, isObj, isStr } from "./relay-kv";

export const WARNING_LOG_CAP = 2_000;
export const WARNING_LOG_TTL_S = 400 * 24 * 3600;
export const SNAPSHOT_KEY = "warning-log:snapshot";
/** The same transition within this window is a second isolate racing, not news. */
const DEDUPE_MS = 30 * 60_000;
/** Board months follow Chiang Mai's clock (UTC+7, no DST). */
const BANGKOK_OFFSET_MS = 7 * 3_600_000;

/** Absent from the outlook = below watch. */
export const NONE = "none";

export interface WarningLogRow {
  at: string;
  domain: WarningDomain;
  district: string;
  /** null on the first observation ever recorded. */
  from: string | null;
  to: string;
  /** Verdict composite score (0–100); null for outlook rows. */
  score: number | null;
  /** Forecast value behind an outlook row (mm or µg/m³); null for the verdict. */
  value: number | null;
  reason_en: string | null;
  provenance: string;
  commit: string;
}

export interface EntryCore {
  level: string;
  /** When this level was entered. */
  since: string;
  /** Forecast peak when the level was entered (verdict: = since). */
  peakAt: string | null;
}

export interface SnapshotEntry extends EntryCore {
  domain: WarningDomain;
  /** The level this key held immediately before, if it was active. */
  prev: EntryCore | null;
}

export interface WarningSnapshot {
  at: string;
  entries: Record<string, SnapshotEntry>;
}

export interface VerdictObservation {
  level: string;
  score: number;
  reasonEn: string | null;
  provenance: string;
}

export interface OutlookObservation {
  key: string;
  domain: Exclude<WarningDomain, "verdict">;
  district: string;
  level: string;
  peakAt: string | null;
  value: number;
  reasonEn: string;
}

export interface WarningUpdate {
  verdict?: VerdictObservation;
  /** Only domains listed here may "leave": a missing PM2.5 model is not clean air. */
  outlook?: { domains: readonly Exclude<WarningDomain, "verdict">[]; items: readonly OutlookObservation[] };
}

const districtOf = (key: string, domain: WarningDomain) => key.slice(`cnx-${domain}-`.length) || PROVINCE_DISTRICT;

function enter(domain: WarningDomain, level: string, at: string, peakAt: string | null, prior: SnapshotEntry | undefined): SnapshotEntry {
  return { domain, level, since: at, peakAt, prev: prior ? { level: prior.level, since: prior.since, peakAt: prior.peakAt } : null };
}

/** Rows for what changed, and the snapshot to store next. Pure. */
export function diffWarnings(prev: WarningSnapshot | null, update: WarningUpdate, at: string, commit: string): { rows: WarningLogRow[]; next: WarningSnapshot } {
  const before = prev?.entries ?? {};
  const entries: Record<string, SnapshotEntry> = { ...before };
  const rows: WarningLogRow[] = [];
  const v = update.verdict;
  if (v) {
    const p = before[VERDICT_KEY];
    if (!p || p.level !== v.level) {
      entries[VERDICT_KEY] = enter("verdict", v.level, at, at, p);
      rows.push({ at, domain: "verdict", district: PROVINCE_DISTRICT, from: p?.level ?? null, to: v.level, score: v.score, value: null, reason_en: v.reasonEn, provenance: v.provenance, commit });
    }
  }
  const o = update.outlook;
  if (o) {
    const seen = new Set<string>();
    for (const item of o.items) {
      seen.add(item.key);
      const p = before[item.key];
      if (p && p.level === item.level) continue;
      entries[item.key] = enter(item.domain, item.level, at, item.peakAt, p);
      rows.push({ at, domain: item.domain, district: item.district, from: p?.level ?? NONE, to: item.level, score: null, value: item.value, reason_en: item.reasonEn, provenance: "model", commit });
    }
    for (const [key, p] of Object.entries(before)) {
      if (p.domain === "verdict" || seen.has(key) || !o.domains.includes(p.domain)) continue;
      delete entries[key];
      rows.push({ at, domain: p.domain, district: districtOf(key, p.domain), from: p.level, to: NONE, score: null, value: null, reason_en: null, provenance: "model", commit });
    }
  }
  return { rows, next: { at, entries } };
}

/** Existing month rows plus new ones: race duplicates dropped, newest 2,000 kept. */
export function appendLogRows(existing: readonly WarningLogRow[], rows: readonly WarningLogRow[], cap = WARNING_LOG_CAP): WarningLogRow[] {
  const fresh = rows.filter((r) => !existing.some((e) =>
    e.domain === r.domain && e.district === r.district && e.from === r.from && e.to === r.to && Math.abs(Date.parse(r.at) - Date.parse(e.at)) < DEDUPE_MS));
  return [...existing, ...fresh].slice(-cap);
}

/** `YYYY-MM` of an instant, on Chiang Mai's clock. */
export function logMonth(ms: number): string {
  return new Date(ms + BANGKOK_OFFSET_MS).toISOString().slice(0, 7);
}

/** A `?month=` value, or null when it is not a real YYYY-MM between 2000 and 2099. */
export function parseLogMonth(v: string | null): string | null {
  return v !== null && /^20\d\d-(0[1-9]|1[0-2])$/.test(v) ? v : null;
}

export const logKey = (month: string) => `warning-log:${month}`;

// ── guards for what comes back out of KV ──

const DOMAINS: readonly string[] = ["rain", "pm25", "verdict"];
const isDomain = (v: unknown): v is WarningDomain => typeof v === "string" && DOMAINS.includes(v);
const isStrOrNull = (v: unknown, max = 500): v is string | null => v === null || isStr(v, max);

function isEntryCore(v: unknown): v is EntryCore {
  return isObj(v) && isStr(v.level, 20) && isStr(v.since, 40) && isStrOrNull(v.peakAt, 40);
}

export function isSnapshot(v: unknown): v is WarningSnapshot {
  if (!isObj(v) || !isStr(v.at, 40) || !isObj(v.entries)) return false;
  return Object.values(v.entries).every((e) => isEntryCore(e) && isObj(e) && isDomain(e.domain) && (e.prev === null || isEntryCore(e.prev)));
}

export function isLogRow(v: unknown): v is WarningLogRow {
  return isObj(v) && isStr(v.at, 40) && isDomain(v.domain) && isStr(v.district, 80) && isStrOrNull(v.from, 20) && isStr(v.to, 20) &&
    isNumOrNull(v.score) && isNumOrNull(v.value) && isStrOrNull(v.reason_en, 1_000) && isStr(v.provenance, 20) && isStr(v.commit, 80);
}

/** Rows from a stored month, keeping only well-formed ones. */
export function parseLogRows(raw: string | null): WarningLogRow[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(isLogRow) : [];
  } catch {
    return [];
  }
}

export function parseSnapshot(raw: string | null): WarningSnapshot | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return isSnapshot(v) ? v : null;
  } catch {
    return null;
  }
}
