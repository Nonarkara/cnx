import { describe, expect, it } from "vitest";
import { nearestGauges, summariseFloodHub, floodHubNote } from "./floodhub";

const statusTime = () => ({ issuedTime: new Date(Date.now() - 3_600_000).toISOString(), forecastTimeRange: { start: new Date(Date.now() - 3_600_000).toISOString(), end: new Date(Date.now() + 24 * 3_600_000).toISOString() } });
const gauge = (id: string, lat: number, lon: number) => ({ gaugeId: id, location: { latitude: lat, longitude: lon }, qualityVerified: false });

describe("nearestGauges", () => {
  it("keeps points within 30 km of the city, nearest first", () => {
    const out = nearestGauges([gauge("far", 20.0, 99.3), gauge("mid", 18.72, 98.99), gauge("near", 18.82, 98.99)]);
    expect(out.map((g) => g.gaugeId)).toEqual(["near", "mid"]);
    expect(out[0].kmFromCity).toBeLessThan(5);
  });
});

describe("summariseFloodHub", () => {
  const gauges = nearestGauges([gauge("a", 18.82, 98.99), gauge("b", 18.72, 98.99)]);

  it("reports 'none forecast', never 'safe', when every point says no flooding", () => {
    const s = summariseFloodHub(gauges, [
      { ...statusTime(), gaugeId: "a", severity: "NO_FLOODING", forecastTrend: "FALL" },
      { ...statusTime(), gaugeId: "b", severity: "NO_FLOODING", forecastTrend: "RISE" },
    ]);
    expect(s.outlook).toBe("none-forecast");
    expect(s.worst).toBe("NO_FLOODING");
    expect(s.note).toMatch(/not an all-clear/);
  });

  it("escalates when any single point forecasts flooding", () => {
    const s = summariseFloodHub(gauges, [
      { ...statusTime(), gaugeId: "a", severity: "NO_FLOODING" },
      { ...statusTime(), gaugeId: "b", severity: "SEVERE", forecastTrend: "RISE" },
    ]);
    expect(s.outlook).toBe("flooding");
    expect(s.worst).toBe("SEVERE");
  });

  it("stays unknown when no status came back, rather than reading as calm", () => {
    const s = summariseFloodHub(gauges, []);
    expect(s.outlook).toBe("unknown");
    expect(s.points.every((p) => p.severity === "UNKNOWN")).toBe(true);
  });

  it("does not treat expired or undated no-flood forecasts as current", () => {
    const expired = { ...statusTime(), gaugeId: "a", severity: "NO_FLOODING", forecastTimeRange: { start: "2020-01-01T00:00:00Z", end: "2020-01-02T00:00:00Z" } };
    const s = summariseFloodHub(gauges, [expired, { gaugeId: "b", severity: "NO_FLOODING" }]);
    expect(s.outlook).toBe("unknown");
    expect(s.provenance).toBe("unavailable");
  });

  it("uses a fresh forecast whose window lies days ahead (the normal shape)", () => {
    // Live 2026-10-03: issued 11:59Z for 6–7 Oct. It must count.
    const now = "2026-10-03T15:00:00.000Z";
    const s = summariseFloodHub(
      gauges,
      [
        { gaugeId: "a", severity: "NO_FLOODING", forecastTrend: "FALL", issuedTime: "2026-10-03T11:59:07Z", forecastTimeRange: { start: "2026-10-06T00:00:00Z", end: "2026-10-07T00:00:00Z" } },
        { gaugeId: "b", severity: "NO_FLOODING", forecastTrend: "FALL", issuedTime: "2026-10-03T13:07:31Z", forecastTimeRange: { start: "2026-10-06T00:00:00Z", end: "2026-10-07T00:00:00Z" } },
      ],
      now,
    );
    expect(s.provenance).toBe("live");
    expect(s.outlook).toBe("none-forecast");
  });

  it("treats unrecognised severity strings as unknown", () => {
    expect(summariseFloodHub(gauges, [{ ...statusTime(), gaugeId: "a", severity: "WHATEVER" }]).points[0].severity).toBe("UNKNOWN");
  });
});

describe("floodHubNote — the caveat must describe the points actually shown", () => {
  const unverified = (n: number) => Array.from({ length: n }, () => ({ qualityVerified: false }));
  const verified = (n: number) => Array.from({ length: n }, () => ({ qualityVerified: true }));

  it("says 'none of' when nothing on screen is verified", () => {
    // The live case: twelve HYBAS virtual points, zero verified. The old
    // fixed string said "most are not quality-verified", which reads as
    // "some are" and is false of this screen.
    const note = floodHubNote(unverified(12));
    expect(note).toMatch(/none of the 12 points shown are quality-verified/);
    expect(note).not.toMatch(/\bmost are not\b/);
  });

  it("states the verified count when Google validates some of them", () => {
    const note = floodHubNote([...verified(2), ...unverified(10)]);
    expect(note).toMatch(/only 2 of the 12 points shown are quality-verified/);
  });

  it("says all when every point is verified", () => {
    expect(floodHubNote(verified(3))).toMatch(/all 3 points shown are quality-verified/);
  });

  it("always names the flood types it does not cover", () => {
    // FloodHub forecasts riverine flooding only. Chiang Mai's acute city
    // flood mode is urban, so a clean riverine forecast is silent about
    // the thing that floods streets.
    for (const note of [floodHubNote(unverified(12)), floodHubNote(verified(2)), floodHubNote([])]) {
      expect(note).toMatch(/river flooding only/i);
      expect(note).toMatch(/does not cover urban or flash flooding/i);
    }
  });

  it("keeps the two rules that were already right", () => {
    const note = floodHubNote(unverified(12));
    expect(note).toMatch(/is a reason to prepare/);
    expect(note).toMatch(/is not an all-clear/);
  });
});
