import { describe, expect, it } from "vitest";
import { summariseVisitors } from "./visitors";
import type { FlightState } from "./opensky";
const state = { icao24: "abc", callsign: "FD123", originCountry: "Thailand", onGround: false, latitude: 18.9, longitude: 98.9853, trueTrack: 180 } as FlightState;
describe("seat snapshot history", () => {
  it("replaces the current Bangkok-hour poll instead of counting the same flight again", () => {
    const ts = Date.parse("2026-10-02T06:00:00Z");
    const first = summariseVisitors([state], { ts });
    const second = summariseVisitors([state], { ts, hourly: first.visitorsByHour });
    expect(second.visitorsByHour.find((r) => r.hour === 13)?.visitors).toBe(first.visitorsToday);
    expect(second.visitorsByHour.find((r) => r.hour === 13)?.inbound).toBe(1);
    expect(second.methodology).toMatch(/not departure airport or passenger nationality/);
  });
});
