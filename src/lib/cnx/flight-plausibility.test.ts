// An aviation board must not draw an altitude that cannot be an altitude.
//
// `toState` (adsb.lol) accepted any `typeof x === "number"`, and `parseState`
// (OpenSky) any finite one. No bound on altitude, speed, vertical rate or
// track — and every downstream guard is null-shaped or comparative, so NaN
// walked straight through all of them. In CNXMap `getColor`, both
// `alt >= 10_000` and `alt >= 6_000` are false for NaN, so a NaN-altitude
// aircraft rendered in the LOW colour band: a jet at cruise drawn like one
// at 800 ft, with nothing on the board to say the number was never known.
// The tail guard `f.velocity <= 0` is false for NaN too, so the tail endpoint
// became [lon - NaN, lat - NaN]. And the snapshot feeds summariseVisitors,
// so a bad record moves a headline civic number, not just a dot.
//
// The rule is: a measurement that cannot be real becomes NULL (visibly
// unknown), a record that cannot be placed is REJECTED, and both are COUNTED
// and published on `quality`. Nothing is dropped silently — "not enough
// data" must never read as a clean number.

import { describe, expect, it } from "vitest";
import {
  FLIGHT_FAULTS,
  PLAUSIBLE_ALTITUDE_MAX_M,
  PLAUSIBLE_GROUND_SPEED_MAX_M_S,
  PLAUSIBLE_VERTICAL_RATE_MAX_M_S,
  flightFaults,
  screenFlights,
} from "./flight-plausibility";
import type { FlightState } from "./opensky";

/** A perfectly ordinary aircraft on approach to CNX. */
const aircraft = (over: Partial<FlightState> = {}): FlightState => ({
  icao24: "abc123",
  callsign: "THA102",
  originCountry: "Thailand",
  timePosition: 1_757_000_000_000,
  lastContact: 1_757_000_000_000,
  longitude: 98.9622,
  latitude: 18.7669,
  baroAltitude: 3_658,
  geoAltitude: 3_600,
  onGround: false,
  velocity: 130,
  trueTrack: 34,
  verticalRate: -4,
  positionSource: 1,
  ...over,
});

describe("a measurement that cannot be real becomes unknown, never a value", () => {
  it("accepts a normal aircraft unchanged", () => {
    const a = aircraft();
    expect(flightFaults(a)).toEqual([]);
    const { kept, quality } = screenFlights([a]);
    expect(kept).toEqual([a]);
    expect(quality).toEqual({ rejected: 0, nulled: 0, faults: {} });
  });

  it("nulls a NaN altitude instead of rendering it in the low colour band", () => {
    // The defect, named: CNXMap's getColor tests `alt >= 10_000` then
    // `alt >= 6_000`. Both are false for NaN, so the aircraft fell into the
    // LOW bucket — indistinguishable from one genuinely at 800 ft.
    const { kept, quality } = screenFlights([aircraft({ baroAltitude: NaN })]);
    expect(kept).toHaveLength(1);
    expect(kept[0].baroAltitude).toBeNull();
    // null is what the renderer draws as "unknown"; the number is gone.
    expect(Number.isNaN(kept[0].baroAltitude as number)).toBe(false);
    expect(quality.nulled).toBe(1);
    expect(quality.faults.altitude).toBe(1);
  });

  it("nulls an Infinity altitude", () => {
    const { kept } = screenFlights([aircraft({ baroAltitude: Infinity })]);
    expect(kept[0].baroAltitude).toBeNull();
  });

  it("rejects sentinel altitudes at both ends", () => {
    for (const bad of [999_999, 1e30, -9_999]) {
      const { kept, quality } = screenFlights([aircraft({ baroAltitude: bad })]);
      expect(kept[0].baroAltitude).toBeNull();
      expect(quality.faults.altitude).toBe(1);
    }
  });

  it("nulls a NaN ground speed, which the tail guard `velocity <= 0` lets through", () => {
    // NaN <= 0 is false, so CNXMap's guard passed it and the tail endpoint
    // became [lon - NaN, lat - NaN].
    const { kept, quality } = screenFlights([aircraft({ velocity: NaN })]);
    expect(kept[0].velocity).toBeNull();
    expect(quality.faults.groundSpeed).toBe(1);
  });

  it("nulls a NaN vertical rate and an out-of-domain track", () => {
    const { kept, quality } = screenFlights([
      aircraft({ verticalRate: NaN }),
      aircraft({ icao24: "def456", trueTrack: 361 }),
      aircraft({ icao24: "ghi789", trueTrack: -1 }),
    ]);
    expect(kept[0].verticalRate).toBeNull();
    expect(kept[1].trueTrack).toBeNull();
    expect(kept[2].trueTrack).toBeNull();
    expect(quality.faults.verticalRate).toBe(1);
    expect(quality.faults.track).toBe(2);
  });

  it("treats exactly 360° as invalid — it is 0° mis-encoded", () => {
    const { kept } = screenFlights([aircraft({ trueTrack: 360 })]);
    expect(kept[0].trueTrack).toBeNull();
  });

  it("leaves a null measurement null rather than inventing one", () => {
    // "Unknown" upstream must stay "unknown" downstream — the screen reports
    // nothing wrong with a field that was never claimed.
    const { kept, quality } = screenFlights([
      aircraft({ baroAltitude: null, velocity: null, verticalRate: null, trueTrack: null }),
    ]);
    expect(kept[0]).toMatchObject({ baroAltitude: null, velocity: null, verticalRate: null, trueTrack: null });
    expect(quality).toEqual({ rejected: 0, nulled: 0, faults: {} });
  });
});

describe("an aircraft that cannot be placed is rejected, and counted", () => {
  it("rejects a missing or non-finite position but keeps its neighbours", () => {
    const { kept, quality } = screenFlights([
      aircraft({ latitude: null, longitude: null }),
      aircraft({ icao24: "nan01", latitude: NaN, longitude: NaN }),
      aircraft({ icao24: "oob01", latitude: 91, longitude: 0 }),
      aircraft({ icao24: "good1" }),
    ]);
    expect(kept.map((f) => f.icao24)).toEqual(["good1"]);
    expect(quality.rejected).toBe(3);
    expect(quality.faults.position).toBe(3);
    // A rejected aircraft is never also counted as "nulled" — the two
    // numbers describe different fates and must not double-count.
    expect(quality.nulled).toBe(0);
  });

  it("counts a record that has both a bad position and a bad altitude once per fault", () => {
    const { kept, quality } = screenFlights([
      aircraft({ latitude: NaN, longitude: NaN, baroAltitude: 1e30 }),
    ]);
    expect(kept).toHaveLength(0);
    expect(quality.rejected).toBe(1);
    expect(quality.faults.position).toBe(1);
    expect(quality.faults.altitude).toBe(1);
  });
});

describe("the screen never invents an altitude to keep a drawing", () => {
  it("REJECT rather than clamp — no substitution, ever", () => {
    const absurd = screenFlights([aircraft({ baroAltitude: 1e30 })]);
    // The value must be gone, not merely out of range.
    expect(absurd.kept[0].baroAltitude).toBeNull();
    expect(absurd.kept[0].baroAltitude).not.toBeCloseTo(PLAUSIBLE_ALTITUDE_MAX_M);
  });

  it("keeps an on-ground aircraft at 0 m — the floor must not eat parked airliners", () => {
    // CNX sits at 314 m; a parked aircraft reporting 0 m is an upstream
    // convention, and a negative floor that rejected it would silently
    // delete parked aircraft from both the map and the visitor count.
    const { kept, quality } = screenFlights([
      aircraft({ onGround: true, baroAltitude: 0, velocity: 0, verticalRate: null }),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].baroAltitude).toBe(0);
    expect(quality.rejected).toBe(0);
  });
});

describe("bounds are wide enough for real traffic", () => {
  // These are the extremes measured from both live upstreams over 26 ticks
  // on 2026-10-13 (109 distinct aircraft records). They are pinned here as a
  // regression: if someone tightens a bound into observed traffic, this
  // fails instead of the board quietly blanking aircraft at 03:00.
  const OBSERVED = {
    baroAltitude: 7_323,
    velocity: 192,
    verticalRate: 23.4,
    trueTrack: 340.4,
  };

  it("accepts the highest altitude ever actually observed over the CNX box", () => {
    expect(flightFaults(aircraft({ baroAltitude: OBSERVED.baroAltitude }))).toEqual([]);
  });

  it("accepts the fastest ground speed ever actually observed", () => {
    expect(flightFaults(aircraft({ velocity: OBSERVED.velocity }))).toEqual([]);
  });

  it("accepts the steepest climb ever actually observed, either direction", () => {
    expect(flightFaults(aircraft({ verticalRate: OBSERVED.verticalRate }))).toEqual([]);
    expect(flightFaults(aircraft({ verticalRate: -7.8 }))).toEqual([]);
  });

  it("accepts the largest true track ever actually observed", () => {
    expect(flightFaults(aircraft({ trueTrack: OBSERVED.trueTrack }))).toEqual([]);
  });

  it("still rejects well beyond every observed value", () => {
    expect(PLAUSIBLE_ALTITUDE_MAX_M).toBeGreaterThan(OBSERVED.baroAltitude * 2);
    expect(PLAUSIBLE_GROUND_SPEED_MAX_M_S).toBeGreaterThan(OBSERVED.velocity * 2);
    expect(PLAUSIBLE_VERTICAL_RATE_MAX_M_S).toBeGreaterThan(OBSERVED.verticalRate * 2);
  });
});

describe("a snapshot reports what it withheld", () => {
  // Mirrors what the KV read path in opensky.ts actually does: concatenate
  // both buckets, screen once, then re-bucket on the upstream's onGround flag.
  const screenSnapshot = (airborne: FlightState[], ground: FlightState[] = []) => {
    const { kept, quality } = screenFlights([...airborne, ...ground]);
    return {
      airborne: kept.filter((f) => !f.onGround),
      ground: kept.filter((f) => f.onGround),
      quality,
    };
  };

  it("always reports a quality block, so screened is distinguishable from unscreened", () => {
    expect(screenSnapshot([aircraft()]).quality).toEqual({ rejected: 0, nulled: 0, faults: {} });
  });

  it("merges the counts of both buckets", () => {
    const out = screenSnapshot(
      [aircraft({ baroAltitude: NaN }), aircraft({ latitude: NaN, longitude: NaN })],
      [aircraft({ onGround: true, baroAltitude: 0, velocity: NaN })],
    );
    expect(out.quality.rejected).toBe(1);
    expect(out.quality.nulled).toBe(2);
    expect(out.quality.faults.altitude).toBe(1);
    expect(out.quality.faults.groundSpeed).toBe(1);
  });

  it("buckets on the upstream's onGround flag, not on the array it arrived in", () => {
    // The relay already bucketed this payload; re-bucketing is the read
    // path normalising a durable store that an older relay may have written.
    const out = screenSnapshot([], [aircraft({ onGround: true, baroAltitude: 0 }), aircraft({ onGround: false })]);
    expect(out.ground.map((f) => f.onGround)).toEqual([true]);
    expect(out.airborne.map((f) => f.onGround)).toEqual([false]);
  });

  it("preserves identity and provenance fields", () => {
    const a = aircraft({ registration: "HS-ABC", typecode: "A320" });
    const out = screenSnapshot([a]);
    expect(out.airborne[0]).toMatchObject({
      icao24: "abc123",
      callsign: "THA102",
      registration: "HS-ABC",
      typecode: "A320",
      latitude: 18.7669,
      longitude: 98.9622,
    });
  });

  it("never returns more records than it was given", () => {
    const messy = [
      aircraft(),
      aircraft({ icao24: "b1", baroAltitude: 1e30 }),
      aircraft({ icao24: "b2", latitude: NaN, longitude: NaN }),
      aircraft({ icao24: "b3", velocity: NaN }),
    ];
    const out = screenSnapshot(messy);
    // 4 in: 1 clean, 2 kept-with-a-nulled-measurement, 1 rejected.
    expect(out.airborne).toHaveLength(3);
    expect(out.quality.rejected).toBe(1);
    expect(out.quality.nulled).toBe(2);
    // 3 kept + 1 rejected must account for every input, or something was
    // dropped without a number attached to it.
    expect(out.airborne.length + out.quality.rejected).toBe(messy.length);
  });
});

describe("every declared fault is reachable", () => {
  it("FLIGHT_FAULTS matches what flightFaults can return", () => {
    const seen = new Set<string>();
    const one = (over: Partial<FlightState>) => flightFaults(aircraft(over));
    for (const f of one({ latitude: NaN, longitude: NaN })) seen.add(f);
    for (const f of one({ baroAltitude: 1e30 })) seen.add(f);
    for (const f of one({ velocity: 1e30 })) seen.add(f);
    for (const f of one({ verticalRate: 1e30 })) seen.add(f);
    for (const f of one({ trueTrack: 999 })) seen.add(f);
    expect([...seen].sort()).toEqual([...FLIGHT_FAULTS].sort());
  });
});