import { describe, expect, it } from "vitest";
import { nearestGauges, summariseFloodHub } from "./floodhub";

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
      { gaugeId: "a", severity: "NO_FLOODING", forecastTrend: "FALL" },
      { gaugeId: "b", severity: "NO_FLOODING", forecastTrend: "RISE" },
    ]);
    expect(s.outlook).toBe("none-forecast");
    expect(s.worst).toBe("NO_FLOODING");
    expect(s.note).toMatch(/not an all-clear/);
  });

  it("escalates when any single point forecasts flooding", () => {
    const s = summariseFloodHub(gauges, [
      { gaugeId: "a", severity: "NO_FLOODING" },
      { gaugeId: "b", severity: "SEVERE", forecastTrend: "RISE" },
    ]);
    expect(s.outlook).toBe("flooding");
    expect(s.worst).toBe("SEVERE");
  });

  it("stays unknown when no status came back, rather than reading as calm", () => {
    const s = summariseFloodHub(gauges, []);
    expect(s.outlook).toBe("unknown");
    expect(s.points.every((p) => p.severity === "UNKNOWN")).toBe(true);
  });

  it("treats unrecognised severity strings as unknown", () => {
    expect(summariseFloodHub(gauges, [{ gaugeId: "a", severity: "WHATEVER" }]).points[0].severity).toBe("UNKNOWN");
  });
});
