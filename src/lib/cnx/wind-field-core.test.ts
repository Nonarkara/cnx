import { describe, expect, it } from "vitest";
import {
  bilinear,
  districtOutlook,
  inGrid,
  pm25Level,
  sampleWind,
  timeBracket,
  traceTrajectory,
  uvToWind,
  windToUV,
  type FieldGrid,
  type ForecastField,
} from "./wind-field-core";

const grid: FieldGrid = { lon0: 98, lat0: 18, d: 0.5, nx: 5, ny: 5 }; // 98–100 °E, 18–20 °N
const n = grid.nx * grid.ny;
const fill = (v: number) => Array.from({ length: n }, () => v);
const T0 = 1_791_700_000 - (1_791_700_000 % 3600);
const times = Array.from({ length: 49 }, (_, i) => T0 + i * 3600);

function uniform(u: number, v: number, extra: Partial<ForecastField> = {}): ForecastField {
  return {
    grid,
    times,
    u10: times.map(() => fill(u)),
    v10: times.map(() => fill(v)),
    u850: times.map(() => fill(u * 2)),
    v850: times.map(() => fill(v * 2)),
    precip: times.map(() => fill(0)),
    pm25: null,
    ...extra,
  };
}

describe("wind components", () => {
  it("a west wind (from 270°) blows towards the east: u > 0, v = 0", () => {
    const [u, v] = windToUV(10, 270);
    expect(u).toBeCloseTo(10);
    expect(v).toBeCloseTo(0);
  });

  it("a north wind (from 0°) blows towards the south", () => {
    const [u, v] = windToUV(5, 0);
    expect(u).toBeCloseTo(0);
    expect(v).toBeCloseTo(-5);
  });

  it("round-trips speed and direction", () => {
    for (const dir of [0, 45, 135, 200, 315]) {
      const [u, v] = windToUV(7, dir);
      const back = uvToWind(u, v);
      expect(back.speed).toBeCloseTo(7);
      expect(back.fromDeg).toBeCloseTo(dir, 5);
    }
  });
});

describe("interpolation", () => {
  it("is bilinear between nodes and null outside the grid", () => {
    const frame = Array.from({ length: n }, (_, k) => k % grid.nx); // value = column index
    expect(bilinear(grid, frame, 98.25, 18.1)).toBeCloseTo(0.5);
    expect(bilinear(grid, frame, 100, 20)).toBeCloseTo(4);
    expect(bilinear(grid, frame, 97.9, 19)).toBeNull();
    expect(inGrid(grid, 100.01, 19)).toBe(false);
  });

  it("treats a missing node as a gap, not as zero", () => {
    const frame = fill(3);
    frame[0] = Number.NaN;
    expect(bilinear(grid, frame, 98.1, 18.1)).toBeNull();
    expect(bilinear(grid, frame, 99.6, 19.6)).toBeCloseTo(3);
  });

  it("brackets time and refuses to extrapolate past the forecast", () => {
    expect(timeBracket(times, T0 + 1800)).toEqual({ i0: 0, i1: 1, w: 0.5 });
    expect(timeBracket(times, T0 - 1)).toBeNull();
    expect(timeBracket(times, times[48] + 1)).toBeNull();
  });

  it("samples the chosen height", () => {
    const f = uniform(1, 0);
    expect(sampleWind(f, "10m", 99, 19, T0)?.[0]).toBeCloseTo(1);
    expect(sampleWind(f, "850hPa", 99, 19, T0)?.[0]).toBeCloseTo(2);
  });
});

describe("traceTrajectory", () => {
  it("a steady 5 m/s west wind carries a parcel ~18 km east per hour", () => {
    const pts = traceTrajectory(uniform(5, 0), "10m", 98.5, 19, T0, 3);
    expect(pts).toHaveLength(3);
    const kmEast = (pts[2].longitude - 98.5) * 111.32 * Math.cos((19 * Math.PI) / 180);
    expect(kmEast).toBeCloseTo(54, 0);
    expect(pts[2].latitude).toBeCloseTo(19, 3);
    expect(pts.map((p) => p.hoursAhead)).toEqual([1, 2, 3]);
  });

  it("curves when the forecast wind turns", () => {
    // East wind for the first two hours, then a south wind.
    const f = uniform(0, 0, {
      u10: times.map((_, i) => fill(i < 2 ? 5 : 0)),
      v10: times.map((_, i) => fill(i < 2 ? 0 : 5)),
    });
    const pts = traceTrajectory(f, "10m", 98.5, 18.5, T0, 4);
    expect(pts[3].latitude).toBeGreaterThan(pts[1].latitude + 0.1);
    expect(pts[3].longitude).toBeGreaterThan(98.5 + 0.1);
  });

  it("stops at the grid edge instead of guessing beyond it", () => {
    const pts = traceTrajectory(uniform(20, 0), "10m", 99.8, 19, T0, 6);
    expect(pts.length).toBeLessThan(6);
    for (const p of pts) expect(p.longitude).toBeLessThanOrEqual(100);
  });
});

describe("districtOutlook", () => {
  const place = { nameTh: "แม่แจ่ม", nameEn: "Mae Chaem", lat: 18.5, lon: 98.4 };

  it("sums forecast rain over 6, 24 and 48 hours from the next hour", () => {
    const f = uniform(0, 0, { precip: times.map(() => fill(2)) });
    const [o] = districtOutlook(f, [place], T0);
    expect(o.rain6h).toBe(12);
    expect(o.rain24h).toBe(48);
    expect(o.rain48h).toBe(96);
    expect(o.peakRainMmH).toBe(2);
    expect(o.pm25Peak).toBeNull();
  });

  it("finds the PM2.5 peak and its time", () => {
    const f = uniform(0, 0, { pm25: times.map((_, i) => fill(i === 30 ? 95 : 20)) });
    const [o] = districtOutlook(f, [place], T0);
    expect(o.pm25Peak).toBe(95);
    expect(o.pm25PeakAt).toBe(times[30]);
  });
});

describe("pm25Level", () => {
  it("uses the board's own cut points", () => {
    expect([10, 25, 49.9, 50, 89, 90].map(pm25Level)).toEqual(["good", "watch", "watch", "alert", "alert", "critical"]);
  });
});
