import { describe, expect, it } from "vitest";
import { VERDICT_KEY } from "./board-warnings";
import {
  appendLogRows, diffWarnings, logKey, logMonth, parseLogMonth, parseLogRows, parseSnapshot,
  type OutlookObservation, type WarningLogRow, type WarningSnapshot,
} from "./warning-log-core";

const T0 = "2026-10-11T05:00:00.000Z";
const T1 = "2026-10-11T08:00:00.000Z";
const verdict = (level: string, score = 40) => ({ level, score, reasonEn: "Ping P.1 0.8 m below bank", provenance: "live" });
const rain = (district: string, level: string, value = 50): OutlookObservation => ({
  key: `cnx-rain-${district}`, domain: "rain", district, level, peakAt: "2026-10-11T14:00:00.000Z", value, reasonEn: `Forecast 24 h rain ${value} mm`,
});
const pm = (district: string, level: string): OutlookObservation => ({
  key: `cnx-pm25-${district}`, domain: "pm25", district, level, peakAt: "2026-10-12T02:00:00.000Z", value: 60, reasonEn: "Forecast PM2.5 peak 60",
});

describe("diffWarnings", () => {
  it("records the first verdict it ever sees, with no previous level", () => {
    const { rows, next } = diffWarnings(null, { verdict: verdict("watch") }, T0, "abc1234");
    expect(rows).toEqual([{ at: T0, domain: "verdict", district: "province", from: null, to: "watch", score: 40, value: null, reason_en: "Ping P.1 0.8 m below bank", provenance: "live", commit: "abc1234" }]);
    expect(next.entries[VERDICT_KEY]).toEqual({ domain: "verdict", level: "watch", since: T0, peakAt: T0, prev: null });
  });

  it("writes nothing when the verdict level has not changed, even if the score moved", () => {
    const first = diffWarnings(null, { verdict: verdict("watch") }, T0, "a").next;
    const { rows, next } = diffWarnings(first, { verdict: verdict("watch", 55) }, T1, "a");
    expect(rows).toEqual([]);
    expect(next.entries[VERDICT_KEY].since).toBe(T0);
  });

  it("logs a verdict change from → to and remembers the level it replaced", () => {
    const first = diffWarnings(null, { verdict: verdict("watch") }, T0, "a").next;
    const { rows, next } = diffWarnings(first, { verdict: verdict("prepare", 61) }, T1, "a");
    expect(rows.map((r) => [r.from, r.to, r.score])).toEqual([["watch", "prepare", 61]]);
    expect(next.entries[VERDICT_KEY].prev).toEqual({ level: "watch", since: T0, peakAt: T0 });
  });

  it("logs outlook districts entering, changing level within, and leaving ≥ watch", () => {
    const first = diffWarnings(null, { outlook: { domains: ["rain", "pm25"], items: [rain("mae-chaem", "watch"), rain("fang", "watch")] } }, T0, "a");
    expect(first.rows.map((r) => [r.district, r.from, r.to])).toEqual([["mae-chaem", "none", "watch"], ["fang", "none", "watch"]]);
    const second = diffWarnings(first.next, { outlook: { domains: ["rain", "pm25"], items: [rain("mae-chaem", "alert", 95)] } }, T1, "a");
    expect(second.rows.map((r) => [r.district, r.from, r.to, r.value])).toEqual([["mae-chaem", "watch", "alert", 95], ["fang", "watch", "none", null]]);
    expect(second.next.entries["cnx-rain-fang"]).toBeUndefined();
    expect(second.next.entries["cnx-rain-mae-chaem"].prev?.level).toBe("watch");
  });

  it("never reads a missing PM2.5 model as clean air, and leaves the verdict alone on an outlook-only update", () => {
    const first = diffWarnings(null, { verdict: verdict("watch"), outlook: { domains: ["rain", "pm25"], items: [pm("saraphi", "alert")] } }, T0, "a");
    const { rows, next } = diffWarnings(first.next, { outlook: { domains: ["rain"], items: [] } }, T1, "a");
    expect(rows).toEqual([]);
    expect(Object.keys(next.entries).sort()).toEqual(["cnx-pm25-saraphi", VERDICT_KEY].sort());
  });

  it("does not mutate the previous snapshot", () => {
    const first = diffWarnings(null, { outlook: { domains: ["rain"], items: [rain("fang", "watch")] } }, T0, "a").next;
    const copy = JSON.parse(JSON.stringify(first)) as WarningSnapshot;
    diffWarnings(first, { outlook: { domains: ["rain"], items: [] } }, T1, "a");
    expect(first).toEqual(copy);
  });
});

describe("appendLogRows", () => {
  const row = (at: string, to = "prepare"): WarningLogRow => ({ at, domain: "verdict", district: "province", from: "watch", to, score: 60, value: null, reason_en: null, provenance: "live", commit: "a" });

  it("drops the same transition a racing isolate already wrote within 30 minutes", () => {
    const existing = [row("2026-10-11T05:00:00.000Z")];
    expect(appendLogRows(existing, [row("2026-10-11T05:10:00.000Z")])).toHaveLength(1);
    expect(appendLogRows(existing, [row("2026-10-11T06:00:00.000Z")])).toHaveLength(2);
    expect(appendLogRows(existing, [row("2026-10-11T05:10:00.000Z", "danger")])).toHaveLength(2);
  });

  it("keeps only the newest rows past the cap", () => {
    const existing = Array.from({ length: 5 }, (_, i) => row(new Date(Date.parse(T0) + i * 3_600_000).toISOString(), `l${i}`));
    const out = appendLogRows(existing, [row("2026-10-12T00:00:00.000Z", "new")], 3);
    expect(out.map((r) => r.to)).toEqual(["l3", "l4", "new"]);
  });
});

describe("months and stored data", () => {
  it("validates ?month= as YYYY-MM and nothing else", () => {
    expect(parseLogMonth("2026-10")).toBe("2026-10");
    for (const bad of ["2026-13", "2026-00", "2026-1", "26-10", "2026-10-01", "../x", "", "2026-10 ", "1999-12"]) expect(parseLogMonth(bad)).toBeNull();
    expect(parseLogMonth(null)).toBeNull();
    expect(logKey("2026-10")).toBe("warning-log:2026-10");
  });

  it("uses Chiang Mai's calendar month", () => {
    expect(logMonth(Date.parse("2026-10-31T16:59:00Z"))).toBe("2026-10");
    expect(logMonth(Date.parse("2026-10-31T17:00:00Z"))).toBe("2026-11");
  });

  it("keeps only well-formed rows and snapshots from KV", () => {
    const good = diffWarnings(null, { verdict: verdict("watch") }, T0, "a");
    expect(parseLogRows(JSON.stringify([...good.rows, { at: T0, domain: "nope" }, "x"]))).toEqual(good.rows);
    expect(parseLogRows("{not json")).toEqual([]);
    expect(parseSnapshot(JSON.stringify(good.next))).toEqual(good.next);
    expect(parseSnapshot(JSON.stringify({ at: T0, entries: { k: { level: 1 } } }))).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
  });
});
