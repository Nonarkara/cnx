// Warning log, KV part. The diff is in warning-log-core.ts; this reads the
// last snapshot, appends changed rows to `warning-log:{YYYY-MM}` and stores
// the new snapshot — after the response, through ctx.waitUntil, so neither
// /api/cnx/twin nor /api/cnx/cap.xml waits on KV writes.

import { cnxKv } from "./relay-kv";
import { leadReason } from "./board-warnings";
import type { VerdictCard } from "./verdict";
import {
  appendLogRows, diffWarnings, logKey, logMonth, parseLogRows, parseSnapshot, SNAPSHOT_KEY, WARNING_LOG_TTL_S,
  type WarningLogRow, type WarningSnapshot, type WarningUpdate, type VerdictObservation,
} from "./warning-log-core";

export const LOG_COMMIT = process.env.NEXT_PUBLIC_GIT_SHA || "unknown";

export function verdictObservation(v: VerdictCard): VerdictObservation {
  return { level: v.level, score: v.score, reasonEn: leadReason(v)?.en ?? null, provenance: v.data_provenance };
}

export async function readWarningSnapshot(): Promise<WarningSnapshot | null> {
  try {
    const kv = await cnxKv();
    return kv ? parseSnapshot(await kv.get(SNAPSHOT_KEY)) : null;
  } catch {
    return null;
  }
}

/** Append rows to this month's log and store the snapshot they came from. */
export async function persistWarningLog(rows: readonly WarningLogRow[], next: WarningSnapshot, nowMs = Date.now()): Promise<void> {
  if (rows.length === 0) return;
  const kv = await cnxKv();
  if (!kv) return;
  const key = logKey(logMonth(nowMs));
  const merged = appendLogRows(parseLogRows(await kv.get(key)), rows);
  await kv.put(key, JSON.stringify(merged), { expirationTtl: WARNING_LOG_TTL_S });
  await kv.put(SNAPSHOT_KEY, JSON.stringify(next), { expirationTtl: WARNING_LOG_TTL_S });
}

/** Read, diff and persist in one step (used where the snapshot is not needed for the response). */
export async function recordWarnings(update: WarningUpdate, nowMs = Date.now()): Promise<WarningLogRow[]> {
  const prev = await readWarningSnapshot();
  const { rows, next } = diffWarnings(prev, update, new Date(nowMs).toISOString(), LOG_COMMIT);
  await persistWarningLog(rows, next, nowMs);
  return rows;
}

/**
 * Keep `task` alive after the response is sent. In a Worker it is handed to
 * ctx.waitUntil; elsewhere (next dev) it simply runs on. Never throws, never
 * waits for the task itself.
 */
export async function inBackground(task: Promise<unknown>): Promise<void> {
  const guarded = task.catch((err: unknown) => {
    console.error("[warning-log] write failed", err instanceof Error ? err.message : err);
  });
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(guarded);
  } catch {
    // Not in a Workers request — the promise runs on its own.
  }
}
