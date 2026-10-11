// Pure rendering helpers for the forecast layer: colour ramps for the rain
// and PM2.5 fields, the screen-space velocity grid the wind particles read,
// and a geographic raster of a scalar field. No React, no map library —
// the component passes `project`/`unproject` in, so these are testable.

import { bilinear, sampleScalar, sampleWind, timeBracket, type ForecastField, type WindLevel } from "../../lib/cnx/wind-field-core";

export type Rgba = [number, number, number, number];

/** Rain intensity, mm per hour — WMO classes: light < 2.5, moderate 2.5–7.6,
 *  heavy 7.6–50, violent > 50. A cool ramp: rain is not a warning colour by
 *  itself; the warning comes from the totals and the text. */
export const RAIN_STOPS: [number, Rgba][] = [
  [0.1, [158, 202, 225, 0]],
  [0.5, [158, 202, 225, 110]],
  [2.5, [66, 146, 198, 160]],
  [7.6, [8, 81, 156, 190]],
  [20, [63, 0, 125, 210]],
  [50, [63, 0, 125, 230]],
];

/** PM2.5 µg/m³ on the board's own levels (good < 25, watch < 50, alert < 90,
 *  critical ≥ 90). Clean air stays almost clear so the map is not tinted by
 *  good news; colour rises with the concern. */
export function pm25Stops(sev: { good: Rgba; watch: Rgba; alert: Rgba; critical: Rgba }): [number, Rgba][] {
  return [
    [10, [sev.good[0], sev.good[1], sev.good[2], 0]],
    [24.9, [sev.good[0], sev.good[1], sev.good[2], 50]],
    [25, [sev.watch[0], sev.watch[1], sev.watch[2], 120]],
    [50, [sev.alert[0], sev.alert[1], sev.alert[2], 150]],
    [90, [sev.critical[0], sev.critical[1], sev.critical[2], 175]],
    [200, [sev.critical[0], sev.critical[1], sev.critical[2], 205]],
  ];
}

export function rampColor(stops: [number, Rgba][], v: number): Rgba {
  if (v <= stops[0][0]) return stops[0][1];
  for (let k = 1; k < stops.length; k += 1) {
    const [x1, c1] = stops[k];
    if (v <= x1) {
      const [x0, c0] = stops[k - 1];
      const w = x1 > x0 ? (v - x0) / (x1 - x0) : 1;
      return [0, 1, 2, 3].map((i) => Math.round(c0[i] + (c1[i] - c0[i]) * w)) as Rgba;
    }
  }
  return stops[stops.length - 1][1];
}

/** Paint a scalar field at time t into RGBA pixels covering the grid's extent
 *  (north-up rows). Returns null if t is outside the forecast. */
export function rasterize(
  f: ForecastField,
  frames: (number | null)[][],
  t: number,
  stops: [number, Rgba][],
  width: number,
  height: number,
): Uint8ClampedArray | null {
  const tb = timeBracket(f.times, t);
  if (!tb) return null;
  const g = f.grid;
  const out = new Uint8ClampedArray(width * height * 4);
  const lonSpan = (g.nx - 1) * g.d;
  const latSpan = (g.ny - 1) * g.d;
  const a = frames[tb.i0] ?? [];
  const b = frames[tb.i1] ?? [];
  for (let y = 0; y < height; y += 1) {
    const lat = g.lat0 + latSpan * (1 - (y + 0.5) / height);
    for (let x = 0; x < width; x += 1) {
      const lon = g.lon0 + lonSpan * ((x + 0.5) / width);
      const va = bilinear(g, a, lon, lat);
      const vb = bilinear(g, b, lon, lat);
      if (va === null || vb === null) continue;
      const c = rampColor(stops, va + (vb - va) * tb.w);
      const o = (y * width + x) * 4;
      out[o] = c[0];
      out[o + 1] = c[1];
      out[o + 2] = c[2];
      out[o + 3] = c[3];
    }
  }
  return out;
}

/** Geographic corners of the field for a MapLibre image source (TL, TR, BR, BL). */
export function fieldCorners(f: ForecastField): [[number, number], [number, number], [number, number], [number, number]] {
  const g = f.grid;
  const w = g.lon0;
  const e = g.lon0 + (g.nx - 1) * g.d;
  const s = g.lat0;
  const n = g.lat0 + (g.ny - 1) * g.d;
  return [[w, n], [e, n], [e, s], [w, s]];
}

// ── Screen-space velocity grid ─────────────────────────────────────

export interface ScreenBasis {
  /** Grid spacing in CSS px. */
  step: number;
  cols: number;
  rows: number;
  lon: Float32Array;
  lat: Float32Array;
  /** Pixel displacement of 1 km east / north at each node, normalised so a
   *  km at the screen centre is 1 — keeps particle speed independent of
   *  zoom while keeping the tilt's perspective. NaN where off the field. */
  ex: Float32Array;
  ey: Float32Array;
  nx: Float32Array;
  ny: Float32Array;
}

type Project = (lngLat: [number, number]) => { x: number; y: number };
type Unproject = (px: [number, number]) => { lng: number; lat: number };

const KM_DEG_LAT = 1 / 111.32;

/** Recomputed only when the view changes (pan, zoom, tilt, resize). */
export function buildScreenBasis(width: number, height: number, step: number, project: Project, unproject: Unproject): ScreenBasis {
  const cols = Math.ceil(width / step) + 1;
  const rows = Math.ceil(height / step) + 1;
  const size = cols * rows;
  const basis: ScreenBasis = {
    step,
    cols,
    rows,
    lon: new Float32Array(size),
    lat: new Float32Array(size),
    ex: new Float32Array(size).fill(Number.NaN),
    ey: new Float32Array(size).fill(Number.NaN),
    nx: new Float32Array(size).fill(Number.NaN),
    ny: new Float32Array(size).fill(Number.NaN),
  };
  const c = unproject([width / 2, height / 2]);
  const c0 = project([c.lng, c.lat]);
  const cE = project([c.lng + KM_DEG_LAT / Math.cos((c.lat * Math.PI) / 180), c.lat]);
  const ref = Math.hypot(cE.x - c0.x, cE.y - c0.y) || 1;
  for (let r = 0; r < rows; r += 1) {
    for (let k = 0; k < cols; k += 1) {
      const i = r * cols + k;
      const ll = unproject([k * step, r * step]);
      if (!Number.isFinite(ll.lng) || !Number.isFinite(ll.lat)) continue;
      basis.lon[i] = ll.lng;
      basis.lat[i] = ll.lat;
      const p = project([ll.lng, ll.lat]);
      const pe = project([ll.lng + KM_DEG_LAT / Math.cos((ll.lat * Math.PI) / 180), ll.lat]);
      const pn = project([ll.lng, ll.lat + KM_DEG_LAT]);
      basis.ex[i] = (pe.x - p.x) / ref;
      basis.ey[i] = (pe.y - p.y) / ref;
      basis.nx[i] = (pn.x - p.x) / ref;
      basis.ny[i] = (pn.y - p.y) / ref;
    }
  }
  return basis;
}

export interface VelocityGrid {
  basis: ScreenBasis;
  /** Screen velocity, px per frame; NaN = no wind known here. */
  vx: Float32Array;
  vy: Float32Array;
  /** Wind speed m/s at each node (for particle brightness). */
  speed: Float32Array;
}

/** Cheap: re-run whenever the forecast time or height changes. Screen speed is
 *  motionK·√speed (times the tilt's perspective), direction exact. */
export function buildVelocityGrid(f: ForecastField, level: WindLevel, t: number, basis: ScreenBasis, motionK: number): VelocityGrid {
  const size = basis.cols * basis.rows;
  const vx = new Float32Array(size).fill(Number.NaN);
  const vy = new Float32Array(size).fill(Number.NaN);
  const speed = new Float32Array(size).fill(Number.NaN);
  for (let i = 0; i < size; i += 1) {
    if (!Number.isFinite(basis.ex[i])) continue;
    const w = sampleWind(f, level, basis.lon[i], basis.lat[i], t);
    if (!w) continue;
    const [u, v] = w;
    const s = Math.hypot(u, v);
    const k = s > 0 ? (motionK * Math.sqrt(s)) / s : 0;
    vx[i] = (u * basis.ex[i] + v * basis.nx[i]) * k;
    vy[i] = (u * basis.ey[i] + v * basis.ny[i]) * k;
    speed[i] = s;
  }
  return { basis, vx, vy, speed };
}

/** Bilinear lookup of the velocity grid at a screen point. */
export function velocityAt(g: VelocityGrid, x: number, y: number): [number, number, number] | null {
  const { step, cols, rows } = g.basis;
  const fx = x / step;
  const fy = y / step;
  const k = Math.floor(fx);
  const r = Math.floor(fy);
  if (k < 0 || r < 0 || k >= cols - 1 || r >= rows - 1) return null;
  const tx = fx - k;
  const ty = fy - r;
  const i00 = r * cols + k;
  const i10 = i00 + 1;
  const i01 = i00 + cols;
  const i11 = i01 + 1;
  const lerp2 = (arr: Float32Array) => (arr[i00] * (1 - tx) + arr[i10] * tx) * (1 - ty) + (arr[i01] * (1 - tx) + arr[i11] * tx) * ty;
  const vx = lerp2(g.vx);
  const vy = lerp2(g.vy);
  if (!Number.isFinite(vx) || !Number.isFinite(vy)) return null;
  return [vx, vy, lerp2(g.speed)];
}

/** Forecast wind at one point as speed + "from" direction, for the readout. */
export function windReadout(f: ForecastField, level: WindLevel, lon: number, lat: number, t: number): { speed: number; fromDeg: number } | null {
  const w = sampleWind(f, level, lon, lat, t);
  if (!w) return null;
  const speed = Math.hypot(w[0], w[1]);
  const fromDeg = ((Math.atan2(-w[0], -w[1]) * 180) / Math.PI + 360) % 360;
  return { speed, fromDeg };
}

export function scalarReadout(f: ForecastField, frames: (number | null)[][] | null, lon: number, lat: number, t: number): number | null {
  return frames ? sampleScalar(f.grid, f.times, frames, lon, lat, t) : null;
}

const COMPASS_TH = ["เหนือ", "ตะวันออกเฉียงเหนือ", "ตะวันออก", "ตะวันออกเฉียงใต้", "ใต้", "ตะวันตกเฉียงใต้", "ตะวันตก", "ตะวันตกเฉียงเหนือ"];
export function compassTh(deg: number): string {
  return COMPASS_TH[Math.round(deg / 45) % 8] ?? "เหนือ";
}
