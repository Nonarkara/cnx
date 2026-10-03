// Durable, shared storage for the visitor-analytics day history.
//
// WHY THIS EXISTS: visitors-store.ts appends each poll to an NDJSON file
// under /Volumes/Data/CNX/visitor-snapshots and falls back to a per-isolate
// Map when that throws. On Cloudflare Workers the filesystem does not
// exist, so EVERY write silently took the Map path. That store is neither
// durable (isolate eviction loses the day) nor shared (each isolate sees
// only its own history), and it can only ever UNDER-report.
//
// Measured on 2026-10-03, same commit, same ICT day, 22 minutes apart:
//
//     11:37  topOriginsToday: Thailand 354, India 305, China 189   (3)
//     11:59  topOriginsToday: India 305, Thailand 165              (2)
//
// Not a refetch difference — a different isolate's memory. A day answer
// that silently loses countries is an omission error, so the archive has to
// outlive the isolate.
//
// LAYOUT: one key per ICT day-hour, holding that hour's rows. A poll writes
// to the current hour's key; reading a day is a single 24-key multiGet.
// Rows are never rewritten in place, so the archive survives isolate
// recycling and is shared by every isolate that serves the province.
//
// The write is a read-modify-write within one hour, so two concurrent
// polls in the same hour can lose the later row. That is bounded (one poll
// in five) and is why `historyProvenance` can report "partial" — the
// disclosure is part of the contract, not an afterthought.

import type { VisitorSnapshotRow } from "./visitors-store";

const KEY_PREFIX = "visitors-snap";

/** 7 days, matching the in-memory store's own pruning window. */
const RETENTION_SECONDS = 7 * 24 * 60 * 60;

/** Hours per day, ICT. Fixed: the key layout is hour-of-day, not a range. */
const HOURS_PER_DAY = 24;

export function visitorHourKey(date: string, hour: number): string {
  return `${KEY_PREFIX}:${date}:${String(hour).padStart(2, "0")}`;
}

/** ICT hour-of-day for an epoch-ms stamp, matching the store's dayKey(). */
export function ictHourOf(recordedAt: number): number {
  return new Date(recordedAt + 7 * 3_600_000).getUTCHours();
}

// Return type is inferred from the binding, not named: `KVNamespace` is
// ambient inside cloudflare-env.d.ts and is not a global this module can
// reference. Same shape as relay-kv.ts's kv().
async function visitorsKv() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return env.CNX_FLIGHTS_KV ?? null;
  } catch {
    // Not running on Workers (local dev, tests, the relay). Caller decides.
    return null;
  }
}

function parseRows(raw: string | null | undefined): VisitorSnapshotRow[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is VisitorSnapshotRow =>
        typeof r === "object" && r !== null && Number.isFinite((r as VisitorSnapshotRow).recordedAt),
    );
  } catch {
    // A corrupt value must not take the day down; it reads as no rows,
    // and the caller reports the day as unavailable.
    return [];
  }
}

/**
 * Append one row to its ICT hour bucket. Returns false when KV is absent
 * or the write failed, so the caller can fall back and — importantly — so
 * the response can say the archive is unavailable rather than implying a
 * day history it does not have.
 */
export async function putVisitorRowKv(row: VisitorSnapshotRow): Promise<boolean> {
  const store = await visitorsKv();
  if (!store) return false;
  const date = new Date(row.recordedAt + 7 * 3_600_000).toISOString().slice(0, 10);
  const key = visitorHourKey(date, ictHourOf(row.recordedAt));
  try {
    const existing = parseRows(await store.get(key));
    // Guard against unbounded growth if a poll loop misbehaves.
    const next = [...existing, row].slice(-200);
    await store.put(key, JSON.stringify(next), { expirationTtl: RETENTION_SECONDS });
    return true;
  } catch {
    return false;
  }
}

/** Every row stored for one ICT day, oldest first. Empty on any failure. */
export async function readVisitorRowsForDayKv(date: string): Promise<VisitorSnapshotRow[]> {
  const store = await visitorsKv();
  if (!store) return [];
  const keys = Array.from({ length: HOURS_PER_DAY }, (_, h) => visitorHourKey(date, h));
  try {
    const found = await store.get(keys);
    const rows: VisitorSnapshotRow[] = [];
    for (const [, raw] of found) rows.push(...parseRows(raw));
    return rows.sort((a, b) => a.recordedAt - b.recordedAt);
  } catch {
    return [];
  }
}

/** Whether this day is even present in the archive — cheaper than a read. */
export async function hasVisitorDayKv(date: string): Promise<boolean> {
  const store = await visitorsKv();
  if (!store) return false;
  try {
    return (await store.get(visitorHourKey(date, 0))) !== null;
  } catch {
    return false;
  }
}

// ── completeness disclosure ──

/**
 * A poll is one snapshot per /api/cnx/visitors GET — the archive is
 * request-driven. Someone viewing the board keeps it moving; a day
 * nobody views would be endless "partial", so the launchd relay ALSO
 * warms the endpoint every 12 minutes (scripts/relay-flights.mjs), just
 * under the gap threshold below. Yesterday's 46-minute gap (2026-10-03,
 * between the deploy verification and the next page view) is what the
 * disclosure was built to report, and what the warmer now pre-empts.
 *
 * A gap longer than the threshold means the archive missed a stretch, so
 * the day aggregate is missing observations and must not be presented as
 * if it covers the whole day.
 */
export const HISTORY_GAP_MS = 15 * 60_000;

export type HistoryProvenance = "complete" | "partial" | "unavailable";

export interface VisitorHistoryState {
  /** Whether the day aggregate covers the whole ICT day. */
  provenance: HistoryProvenance;
  /** Earliest stored observation, ISO-8601 UTC. Null when none. */
  since: string | null;
  /** How many polls are actually in the archive for this day. */
  polls: number;
  /** Longest interval between consecutive polls, ms. 0 when <2 rows. */
  largestGapMs: number;
  /** Why it is not "complete", in words. Null when complete/unavailable. */
  reason: string | null;
}

/**
 * Decide what to say about a day's coverage. Pure, so the rule is testable
 * without a KV binding.
 *
 * `unavailable` — nothing stored. The honest answer is "no history", and
 * the panel must not fall back to the instant list and imply a day total.
 * `partial` — history exists but has a hole, or starts well after ICT
 * midnight, so it misses part of the day.
 */
export function visitorHistoryState(rows: VisitorSnapshotRow[], now: number): VisitorHistoryState {
  if (rows.length === 0) {
    return {
      provenance: "unavailable",
      since: null,
      polls: 0,
      largestGapMs: 0,
      reason: "No visitor snapshots are stored for today, so the day-to-date origin list is unavailable.",
    };
  }

  const stamps = rows.map((r) => r.recordedAt).sort((a, b) => a - b);
  const since = stamps[0] as number;

  let largestGapMs = 0;
  for (let i = 1; i < stamps.length; i += 1) {
    largestGapMs = Math.max(largestGapMs, (stamps[i] as number) - (stamps[i - 1] as number));
  }

  // Distance from ICT midnight to the first observation, in elapsed ms.
  const dayStart = Date.parse(`${new Date(now + 7 * 3_600_000).toISOString().slice(0, 10)}T00:00:00.000Z`);
  const startLagMs = since - dayStart;

  const holes = largestGapMs > HISTORY_GAP_MS;
  const startedLate = startLagMs > HISTORY_GAP_MS;

  const provenance: HistoryProvenance = holes || startedLate ? "partial" : "complete";
  const reasons: string[] = [];
  if (startedLate) reasons.push(`history begins ${Math.round(startLagMs / 60_000)} min after midnight`);
  if (holes) reasons.push(`a ${Math.round(largestGapMs / 60_000)} min gap in the polls`);

  return {
    provenance,
    since: new Date(since).toISOString(),
    polls: stamps.length,
    largestGapMs,
    reason:
      provenance === "partial"
        ? `Day-to-date origins are partial: ${reasons.join(" and ")}. Countries and seat counts below are a lower bound.`
        : null,
  };
}

