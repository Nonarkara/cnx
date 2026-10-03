// A number with no label is a defect, not a neutral formatting choice.
//
// Live 2026-10-03: /api/cnx/visitors returned an origin row with
// `country: ""`, which the panel rendered as "165 · 1× —" beside nothing.
// Cause: opensky.ts deliberately normalises an absent origin country to an
// empty string (`originCountry: typeof country === "string" ? c : ""`),
// and visitors.ts read it with `??`, which catches null/undefined but NOT
// "". The seat count was real; the subject it was attributed to was blank.

import { describe, expect, it } from "vitest";
import { summariseVisitors } from "./visitors";
import type { FlightState } from "./opensky";

const ts = Date.parse("2026-10-03T09:00:00Z");

/** An aircraft heading toward VTCC whose country we could not determine. */
const unattributed = (icao: string, originCountry: string): FlightState =>
  ({
    icao24: icao,
    // No ICAO callsign prefix in AIRLINE_BY_CALLSIGN_PREFIX => airline is
    // null, so classification falls through to originCountry.
    callsign: "X1ZZ",
    originCountry,
    onGround: false,
    latitude: 18.9,
    longitude: 98.9853,
    trueTrack: 180,
  }) as FlightState;

describe("an origin with no country is a label, not a blank", () => {
  it("never emits an empty country name", () => {
    const r = summariseVisitors([unattributed("a1", ""), unattributed("a2", "  ")], { ts });
    for (const row of [...r.topOrigins, ...r.topOriginsToday]) {
      expect(row.country.trim()).not.toBe("");
    }
  });

  it("labels an unattributable flight Unknown rather than dropping its seats", () => {
    // Dropping it would under-count inbound seats, which is the failure
    // class this whole layer exists to avoid. "Unknown" is the honest
    // label: we saw the aircraft, we cannot attribute it.
    const r = summariseVisitors([unattributed("a1", ""), unattributed("a2", "")], { ts });
    const unknown = r.topOrigins.find((o) => o.country === "Unknown");
    expect(unknown).toBeDefined();
    expect(unknown?.flights).toBe(2);
    expect(unknown?.visitors).toBeGreaterThan(0);
  });

  it("keeps a real country when one is known", () => {
    const r = summariseVisitors([unattributed("a1", "China"), unattributed("a2", "")], { ts });
    const countries = r.topOrigins.map((o) => o.country);
    expect(countries).toContain("China");
    expect(countries).toContain("Unknown");
  });

  it("trims padding off a real country instead of splitting it", () => {
    const r = summariseVisitors([unattributed("a1", "  India  "), unattributed("a2", "India")], { ts });
    // Two aircraft, one country — not two countries differing by spaces.
    const rows = r.topOrigins.filter((o) => o.country.trim() === "India");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.flights).toBe(2);
  });
});

describe("a durable archive preserves old defects, so the read boundary repairs them", () => {
  // The write-side fix shipped and the blank row STILL rendered: the day
  // answer is rebuilt from snapshots stored in KV before the fix, and those
  // rows still said country: "". Verified live 2026-10-03 after deploying
  // the write-side fix — the same ('', 165) row, unchanged. Writing correct
  // rows does not retroactively correct rows already archived.
  const legacySnapshot = (country: string, visitors: number) => [
    { country, visitors, flights: 1, airlines: [], languages: ["en"] },
  ];

  it("relabels a blank country in stored history as Unknown", () => {
    const r = summariseVisitors([], {
      ts,
      historyOrigins: [legacySnapshot("", 165), legacySnapshot("China", 160)],
    });
    const countries = r.topOriginsToday.map((o) => o.country);
    expect(countries).toContain("Unknown");
    expect(countries).not.toContain("");
    expect(countries.every((c) => c.trim() !== "")).toBe(true);
  });

  it("keeps the seat count when relabelling — repair, not deletion", () => {
    const r = summariseVisitors([], { ts, historyOrigins: [legacySnapshot("", 165)] });
    const unknown = r.topOriginsToday.find((o) => o.country === "Unknown");
    expect(unknown?.visitors).toBe(165);
  });

  it("merges blank and Unknown history into one row rather than two", () => {
    // Without read-time repair these are two distinct map keys, so the
    // answer would carry BOTH "" and "Unknown" for the same real-world
    // bucket. Assert the total, not just the presence of "Unknown" — the
    // weaker form of this assertion passes either way.
    const r = summariseVisitors([], {
      ts,
      historyOrigins: [legacySnapshot("", 165), legacySnapshot("Unknown", 165)],
    });
    expect(r.topOriginsToday).toHaveLength(1);
    expect(r.topOriginsToday[0]?.country).toBe("Unknown");
  });
});
