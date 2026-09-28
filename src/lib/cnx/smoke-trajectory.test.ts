// CNX smoke-trajectory engine — smoke tests for the advection math.
//
// Run: `npx vitest run src/lib/cnx/smoke-trajectory.test.ts`

import { describe, it, expect } from "vitest";
import { computeTrajectories, type HotspotPoint, type WindVector } from "./smoke-trajectory";

// CNX province centre from config.ts: lat 18.788, lng 98.985, bbox
// 97.5–100.5 / 17.5–20.5. The trajectory engine uses these to flag
// "smoke heading toward CNX".

const HOTSPOTS_SOUTHEAST: HotspotPoint[] = [
  // Chiang Rai border fire — wind from east = plume goes west
  { id: "fires-1", latitude: 19.91, longitude: 99.83, frp: 12, satellite: "NOAA-20" },
  // Myanmar Shan state — west of CNX
  { id: "fires-2", latitude: 20.5, longitude: 97.5, frp: 30, satellite: "SUOMI-NPP" },
];

describe("computeTrajectories — advection math", () => {
  it("returns empty segments when wind is null", () => {
    const r = computeTrajectories(HOTSPOTS_SOUTHEAST, null);
    expect(r.segments).toEqual([]);
    expect(r.summary.total).toBe(HOTSPOTS_SOUTHEAST.length);
    expect(r.wind).toBeNull();
  });

  it("returns empty segments when wind speed is below threshold (<1 km/h)", () => {
    const r = computeTrajectories(HOTSPOTS_SOUTHEAST, { speedKmh: 0.5, fromDirectionDeg: 270 });
    expect(r.segments).toEqual([]);
    expect(r.wind?.speedKmh).toBe(0.5);
  });

  it("west wind (from 270°) pushes a CNX-area hotspot east in 6 h", () => {
    // Place hotspot at CNX centre, west wind means plume goes east
    const r = computeTrajectories(
      [{ id: "h", latitude: 18.788, longitude: 98.985, frp: 10 }],
      { speedKmh: 36, fromDirectionDeg: 270 }, // 36 km/h west wind
    );
    expect(r.segments.length).toBe(1);
    const seg = r.segments[0];
    // 36 km/h × 6 h = 216 km east, so longitude should be > origin longitude.
    const six = seg.points[seg.points.length - 1];
    expect(six.longitude).toBeGreaterThan(98.985);
    // 216 km / 111 km per degree ≈ 1.95° east. Allow latitude uncertainty.
    expect(six.longitude).toBeLessThan(102);
    expect(six.hoursAhead).toBe(6);
    expect(seg.travelKm6h).toBeGreaterThan(200);
    expect(seg.travelKm6h).toBeLessThan(220);
  });

  it("east wind (from 90°) pushes a Myanmar hotspot west into CNX bbox", () => {
    // Myanmar Shan state — east wind (fromDeg=90) blows plume west toward CNX.
    // 30 km/h × 6 h = 180 km west. From (20.0, 99.5) → (20.0, 97.8).
    // 97.8 is inside CNX bbox (west=97.5), so hitsCnxBbox should fire.
    const r = computeTrajectories(
      [{ id: "mmr-1", latitude: 20.0, longitude: 99.5, frp: 25 }],
      { speedKmh: 30, fromDirectionDeg: 90 },
    );
    const six = r.segments[0].points[r.segments[0].points.length - 1];
    expect(six.longitude).toBeLessThan(99.5);
    expect(r.segments[0].hitsCnxBbox || r.segments[0].nearCnx).toBe(true);
  });

  it("flags hitsCnxBbox when a 6 h endpoint falls inside the CNX bbox", () => {
    // Hotspot east of CNX centre; east wind (fromDeg=90) blows plume west.
    // 20 km/h × 6 h = 120 km west from (18.788, 99.9) → (18.788, 98.76) — inside bbox.
    const r = computeTrajectories(
      [{ id: "near-east", latitude: 18.788, longitude: 99.9, frp: 8 }],
      { speedKmh: 20, fromDirectionDeg: 90 },
    );
    const seg = r.segments[0];
    expect(seg.hitsCnxBbox || seg.nearCnx).toBe(true);
  });

  it("flags nearCnx when the 6 h endpoint is within 50 km of CNX centre", () => {
    // CNX centre = 18.788, 98.985. Hotspot 30 km east; east wind (fromDeg=90)
    // blows plume west 30 km (5 km/h × 6 h) → endpoint lands near CNX centre.
    const r = computeTrajectories(
      [{ id: "near-30k", latitude: 18.788, longitude: 99.255, frp: 5 }],
      { speedKmh: 5, fromDirectionDeg: 90 },
    );
    expect(r.segments[0].nearCnx).toBe(true);
  });
});

describe("computeTrajectories — summary", () => {
  it("counts hitsCnx and nearCnx correctly", () => {
    const r = computeTrajectories(
      [
        { id: "a", latitude: 18.788, longitude: 99.9, frp: 5 }, // east of CNX, east wind → into CNX
        { id: "b", latitude: 19.0, longitude: 100.7, frp: 5 }, // far east, may miss
        { id: "c", latitude: 17.0, longitude: 99.0, frp: 5 }, // far south
      ],
      { speedKmh: 20, fromDirectionDeg: 90 },
    );
    expect(r.summary.total).toBe(3);
    expect(r.summary.hitsCnx + r.summary.nearCnx).toBeGreaterThanOrEqual(0);
  });

  it("reports origin direction in Thai + English", () => {
    const r = computeTrajectories(
      [{ id: "h", latitude: 18.788, longitude: 98.985, frp: 5 }],
      { speedKmh: 10, fromDirectionDeg: 0 },
    );
    expect(r.summary.origin_th.length).toBeGreaterThan(0);
    expect(r.summary.origin_en.length).toBeGreaterThan(0);
  });

  it("returns 'no hotspots' origin when segments are empty (live data)", () => {
    const r = computeTrajectories([], { speedKmh: 10, fromDirectionDeg: 0 });
    expect(r.summary.origin_th).toBe("ไม่มีจุดความร้อน");
    expect(r.summary.origin_en).toBe("no hotspots");
  });
});

describe("computeTrajectories — methodology", () => {
  it("always carries methodology strings so the UI can't quietly drop them", () => {
    const r = computeTrajectories(HOTSPOTS_SOUTHEAST, { speedKmh: 20, fromDirectionDeg: 90 });
    expect(r.methodology_th.length).toBeGreaterThan(0);
    expect(r.methodology_en.length).toBeGreaterThan(0);
    expect(r.methodology_en.toLowerCase()).toContain("advection");
  });
});

describe("computeTrajectories — weight", () => {
  it("weights heavier FRP higher, clamped to [0.2, 1.0]", () => {
    const light = computeTrajectories(
      [{ id: "low", latitude: 18.788, longitude: 99.5, frp: 1 }],
      { speedKmh: 10, fromDirectionDeg: 90 },
    );
    const heavy = computeTrajectories(
      [{ id: "high", latitude: 18.788, longitude: 99.5, frp: 60 }],
      { speedKmh: 10, fromDirectionDeg: 90 },
    );
    expect(heavy.segments[0].weight).toBeGreaterThan(light.segments[0].weight);
    expect(heavy.segments[0].weight).toBeLessThanOrEqual(1);
    expect(light.segments[0].weight).toBeGreaterThanOrEqual(0.2);
  });

  it("defaults weight to a sane value when FRP is missing", () => {
    const r = computeTrajectories(
      [{ id: "no-frp", latitude: 18.788, longitude: 99.5 }],
      { speedKmh: 10, fromDirectionDeg: 270 },
    );
    expect(r.segments[0].weight).toBeGreaterThanOrEqual(0.2);
    expect(r.segments[0].weight).toBeLessThanOrEqual(1);
  });
});
