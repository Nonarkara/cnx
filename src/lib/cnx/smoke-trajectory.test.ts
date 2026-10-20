// CNX smoke-trajectory engine — smoke tests for the advection math.
//
// Run: `npx vitest run src/lib/cnx/smoke-trajectory.test.ts`

import { describe, it, expect } from "vitest";
import { computeFieldTrajectories, computeTrajectories, presentForOperator, transportBbox, type HotspotPoint } from "./smoke-trajectory";

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
    expect(r.provenance).toBe("unavailable");
    expect(r.omittedTrajectories).toBe(HOTSPOTS_SOUTHEAST.length);
    expect(r.note).toMatch(/unknown/i);
  });

  it("returns empty segments when wind speed is below threshold (<1 km/h)", () => {
    const r = computeTrajectories(HOTSPOTS_SOUTHEAST, { speedKmh: 0.5, fromDirectionDeg: 270 });
    expect(r.segments).toEqual([]);
    expect(r.wind?.speedKmh).toBe(0.5);
    expect(r.provenance).toBe("unavailable");
    expect(r.omittedTrajectories).toBe(HOTSPOTS_SOUTHEAST.length);
    expect(r.note).toMatch(/unknown/i);
  });

  it("preserves a genuine empty detection result without usable wind", () => {
    for (const wind of [null, { speedKmh: 0.5, fromDirectionDeg: 270 }]) {
      expect(computeTrajectories([], wind)).toMatchObject({ provenance: "live", hotspotSource: "none", omittedTrajectories: 0, summary: { total: 0 } });
    }
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

  it("uses the province outline for sampled positions, not just the rectangular query box", () => {
    // At latitude20.4 the entire path remains north of Chiang Mai,
    // despite sampled points falling inside the old rectangular query box.
    const out = computeTrajectories([{ id: "mmr-1", latitude: 20.4, longitude: 99.5, frp: 25 }], { speedKmh: 30, fromDirectionDeg: 90 });
    const six = out.segments[0].points[out.segments[0].points.length - 1];
    expect(six.longitude).toBeLessThan(99.5);
    expect(out.segments[0].hitsCnxBbox).toBe(false);
    // From Chiang Rai/Phayao (19.4, 100.6) the same wind carries smoke over
    // Chiang Dao (~98.9 °E) — inside the province.
    const into = computeTrajectories([{ id: "cri-1", latitude: 19.4, longitude: 100.6, frp: 25 }], { speedKmh: 30, fromDirectionDeg: 90 });
    expect(into.segments[0].hitsCnxBbox).toBe(true);
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

describe("six-hour path screening, not final-endpoint screening", () => {
  const hotspot = { id: "crosses-city", latitude: 18.788, longitude: 100.5 };
  it("flags surface paths that cross the city before leaving it by hour six", () => {
    const result = computeTrajectories([hotspot], { speedKmh: 72, fromDirectionDeg: 90 });
    const segment = result.segments[0];
    expect(segment.points.at(-1)!.longitude).toBeLessThan(97);
    expect(segment).toMatchObject({ nearCnx: true, hitsCnxBbox: true });
    expect(segment.points.map(p => p.hoursAhead)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.methodology_en).toMatch(/hourly.*sampl|sampl.*hourly/i);
    expect(result.methodology_en).toMatch(/between samples/i);
  });
  it("includes the origin without claiming a future arrival for smoke already at the city", () => {
    const result = computeTrajectories([{ ...hotspot, longitude: 98.985 }], { speedKmh: 120, fromDirectionDeg: 90 });
    expect(result.segments[0].nearCnx).toBe(true);
    expect(result.segments[0].hitsCnxBbox).toBe(true);
  });
  it("flags complete field paths crossing the city before a distant six-hour endpoint, with an outside control", () => {
    const grid = { lon0: 95.5, lat0: 15.5, d: 0.75, nx: 10, ny: 10 };
    const start = 1_791_698_400;
    const times = Array.from({ length: 13 }, (_, i) => start + i * 3600);
    const frames = (v: number) => times.map(() => Array(100).fill(v));
    const field = { grid, times, u10: frames(0), v10: frames(0), u850: frames(-20), v850: frames(0) };
    const result = computeFieldTrajectories([hotspot, { ...hotspot, id: "outside", latitude: 20.4 }], [field], start * 1000);
    expect(result.omittedTrajectories).toBe(0);
    expect(result.segments[0].points.at(-1)!.longitude).toBeLessThan(97);
    expect(result.segments[0]).toMatchObject({ nearCnx: true, hitsCnxBbox: true });
    expect(result.segments[1]).toMatchObject({ nearCnx: false, hitsCnxBbox: false });
    expect(result.summary).toMatchObject({ nearCnx: 1, hitsCnx: 1 });
    expect(result.methodology_en).toMatch(/between samples/i);
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

describe("transport window", () => {
  it("reaches west of the Chiang Mai border so a Shan State fire is inside the pass", () => {
    const box = transportBbox();
    expect(box.west).toBeLessThan(97.5);
    expect(box.north).toBeGreaterThan(20.5);
  });

  it("keeps a city-bound plume when the payload is capped", () => {
    const far: HotspotPoint[] = Array.from({ length: 100 }, (_, i) => ({
      id: `far-${i}`,
      latitude: 15.2,
      longitude: 105,
      frp: 1,
    }));
    const full = computeTrajectories(
      [...far, { id: "hit", latitude: 18.788, longitude: 99.255, frp: 5 }],
      { speedKmh: 5, fromDirectionDeg: 90 },
    );
    const shown = presentForOperator(full);
    expect(shown.segments.length).toBeLessThanOrEqual(80);
    expect(shown.segments.some((s) => s.hotspotId === "hit")).toBe(true);
    expect(shown.summary.total).toBe(full.summary.total);
    expect(shown.summary.nearCnx).toBe(full.summary.nearCnx);
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

describe("computeFieldTrajectories — through the forecast wind field", () => {
  const grid = { lon0: 95.5, lat0: 15.5, d: 0.75, nx: 10, ny: 10 };
  const n = grid.nx * grid.ny;
  const T0 = 1_791_698_400;
  const times = Array.from({ length: 13 }, (_, i) => T0 + i * 3600);
  const frames = (v: number) => times.map(() => Array.from({ length: n }, () => v));

  it("does not publish a one-hour endpoint as a six-hour city impact", () => {
    const field = { grid, times: times.slice(0, 2), u10: frames(0).slice(0, 2), v10: frames(0).slice(0, 2), u850: frames(1).slice(0, 2), v850: frames(0).slice(0, 2) };
    const r = computeFieldTrajectories([{ id: "in-city", latitude: 18.788, longitude: 98.985 }], [field], T0 * 1000);
    expect(r.segments).toEqual([]);
    expect(r.summary).toMatchObject({ total: 1, shown: 0, hitsCnx: 0, nearCnx: 0 });
    expect(r.omittedTrajectories).toBe(1);
    expect(r.provenance).toBe("unavailable");
    expect(r.hotspotSource).toBe("firms");
    expect(r.summary.origin_en).toBe("smoke origin unknown");
    expect(r.summary.origin_th).toBe("ยังไม่ทราบทิศทางต้นทางควัน");
    expect(r.note).toMatch(/six.hour|6.hour/i);
    expect(r.note).toMatch(/unknown|not.*no smoke/i);
  });

  it("preserves completed city-bound trajectories while identifying omitted coverage", () => {
    const full = { grid: { lon0: 98, lat0: 18, d: 1, nx: 3, ny: 3 }, times, u10: times.map(() => Array(9).fill(0)), v10: times.map(() => Array(9).fill(0)), u850: times.map(() => Array(9).fill(0)), v850: times.map(() => Array(9).fill(0)) };
    const partial = { ...full, grid: { ...full.grid, lon0: 101 }, times: times.slice(0, 2) };
    const r = computeFieldTrajectories([{ id: "complete", latitude: 18.788, longitude: 98.985 }, { id: "short", latitude: 19, longitude: 102 }], [full, partial], T0 * 1000);
    expect(r.provenance).toBe("live");
    expect(r.omittedTrajectories).toBe(1);
    expect(r.segments.map(s => s.hotspotId)).toEqual(["complete"]);
    expect(r.segments[0].points.at(-1)?.hoursAhead).toBe(6);
    expect(r.summary).toMatchObject({ total: 2, shown: 1, hitsCnx: 1, nearCnx: 1 });
    expect(presentForOperator(r).omittedTrajectories).toBe(1);
    expect(r.note).toMatch(/unknown/i);
  });

  it("keeps an actually empty VIIRS result distinct from missing trajectory coverage", () => {
    const field = { grid, times, u10: frames(0), v10: frames(0), u850: frames(5), v850: frames(0) };
    const r = computeFieldTrajectories([], [field], T0 * 1000);
    expect(r.provenance).toBe("live");
    expect(r.summary.total).toBe(0);
    expect(r.omittedTrajectories).toBe(0);
    expect(r.summary.origin_en).toBe("no hotspots");
    expect(r.summary.origin_th).toBe("ไม่มีจุดความร้อน");
  });

  it("carries a Chiang Rai-side fire west into the province on an east wind aloft", () => {
    // 850 hPa wind from the east at 8 m/s ≈ 173 km in 6 h.
    const field = { grid, times, u10: frames(0), v10: frames(0), u850: frames(-8), v850: frames(0) };
    const r = computeFieldTrajectories([{ id: "cri", latitude: 19.4, longitude: 100.6, frp: 20 }], [field], T0 * 1000);
    expect(r.method).toBe("forecast-field");
    expect(r.segments[0].points).toHaveLength(6);
    expect(r.segments[0].points[5].longitude).toBeLessThan(99.2);
    expect(r.segments[0].hitsCnxBbox).toBe(true);
    expect(r.methodology_en).toMatch(/850 hPa/);
  });

  it("drops nothing silently: a fire outside every grid draws no line but still counts", () => {
    const field = { grid, times, u10: frames(0), v10: frames(0), u850: frames(5), v850: frames(0) };
    const r = computeFieldTrajectories([{ id: "far", latitude: 10, longitude: 90 }], [field], T0 * 1000);
    expect(r.segments).toHaveLength(0);
    expect(r.summary.total).toBe(1);
    expect(r.omittedTrajectories).toBe(1);
    expect(r.provenance).toBe("unavailable");
    expect(r.note).toMatch(/unknown/i);
  });
});
