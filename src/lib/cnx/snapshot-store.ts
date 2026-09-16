// CNX flight snapshot store — append-only NDJSON.
//
// On the local M3 Mac where the API process runs behind launchd,
// /Volumes/Data/CNX/flight-snapshots/YYYY-MM-DD.ndjson exists and
// accumulates one JSON object per polling cycle. The schema is:
//
//   { ts, fetchedAt, airborne, ground, byQuadrant, topOrigins }
//
// 8 TB of trend data per year comes from this file. The aggregator
// (./trend-aggregator.ts, Phase 6) reads back the NDJSON files to
// answer questions like "where were the widebodies flying to last
// March?" or "which day did we see 50+ Chinese widebodies in one
// hour, and what was the news that day?"
//
// On Cloudflare Workers /open-next the /Volumes/Data path does not
// exist — the snapshot store falls back to an in-process Map keyed
// by date, capped at `MAX_IN_MEMORY_SNAPSHOTS_PER_DAY` entries. The
// `localAppend` function below is the writer; `edgeAppend` is the
// fallback.

import { mkdir, appendFile, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SNAPSHOT_DIR = "/Volumes/Data/CNX/flight-snapshots";
const MAX_IN_MEMORY_SNAPSHOTS_PER_DAY = 288; // 24 h × 12 / h = 288 polls

export interface FlightSnapshot {
  ts: number;            // wall clock ms at write
  fetchedAt: number;
  airborne: number;
  ground: number;
  byQuadrant: { quadrant: string; count: number }[];
  topOrigins: { country: string; count: number }[];
}

const edgeStore: Map<string, FlightSnapshot[]> = new Map();

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export async function appendSnapshot(snap: FlightSnapshot): Promise<void> {
  const key = dayKey(snap.ts);
  if (process.env.CNX_FLIGHT_SNAPSHOT_DIR) {
    const dir = process.env.CNX_FLIGHT_SNAPSHOT_DIR;
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await appendFile(join(dir, `${key}.ndjson`), JSON.stringify(snap) + "\n", "utf8");
    return;
  }
  // Try the canonical local path; if /Volumes/Data is mounted, write.
  try {
    if (!existsSync(SNAPSHOT_DIR)) await mkdir(SNAPSHOT_DIR, { recursive: true });
    await appendFile(join(SNAPSHOT_DIR, `${key}.ndjson`), JSON.stringify(snap) + "\n", "utf8");
    return;
  } catch {
    // Fall back to in-process Map for edge runtime.
  }
  const list = edgeStore.get(key) ?? [];
  list.push(snap);
  if (list.length > MAX_IN_MEMORY_SNAPSHOTS_PER_DAY) {
    list.splice(0, list.length - MAX_IN_MEMORY_SNAPSHOTS_PER_DAY);
  }
  edgeStore.set(key, list);
}

/** Read back snapshots for a single day. Useful for the Phase 6
 *  trend aggregator. Returns [] on missing file. */
export async function readSnapshotForDay(date: string): Promise<FlightSnapshot[]> {
  for (const dir of [process.env.CNX_FLIGHT_SNAPSHOT_DIR, SNAPSHOT_DIR]) {
    if (!dir) continue;
    try {
      const text = await readFile(join(dir, `${date}.ndjson`), "utf8");
      return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as FlightSnapshot);
    } catch { /* try next */ }
  }
  return edgeStore.get(date) ?? [];
}

/** List the dates we have snapshots for, most recent first. */
export async function listSnapshotDates(): Promise<string[]> {
  for (const dir of [process.env.CNX_FLIGHT_SNAPSHOT_DIR, SNAPSHOT_DIR]) {
    if (!dir) continue;
    try {
      const files = await readdir(dir);
      return files
        .filter((f) => f.endsWith(".ndjson"))
        .map((f) => f.replace(/\.ndjson$/, ""))
        .sort()
        .reverse();
    } catch { /* try next */ }
  }
  return [...edgeStore.keys()].sort().reverse();
}

/** Compact summary over the last N days — used by the "flights flying
 *  back" panel. */
export async function summariseRecentDays(days = 7): Promise<{
  days: number;
  totalSnapshots: number;
  distinctOriginCountries: number;
  byQuadrant: { quadrant: string; totalCount: number }[];
  byDay: { day: string; totalAirborne: number; topOrigin: string }[];
}> {
  const dates = (await listSnapshotDates()).slice(0, days);
  const allSnaps: { snap: FlightSnapshot; day: string }[] = [];
  for (const d of dates) {
    for (const s of await readSnapshotForDay(d)) allSnaps.push({ snap: s, day: d });
  }
  const byQuadrant = new Map<string, number>();
  const byDay = new Map<string, { totalAirborne: number; origins: Map<string, number> }>();
  const allOrigins = new Set<string>();
  for (const { snap, day } of allSnaps) {
    for (const q of snap.byQuadrant) byQuadrant.set(q.quadrant, (byQuadrant.get(q.quadrant) ?? 0) + q.count);
    const e = byDay.get(day) ?? { totalAirborne: 0, origins: new Map() };
    e.totalAirborne += snap.airborne;
    for (const o of snap.topOrigins) {
      e.origins.set(o.country, (e.origins.get(o.country) ?? 0) + o.count);
      allOrigins.add(o.country);
    }
    byDay.set(day, e);
  }
  return {
    days,
    totalSnapshots: allSnaps.length,
    distinctOriginCountries: allOrigins.size,
    byQuadrant: [...byQuadrant.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([quadrant, totalCount]) => ({ quadrant, totalCount })),
    byDay: [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, e]) => {
        const top = [...e.origins.entries()].sort((a, b) => b[1] - a[1])[0];
        return { day, totalAirborne: e.totalAirborne, topOrigin: top?.[0] ?? "—" };
      }),
  };
}