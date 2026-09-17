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

const SNAPSHOT_DIR = "/Volumes/Data/CNX/visitor-snapshots";
const MAX_IN_MEMORY_PER_DAY = 288; // 24 h x 12/h at a 5-min poll

export interface VisitorSnapshotRow {
  recordedAt: number;
  analytics: VisitorAnalytics;
}

const edgeStore: Map<string, VisitorSnapshotRow[]> = new Map();

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
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
    // Fall back to in-process Map for the edge runtime.
  }
  const key = dayKey(recordedAt);
  const list = edgeStore.get(key) ?? [];
  list.push(row);
  if (list.length > MAX_IN_MEMORY_PER_DAY) list.splice(0, list.length - MAX_IN_MEMORY_PER_DAY);
  edgeStore.set(key, list);
}

/** Read back every recorded row for a single day. */
export async function readVisitorSnapshotsForDay(date: string): Promise<VisitorSnapshotRow[]> {
  const dir = process.env.CNX_VISITORS_SNAPSHOT_DIR ?? SNAPSHOT_DIR;
  try {
    const text = await readFile(join(dir, `${date}.ndjson`), "utf8");
    return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as VisitorSnapshotRow);
  } catch { /* try in-memory */ }
  return edgeStore.get(date) ?? [];
}

export async function listVisitorSnapshotDates(): Promise<string[]> {
  const dir = process.env.CNX_VISITORS_SNAPSHOT_DIR ?? SNAPSHOT_DIR;
  try {
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith(".ndjson")).map((f) => f.replace(/\.ndjson$/, "")).sort().reverse();
  } catch { /* try in-memory */ }
  return [...edgeStore.keys()].sort().reverse();
}
