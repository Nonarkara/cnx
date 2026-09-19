import { describe, expect, it } from "vitest";
import { ASSUMED_LOAD_FACTOR, buildArrivalsResponse, summariseArrivalRecords, type OpenSkyArrival } from "./arrivals";
import { isArrivalsIngestPayload } from "./arrivals-kv";

function arrival(icao24: string, from: string | null, extra: Partial<OpenSkyArrival> = {}): OpenSkyArrival {
  return { icao24, firstSeen: 1_000, lastSeen: 2_000, estDepartureAirport: from, estArrivalAirport: "VTCC", callsign: "TST1", ...extra };
}

describe("summariseArrivalRecords", () => {
  it("counts Thai origins as domestic and everything else as international visitors", () => {
    const typecodes = new Map([
      ["a1", "A320"], // 180 seats
      ["a2", "B738"], // 189 seats
      ["a3", "A320"],
    ]);
    const day = summariseArrivalRecords(
      "2026-09-18",
      [arrival("a1", "VTBS"), arrival("a2", "ZGSZ"), arrival("a3", "RKSI")],
      typecodes,
    );
    expect(day.totalFlights).toBe(3);
    expect(day.domesticFlights).toBe(1);
    expect(day.internationalFlights).toBe(2);
    expect(day.estimatedVisitors).toBe(Math.round(189 * ASSUMED_LOAD_FACTOR) + Math.round(180 * ASSUMED_LOAD_FACTOR));
  });

  it("groups international flights by origin country, largest first", () => {
    const typecodes = new Map([
      ["x", "B789"],
      ["y", "A320"],
      ["z", "A320"],
    ]);
    const day = summariseArrivalRecords("2026-09-18", [arrival("x", "ZGSZ"), arrival("y", "RKSI"), arrival("z", "RKSI")], typecodes);
    expect(day.byCountry.length).toBeGreaterThanOrEqual(2);
    expect(day.byCountry[0].estimatedVisitors).toBeGreaterThanOrEqual(day.byCountry[1].estimatedVisitors);
    expect(day.byCountry.reduce((s, c) => s + c.flights, 0)).toBe(3);
  });

  it("falls back to a default seat count when the aircraft type is unknown", () => {
    const day = summariseArrivalRecords("2026-09-18", [arrival("nope", "ZGSZ")], new Map());
    expect(day.internationalFlights).toBe(1);
    expect(day.estimatedVisitors).toBeGreaterThan(0);
  });
});

describe("buildArrivalsResponse", () => {
  it("keeps the given day order and states the load-factor assumption", () => {
    const res = buildArrivalsResponse(
      [
        { date: "2026-09-19", arrivals: [] },
        { date: "2026-09-18", arrivals: [arrival("a", "ZGSZ")] },
      ],
      new Map([["a", "A320"]]),
      "2026-09-19T00:00:00.000Z",
    );
    expect(res.days.map((d) => d.date)).toEqual(["2026-09-19", "2026-09-18"]);
    expect(res.generatedAt).toBe("2026-09-19T00:00:00.000Z");
    expect(res.methodology).toContain("82%");
  });
});

describe("isArrivalsIngestPayload", () => {
  const good = {
    windows: [{ date: "2026-09-18", arrivals: [arrival("a", "ZGSZ")] }],
    typecodes: { a: "A320" },
  };

  it("accepts a well-formed relay payload", () => {
    expect(isArrivalsIngestPayload(good)).toBe(true);
  });

  it("rejects malformed dates, missing fields and oversized batches", () => {
    expect(isArrivalsIngestPayload({ ...good, windows: [{ date: "yesterday", arrivals: [] }] })).toBe(false);
    expect(isArrivalsIngestPayload({ ...good, windows: [] })).toBe(false);
    expect(isArrivalsIngestPayload({ ...good, windows: [{ date: "2026-09-18", arrivals: [{ icao24: 1 }] }] })).toBe(false);
    expect(isArrivalsIngestPayload({ ...good, typecodes: { a: 5 } })).toBe(false);
    expect(isArrivalsIngestPayload({ ...good, typecodes: [] })).toBe(false);
    expect(isArrivalsIngestPayload(null)).toBe(false);
    const many = Array.from({ length: 1_001 }, (_, i) => arrival(`h${i}`, "ZGSZ"));
    expect(isArrivalsIngestPayload({ ...good, windows: [{ date: "2026-09-18", arrivals: many }] })).toBe(false);
  });
});
