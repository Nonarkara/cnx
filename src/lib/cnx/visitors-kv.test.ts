// Tests for the day-archive honesty contract.
//
// The bug these guard: visitors-store.ts falls back to a per-isolate Map
// on Workers, so `topOriginsToday` was built from one worker's memory. Two
// isolates on the same day returned different countries (3 at 11:37, 2 at
// 11:59). Nothing in the payload said so. A day aggregate that quietly
// drops countries is an omission error, so the coverage of the archive is
// now part of the contract and these tests hold it to that.

import { describe, expect, it } from "vitest";
import {
  HISTORY_GAP_MS,
  ictHourOf,
  visitorHistoryState,
  visitorHourKey,
} from "./visitors-kv";
import type { VisitorSnapshotRow } from "./visitors-store";

const MIN = 60_000;

/** A row's `recordedAt` is what the history rules read; analytics is never touched. */
const rowAt = (recordedAt: number): VisitorSnapshotRow =>
  ({ recordedAt, analytics: {} as VisitorSnapshotRow["analytics"] });

/** ICT midnight for the day containing `now`, in epoch ms. */
const ictMidnight = (now: number) =>
  Date.parse(`${new Date(now + 7 * 3_600_000).toISOString().slice(0, 10)}T00:00:00.000Z`);

const noon = Date.parse("2026-10-03T05:00:00.000Z"); // 12:00 ICT

describe("visitor hour keys", () => {
  it("keys by ICT hour, not UTC hour", () => {
    // 18:00 UTC is 01:00 ICT the next day — the two must not share a key.
    const lateEvening = Date.parse("2026-10-03T18:00:00.000Z");
    expect(ictHourOf(lateEvening)).toBe(1);
    expect(visitorHourKey("2026-10-04", ictHourOf(lateEvening))).toBe("visitors-snap:2026-10-04:01");
  });

  it("pads hours so :1 and :11 cannot collide", () => {
    expect(visitorHourKey("2026-10-03", 1)).not.toBe(visitorHourKey("2026-10-03", 11));
  });
});

describe("visitorHistoryState — an archive that cannot be proven must not read as whole", () => {
  it("says unavailable, not complete, when nothing is stored", () => {
    const s = visitorHistoryState([], noon);
    expect(s.provenance).toBe("unavailable");
    expect(s.polls).toBe(0);
    expect(s.since).toBeNull();
    expect(s.reason).toMatch(/no visitor snapshots/i);
  });

  it("is complete when polls run from midnight with no holes", () => {
    const start = ictMidnight(noon);
    const rows = Array.from({ length: 20 }, (_, i) => rowAt(start + i * 5 * MIN));
    const s = visitorHistoryState(rows, noon);
    expect(s.provenance).toBe("complete");
    expect(s.reason).toBeNull();
    expect(s.polls).toBe(20);
  });

  it("is partial when the day has a hole in it", () => {
    const start = ictMidnight(noon);
    // A two-hour hole: polls, then nothing, then polls again.
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => rowAt(start + i * 5 * MIN)),
      ...Array.from({ length: 6 }, (_, i) => rowAt(start + 2 * 3_600_000 + i * 5 * MIN)),
    ];
    const s = visitorHistoryState(rows, noon);
    expect(s.provenance).toBe("partial");
    expect(s.largestGapMs).toBeGreaterThan(HISTORY_GAP_MS);
    expect(s.reason).toMatch(/partial/i);
    expect(s.reason).toMatch(/lower bound/i);
  });

  it("is partial when history starts long after midnight", () => {
    // First poll two hours in: the early-morning arrivals are missing.
    const start = ictMidnight(noon) + 2 * 3_600_000;
    const rows = Array.from({ length: 10 }, (_, i) => rowAt(start + i * 5 * MIN));
    const s = visitorHistoryState(rows, noon);
    expect(s.provenance).toBe("partial");
    expect(s.reason).toMatch(/after midnight/i);
  });

  it("tolerates unsorted rows — order is not evidence of anything", () => {
    const start = ictMidnight(noon);
    const rows = [
      rowAt(start + 15 * MIN),
      rowAt(start),
      rowAt(start + 5 * MIN),
      rowAt(start + 10 * MIN),
    ];
    const s = visitorHistoryState(rows, noon);
    expect(s.since).toBe(new Date(start).toISOString());
    expect(s.provenance).toBe("complete");
  });

  it("reports the earliest observation as `since`, not the latest", () => {
    const start = ictMidnight(noon);
    const rows = [rowAt(start), rowAt(start + 40 * MIN)];
    // `since` drives the "history begins N min after midnight" rule, so it
    // must be the minimum. Taking the max would hide a late start.
    expect(visitorHistoryState(rows, noon).since).toBe(new Date(start).toISOString());
  });

  it("counts polls, not distinct days", () => {
    const start = ictMidnight(noon);
    const rows = Array.from({ length: 7 }, (_, i) => rowAt(start + i * 5 * MIN));
    expect(visitorHistoryState(rows, noon).polls).toBe(7);
  });
});
