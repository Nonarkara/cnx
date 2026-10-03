// CNX visitor-analytics snapshot store — append-only NDJSON, one row
// per poll. Deliberately separate from snapshot-store.ts (the
// outbound/flight-heading trend archive): both used to call
// appendSnapshot() with the same `FlightSnapshot.airborne` field
// meaning two different things (outbound.ts: total airborne aircraft
// in the bbox; visitors.ts: only the subset classified inbound to
// VTCC), silently corrupting the shared archive depending on which
// route polled last. Same on-disk pattern as arrivals-store.ts.

import { mkdir, appendFile, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { VisitorAnalytics } from "./visitors";
import { hasVisitorDayKv, putVisitorRowKv, readVisitorRowsForDayKv } from "./visitors-kv";

const SNAPSHOT_DIR = "/Volumes/Data/CNX/visitor-snapshots";
const MAX_IN_MEMORY_PER_DAY = 288; // 24 h x 12/h at a 5-min poll

export interface VisitorSnapshotRow {
  recordedAt: number;
  analytics: VisitorAnalytics;
}

const edgeStore: Map<string, VisitorSnapshotRow[]> = new Map();

function dayKey(ts: number): string {
  return new Date(ts + 7 * 3_600_000).toISOString().slice(0, 10);
}

export async function appendVisitorSnapshot(analytics: VisitorAnalytics): Promise<void> {
  const recordedAt = Date.now();
  const row: VisitorSnapshotRow = { recordedAt, analytics };
  const dir = process.env.CNX_VISITORS_SNAPSHOT_DIR ?? SNAPSHOT_DIR;
  try {
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await appendFile(join(dir, `${dayKey(recordedAt)}.ndjson`), JSON.stringify(row) + "\n", "utf8");
    return;
  } catch {
    // No filesystem here. Fall through to the shared KV archive below —
    // see visitors-kv.ts for why the in-process Map is not an acceptable
    // answer on Workers.
  }

  const wrote = await putVisitorRowKv(row);
  if (wrote) return;

  const key = dayKey(recordedAt);
  const list = edgeStore.get(key) ?? [];
  list.push(row);
  if (list.length > MAX_IN_MEMORY_PER_DAY) list.splice(0, list.length - MAX_IN_MEMORY_PER_DAY);
  edgeStore.set(key, list);
  for (const old of [...edgeStore.keys()].sort().slice(0, -7)) edgeStore.delete(old);
}

/**
 * Which tier answered a read. Reported to the UI so a day aggregate built
 * from per-isolate memory is never presented as an archive fact.
 * "kv" is the only durable one; "memory" is what Workers used to return
 * unconditionally, and it is scoped to a single isolate's lifetime.
 */
export type VisitorArchiveSource = "file" | "kv" | "memory" | "none";

export interface VisitorArchiveRead {
  rows: VisitorSnapshotRow[];
  source: VisitorArchiveSource;
}

/** Read back every recorded row for a single day, and say where they came from. */
export async function readVisitorSnapshotsForDay(date: string): Promise<VisitorArchiveRead> {
  const dir = process.env.CNX_VISITORS_SNAPSHOT_DIR ?? SNAPSHOT_DIR;
  try {
    const text = await readFile(join(dir, `${date}.ndjson`), "utf8");
    const rows = text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as VisitorSnapshotRow);
    return { rows, source: "file" };
  } catch { /* fall through to the shared archive */ }

  const fromKv = await readVisitorRowsForDayKv(date);
  if (fromKv.length > 0) return { rows: fromKv, source: "kv" };

  const memory = edgeStore.get(date);
  if (memory && memory.length > 0) return { rows: memory, source: "memory" };

  return { rows: [], source: "none" };
}

export async function listVisitorSnapshotDates(): Promise<string[]> {
  const dir = process.env.CNX_VISITORS_SNAPSHOT_DIR ?? SNAPSHOT_DIR;
  try {
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith(".ndjson")).map((f) => f.replace(/\.ndjson$/, "")).sort().reverse();
  } catch { /* fall through to the shared archive */ }
  if (edgeStore.size > 0) return [...edgeStore.keys()].sort().reverse();
  // KV has no cheap reverse listing without a full scan; the caller only
  // needs "which days exist", and the day list is small.
  const dates: string[] = [];
  const now = Date.now();
  for (let back = 0; back < 8; back += 1) {
    const d = new Date(now + 7 * 3_600_000 - back * 86_400_000).toISOString().slice(0, 10);
    if (await hasVisitorDayKv(d)) dates.push(d);
  }
  return dates;
}
