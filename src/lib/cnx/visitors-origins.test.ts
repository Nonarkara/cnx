// Day-scoped origins — "how many people are flying in from where".
//
// The bug this covers: `topOrigins` describes ONE INSTANT, so it went
// empty every night when nothing was airborne, and the panel's answer to
// a question about the day was "no aircraft in this snapshot". The data
// was there in the stored snapshots; it was simply never summed or
// max-reduced across them.

import { describe, expect, it } from "vitest";
import { summariseVisitors } from "./visitors";
import type { FlightState } from "./opensky";

const inbound = (icao: string, country: string, callsign: string): FlightState =>
  ({
    icao24: icao,
    callsign,
    originCountry: country,
    onGround: false,
    latitude: 18.9,
    longitude: 98.9853,
    trueTrack: 180,
  }) as FlightState;

const outbound = (icao: string, country: string): FlightState =>
  ({ ...inbound(icao, country, "X1"), trueTrack: 0 }) as FlightState;

describe("day-scoped origins", () => {
  it("is empty when no history is supplied, so the panel falls back rather than inventing", () => {
    const r = summariseVisitors([], { ts: Date.parse("2026-10-02T17:00:00Z") });
    expect(r.topOriginsToday).toEqual([]);
  });

  it("keeps yesterday's countries visible when nothing is airborne right now", () => {
    // The 02:00 case. Day has three arrivals, sky is empty.
    const withDay = summariseVisitors([inbound("a1", "South Korea", "KE7"), inbound("a2", "China", "MU8")], {
      ts: Date.parse("2026-10-02T09:00:00Z"),
    });
    expect(withDay.topOrigins.length).toBeGreaterThan(0);

    const afterMidnight = summariseVisitors([], {
      ts: Date.parse("2026-10-02T17:30:00Z"),
      historyOrigins: [withDay.topOrigins],
    });
    expect(afterMidnight.topOrigins).toHaveLength(0); // the instant list IS empty
    expect(afterMidnight.topOriginsToday.length).toBeGreaterThan(0); // the day list is not
    const korea = afterMidnight.topOriginsToday.find((o) => o.country === "South Korea");
    expect(korea?.visitors).toBeGreaterThan(0);
    expect(korea?.flights).toBeGreaterThan(0);
  });

  it("takes the largest single poll per country rather than summing every snapshot", () => {
    // The same 3 Korean aircraft appear in four consecutive polls.
    // Summing would report 12 flights, which is a fiction.
    const korean = [
      inbound("k1", "South Korea", "KE1"),
      inbound("k2", "South Korea", "KE2"),
      inbound("k3", "South Korea", "KE3"),
    ];
    const snapshot = summariseVisitors(korean, { ts: Date.parse("2026-10-02T06:00:00Z") });
    const r = summariseVisitors([], {
      ts: Date.parse("2026-10-02T17:00:00Z"),
      historyOrigins: [snapshot.topOrigins, snapshot.topOrigins, snapshot.topOrigins, snapshot.topOrigins],
    });
    const korea = r.topOriginsToday.find((o) => o.country === "South Korea");
    expect(korea?.flights).toBe(3); // not 12
  });

  it("never reports a country larger than the biggest poll saw", () => {
    const big = summariseVisitors([inbound("c1", "China", "MU1")], { ts: 1 });
    const small = summariseVisitors([inbound("j1", "Japan", "JL1")], { ts: 2 });
    const r = summariseVisitors([], { ts: 3, historyOrigins: [big.topOrigins, small.topOrigins] });
    for (const o of r.topOriginsToday) {
      expect(o.visitors).toBeGreaterThanOrEqual(0);
      expect(o.flights).toBeGreaterThanOrEqual(0);
    }
    expect(r.topOriginsToday.find((o) => o.country === "China")).toBeTruthy();
    expect(r.topOriginsToday.find((o) => o.country === "Japan")).toBeTruthy();
  });

  it("sorts the day list by visitors, largest first", () => {
    const snap = summariseVisitors(
      [inbound("c1", "China", "MU1"), inbound("j1", "Japan", "JL1"), inbound("k1", "South Korea", "KE1")],
      { ts: 1 },
    );
    const r = summariseVisitors([], { ts: 2, historyOrigins: [snap.topOrigins] });
    const visitors = r.topOriginsToday.map((o) => o.visitors);
    expect([...visitors].sort((a, b) => b - a)).toEqual(visitors);
  });

  it("drives the social language fan-out from the DAY list, not the empty instant list", () => {
    // At 02:00 the instant list is empty. If language selection used it,
    // the multilingual rail would silently collapse to English-only.
    const snap = summariseVisitors([inbound("k1", "South Korea", "KE1")], { ts: 1 });
    const night = summariseVisitors([], { ts: 2, historyOrigins: [snap.topOrigins] });
    expect(night.topOrigins).toHaveLength(0);
    expect(night.recommendedLanguages).toContain("en");
  });

  it("ignores outbound traffic — this answers who is arriving", () => {
    const r = summariseVisitors([outbound("x1", "Vietnam")], { ts: 1 });
    expect(r.topOriginsToday.every((o) => o.country !== "Vietnam")).toBe(true);
  });
});
