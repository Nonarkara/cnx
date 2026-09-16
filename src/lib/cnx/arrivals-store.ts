// CNX arrivals snapshot store — append-only NDJSON, one row per day
// per computation. Same pattern as snapshot-store.ts (flight
// positions), for the same reason: this is the archive the governor's
// office asked for — a year of accumulated arrivals/visitor-estimate
// data to build custom analyses from later, not just a live 3-day
// view.
//
// On the local M3 Mac the file lands at
// /Volumes/Data/CNX/arrivals-snapshots/YYYY-MM-DD.ndjson. On Cloudflare
// Workers (no persistent filesystem) it falls back to an in-process
// Map, capped, same tradeoff as snapshot-store.ts documents.

import { mkdir, appendFile, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DayArrivals } from "./arrivals";

const SNAPSHOT_DIR = "/Volumes/Data/CNX/arrivals-snapshots";
const MAX_IN_MEMORY_PER_DAY = 48; // one append per 30 min poll is already generous

export interface ArrivalsSnapshotRow {
  /** ms since epoch — when this row was written. */
  recordedAt: number;
  day: DayArrivals;
}

const edgeStore: Map<string, ArrivalsSnapshotRow[]> = new Map();

export async function appendArrivalsSnapshot(day: DayArrivals): Promise<void> {
  const row: ArrivalsSnapshotRow = { recordedAt: Date.now(), day };
  const dir = process.env.CNX_ARRIVALS_SNAPSHOT_DIR ?? SNAPSHOT_DIR;
  try {
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await appendFile(join(dir, `${day.date}.ndjson`), JSON.stringify(row) + "\n", "utf8");
    return;
  } catch {
    // Fall back to in-process Map for edge runtime.
  }
  const list = edgeStore.get(day.date) ?? [];
  list.push(row);
  if (list.length > MAX_IN_MEMORY_PER_DAY) list.splice(0, list.length - MAX_IN_MEMORY_PER_DAY);
  edgeStore.set(day.date, list);
}

/** Read back every recorded row for a single day — the last one is
 *  the most complete/final estimate for that day. */
export async function readArrivalsForDay(date: string): Promise<ArrivalsSnapshotRow[]> {
  const dir = process.env.CNX_ARRIVALS_SNAPSHOT_DIR ?? SNAPSHOT_DIR;
  try {
    const text = await readFile(join(dir, `${date}.ndjson`), "utf8");
    return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as ArrivalsSnapshotRow);
  } catch { /* try in-memory */ }
  return edgeStore.get(date) ?? [];
}

export async function listArrivalsDates(): Promise<string[]> {
  const dir = process.env.CNX_ARRIVALS_SNAPSHOT_DIR ?? SNAPSHOT_DIR;
  try {
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith(".ndjson")).map((f) => f.replace(/\.ndjson$/, "")).sort().reverse();
  } catch { /* try in-memory */ }
  return [...edgeStore.keys()].sort().reverse();
}
