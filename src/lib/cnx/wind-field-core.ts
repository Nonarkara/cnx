// Forecast field over Chiang Mai — wind at two heights, rain and PM2.5 on a
// regular lon/lat grid, hourly for the next 48 h. Pure and import-free: the
// map animates particles from it in the browser, and the server integrates
// smoke trajectories and district outlooks from the same numbers, so the
// arrows on screen and the warning text can never disagree.
//
// Physics kept deliberately small and named:
//   - Wind is Open-Meteo's model wind (speed + "from" direction), turned
//     into u (east) / v (north) components in m/s.
//   - Values between grid nodes are bilinear in space and linear in time.
//   - Trajectories are forward integrations of that time-varying wind with
//     a midpoint (RK2) step — a parcel follows the forecast wind as it
//     changes, so plumes curve with the flow. No diffusion, no deposition,
//     no vertical motion: it is a centreline, not a dispersion model.

export type WindLevel = "10m" | "850hPa";

export interface FieldGrid {
  /** South-west node. */
  lon0: number;
  lat0: number;
  /** Node spacing in degrees (same in both axes). */
  d: number;
  nx: number;
  ny: number;
}

/** Row-major per time step: index = j * nx + i (j = latitude row from the south).
 *  A null node is a model gap and is never read as zero. */
export type Frames = (number | null)[][];

export interface ForecastField {
  grid: FieldGrid;
  /** Hourly valid times, unix seconds, ascending. */
  times: number[];
  u10: Frames;
  v10: Frames;
  u850: Frames;
  v850: Frames;
  /** Precipitation in the hour ending at the valid time, mm. */
  precip: Frames;
  /** CAMS PM2.5 µg/m³, or null when the air-quality model did not answer. */
  pm25: Frames | null;
}

/** Wind "from" direction + speed → u (towards east), v (towards north). */
export function windToUV(speed: number, fromDeg: number): [number, number] {
  const rad = (fromDeg * Math.PI) / 180;
  return [-speed * Math.sin(rad), -speed * Math.cos(rad)];
}

/** u, v → speed and the direction the wind comes FROM (meteorological). */
export function uvToWind(u: number, v: number): { speed: number; fromDeg: number } {
  const speed = Math.hypot(u, v);
  const fromDeg = (Math.atan2(-u, -v) * 180) / Math.PI;
  return { speed, fromDeg: (fromDeg + 360) % 360 };
}

export function inGrid(g: FieldGrid, lon: number, lat: number): boolean {
  const x = (lon - g.lon0) / g.d;
  const y = (lat - g.lat0) / g.d;
  return x >= 0 && y >= 0 && x <= g.nx - 1 && y <= g.ny - 1;
}

/** Bilinear value of one frame at (lon, lat); null outside the grid or on a gap. */
export function bilinear(g: FieldGrid, frame: (number | null)[], lon: number, lat: number): number | null {
  const x = (lon - g.lon0) / g.d;
  const y = (lat - g.lat0) / g.d;
  if (!(x >= 0 && y >= 0 && x <= g.nx - 1 && y <= g.ny - 1)) return null;
  const i = Math.min(Math.floor(x), g.nx - 2);
  const j = Math.min(Math.floor(y), g.ny - 2);
  const fx = x - i;
  const fy = y - j;
  const a = frame[j * g.nx + i];
  const b = frame[j * g.nx + i + 1];
  const c = frame[(j + 1) * g.nx + i];
  const e = frame[(j + 1) * g.nx + i + 1];
  if (typeof a !== "number" || typeof b !== "number" || typeof c !== "number" || typeof e !== "number") return null;
  if (!Number.isFinite(a + b + c + e)) return null;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy;
}

/** Bracketing frames and weight for time t; null outside the forecast window. */
export function timeBracket(times: number[], t: number): { i0: number; i1: number; w: number } | null {
  if (times.length === 0 || t < times[0] || t > times[times.length - 1]) return null;
  if (times.length === 1) return { i0: 0, i1: 0, w: 0 };
  let lo = 0;
  let hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const span = times[hi] - times[lo];
  return { i0: lo, i1: hi, w: span > 0 ? (t - times[lo]) / span : 0 };
}

/** A scalar frame set sampled in space and time. */
export function sampleScalar(g: FieldGrid, times: number[], frames: Frames, lon: number, lat: number, t: number): number | null {
  const tb = timeBracket(times, t);
  if (!tb) return null;
  const a = bilinear(g, frames[tb.i0] ?? [], lon, lat);
  const b = bilinear(g, frames[tb.i1] ?? [], lon, lat);
  if (a === null || b === null) return null;
  return a + (b - a) * tb.w;
}

export type WindSource = Pick<ForecastField, "grid" | "times" | "u10" | "v10" | "u850" | "v850">;

/** Wind from the first field that covers the point (finest first). */
export function sampleWind(f: WindSource | WindSource[], level: WindLevel, lon: number, lat: number, t: number): [number, number] | null {
  for (const src of Array.isArray(f) ? f : [f]) {
    if (!inGrid(src.grid, lon, lat)) continue;
    const u = sampleScalar(src.grid, src.times, level === "10m" ? src.u10 : src.u850, lon, lat, t);
    const v = sampleScalar(src.grid, src.times, level === "10m" ? src.v10 : src.v850, lon, lat, t);
    if (u !== null && v !== null) return [u, v];
  }
  return null;
}

const M_PER_DEG_LAT = 111_320;

/** Move (lon, lat) by a velocity in m/s for dt seconds on a local flat approximation. */
export function displace(lon: number, lat: number, u: number, v: number, dt: number): [number, number] {
  const dLat = (v * dt) / M_PER_DEG_LAT;
  const dLon = (u * dt) / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  return [lon + dLon, lat + dLat];
}

export interface TracePoint {
  longitude: number;
  latitude: number;
  hoursAhead: number;
}

/**
 * Forward trajectory from (lon, lat) starting at t0 (unix s), reported at
 * each whole hour up to `hours`. Midpoint (RK2) integration, 10-minute
 * steps. Stops early — returning what it has — when the parcel leaves the
 * grid or the forecast window, so a short line means "the model field ends
 * here", never a guessed continuation.
 */
export function traceTrajectory(
  f: WindSource | WindSource[],
  level: WindLevel,
  lon: number,
  lat: number,
  t0: number,
  hours: number,
  stepSec = 600,
): TracePoint[] {
  const out: TracePoint[] = [];
  let x = lon;
  let y = lat;
  let t = t0;
  const stepsPerHour = Math.round(3600 / stepSec);
  for (let h = 1; h <= hours; h += 1) {
    for (let s = 0; s < stepsPerHour; s += 1) {
      const w1 = sampleWind(f, level, x, y, t);
      if (!w1) return out;
      const [mx, my] = displace(x, y, w1[0], w1[1], stepSec / 2);
      const w2 = sampleWind(f, level, mx, my, t + stepSec / 2);
      if (!w2) return out;
      [x, y] = displace(x, y, w2[0], w2[1], stepSec);
      t += stepSec;
    }
    out.push({ longitude: Math.round(x * 1e4) / 1e4, latitude: Math.round(y * 1e4) / 1e4, hoursAhead: h });
  }
  return out;
}

// ── District outlook ────────────────────────────────────────────────

export interface OutlookPlace {
  nameTh: string;
  nameEn: string;
  lat: number;
  lon: number;
}

export interface DistrictOutlook {
  nameTh: string;
  nameEn: string;
  /** Forecast precipitation totals, mm, from the first hour after `fromSec`. */
  rain6h: number;
  rain24h: number;
  rain48h: number;
  /** Wettest single hour in the next 48 h and when it is due (unix s). */
  peakRainMmH: number;
  peakRainAt: number | null;
  /** CAMS PM2.5 peak in the next 48 h, or null without the AQ model. */
  pm25Peak: number | null;
  pm25PeakAt: number | null;
}

/**
 * Model totals at each place's point. A grid of ~30 km cells cannot see a
 * single valley storm: these are area-scale signals for preparing, and
 * they never lower a warning that a measurement raised.
 */
export function districtOutlook(f: ForecastField, places: OutlookPlace[], fromSec: number): DistrictOutlook[] {
  const idx = f.times.map((t, i) => [t, i] as const).filter(([t]) => t > fromSec && t <= fromSec + 48 * 3600);
  return places.map((p) => {
    let rain6h = 0;
    let rain24h = 0;
    let rain48h = 0;
    let peakRainMmH = 0;
    let peakRainAt: number | null = null;
    let pm25Peak: number | null = null;
    let pm25PeakAt: number | null = null;
    for (const [t, i] of idx) {
      const r = bilinear(f.grid, f.precip[i] ?? [], p.lon, p.lat);
      if (r !== null && r > 0) {
        const hoursOut = (t - fromSec) / 3600;
        if (hoursOut <= 6) rain6h += r;
        if (hoursOut <= 24) rain24h += r;
        rain48h += r;
        if (r > peakRainMmH) {
          peakRainMmH = r;
          peakRainAt = t;
        }
      }
      if (f.pm25) {
        const pm = bilinear(f.grid, f.pm25[i] ?? [], p.lon, p.lat);
        if (pm !== null && (pm25Peak === null || pm > pm25Peak)) {
          pm25Peak = pm;
          pm25PeakAt = t;
        }
      }
    }
    const r1 = (n: number) => Math.round(n * 10) / 10;
    return {
      nameTh: p.nameTh,
      nameEn: p.nameEn,
      rain6h: r1(rain6h),
      rain24h: r1(rain24h),
      rain48h: r1(rain48h),
      peakRainMmH: r1(peakRainMmH),
      peakRainAt,
      pm25Peak: pm25Peak === null ? null : Math.round(pm25Peak),
      pm25PeakAt,
    };
  });
}

/** The board's PM2.5 levels (same cut points as air-quality.ts), so a forecast
 *  and a measurement of the same number always read the same. */
export type Pm25Level = "good" | "watch" | "alert" | "critical";
export function pm25Level(v: number): Pm25Level {
  if (v < 25) return "good";
  if (v < 50) return "watch";
  if (v < 90) return "alert";
  return "critical";
}
