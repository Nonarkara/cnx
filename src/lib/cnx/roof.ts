/**
 * Roofs for the city — the shape that sits on top of every building.
 *
 * ── Why this is a model, and what it is modelled from ───────────────────
 *
 * Roof form is a schematic assumption based on building type and footprint,
 * not a measured reconstruction. The minimum-area rectangle may simplify an
 * irregular footprint. Existing building heights may come from explicit OSM
 * tags, levels times three metres, or the extractor's nine-metre fallback.
 * A roof reuses that supplied total; it does not add a measured height.
 */

import { EARTH_LAT_M, metresPerDegreeLon } from "./geo.ts";

/** A roof's form. Two kinds — that is what a city has. */
export type RoofKind = "gable" | "flat";

/** What a roof belongs to, so the renderer can colour it. */
export type RoofCategory = "city-gable" | "city-flat" | "hall" | "side_hall" | "gate";

/** A rectangle with a direction: the footprint a roof is built on. */
export interface OrientedRect {
  /** Centre, [lon, lat]. */
  centre: [number, number];
  /** Ridge length, metres. */
  length: number;
  /** Span across the ridge, eaves to eaves, metres. */
  width: number;
  /** Bearing of the ridge axis, radians clockwise from north. */
  rotation: number;
}

/** One roof, ready to draw. */
export interface RoofInstance extends OrientedRect {
  /** Eaves height above ground, metres. */
  eaves: number;
  /** Rise from the eaves to the ridge, metres. */
  rise: number;
  /** Form. */
  kind: RoofKind;
  /** What it belongs to. */
  category: RoofCategory;
  /** The supplied total height — eaves + rise; may itself be estimated. */
  total: number;
}

/** A local 2-D point, metres east/north of an origin. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Metres per degree of latitude. */
const METRES_PER_DEGREE_LAT = EARTH_LAT_M;

/**
 * OSM building types that are houses. These get a pitched roof: a
 * gable is what a low-rise dwelling has over it, and in Chiang Mai that
 * is most of the housing stock.
 */
export const GABLE_TYPES = new Set([
  "house",
  "detached",
  "detached_house",
  "semidetached_house",
  "terrace",
  "terraced_house",
  "bungalow",
  "hut",
  "cabin",
  "residential",
  "dormitory",
  "farm",
  "farm_auxiliary",
]);

/**
 * OSM building types that are plainly not houses. These get a flat
 * roof: a flat block of flats, a warehouse or a school hall does not
 * carry a tiled gable.
 */
export const FLAT_TYPES = new Set([
  "apartments",
  "commercial",
  "retail",
  "office",
  "industrial",
  "warehouse",
  "hangar",
  "hotel",
  "hospital",
  "school",
  "university",
  "public",
  "civic",
  "garage",
  "garages",
  "greenhouses",
  "greenhouse",
  "glasshouse",
  "roof",
  "shed",
  "carport",
  "kiosk",
  "market",
  "mall",
  "service",
  "station",
  "toilets",
  "temple",
  "chapel",
  "monastery",
  "place_of_worship",
]);

/**
 * Above this many storeys a building is a block, not a house, and the
 * gable rule stops applying. Only 4 % of Chiang Mai's buildings carry
 * `building:levels` at all, so this bites rarely — but where OSM does
 * say "eight floors", the roof is flat.
 */
export const GABLE_MAX_LEVELS = 3;

/**
 * An untagged building (`building=yes`, 79 % of the city) over this
 * floor area is a block, not a house: a flat roof.
 */
export const UNTAGGED_GABLE_MAX_AREA_M2 = 500;

/** A gable's rise as a fraction of its span — a 40° pitch. */
export const GABLE_RISE_RATIO = 0.42;

/** The smallest and largest rise a city gable may have, metres. */
export const GABLE_MIN_RISE_M = 1.1;
export const GABLE_MAX_RISE_M = 5;

/** Roofs are drawn with a small overhang, so the wall's top edge shows. */
export const ROOF_OVERHANG_M = 0.4;

/** Monotone-chain convex hull. */
export function convexHull(points: Vec2[]): Vec2[] {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Vec2, a: Vec2, b: Vec2): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * The minimum-area rectangle that contains a ring.
 *
 * A building's footprint is rarely a rectangle, but a roof has to be
 * built on something. The minimum-area enclosing rectangle is the
 * standard answer: it is the tightest rectangle that still covers the
 * footprint, and it carries both the ridge direction and the span, so
 * one pass gives the roof everything it needs.
 *
 * Returns null when the ring cannot produce a rectangle — a broken
 * ring is no measurement, so there is no roof to draw.
 */
export function minAreaRect(ring: [number, number][]): OrientedRect | null {
  if (!ring || ring.length < 3) return null;
  const finite = ring.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (finite.length < 3) return null;

  const lat = finite.reduce((s, p) => s + p[1], 0) / finite.length;
  const mPerLon = metresPerDegreeLon(lat);
  const mPerLat = METRES_PER_DEGREE_LAT;
  const lon0 = finite[0][0];
  const lat0 = finite[0][1];
  const local: Vec2[] = finite.map((p) => ({
    x: (p[0] - lon0) * mPerLon,
    y: (p[1] - lat0) * mPerLat,
  }));

  const hull = convexHull(local);
  if (hull.length < 3) return null;

  let best: { area: number; ux: number; uy: number; minU: number; maxU: number; minV: number; maxV: number } | null =
    null;
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey);
    if (len < 1e-6) continue;
    const ux = ex / len;
    const uy = ey / len;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of hull) {
      const u = p.x * ux + p.y * uy;
      const v = -p.x * uy + p.y * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!Number.isFinite(area)) continue;
    if (!best || area < best.area) best = { area, ux, uy, minU, maxU, minV, maxV };
  }
  if (!best) return null;

  // The ridge runs along the LONGER side. A gable over the short side
  // of a building reads as a shed, not a house.
  let alongX = best.ux;
  let alongY = best.uy;
  let length = best.maxU - best.minU;
  let width = best.maxV - best.minV;
  if (width > length) {
    alongX = -best.uy;
    alongY = best.ux;
    length = best.maxV - best.minV;
    width = best.maxU - best.minU;
  }

  const cu = (best.minU + best.maxU) / 2;
  const cv = (best.minV + best.maxV) / 2;
  const cx = best.ux * cu - best.uy * cv;
  const cy = best.uy * cu + best.ux * cv;
  const centre: [number, number] = [lon0 + cx / mPerLon, lat0 + cy / mPerLat];
  // Bearing, clockwise from north.
  const rotation = Math.atan2(alongX, alongY);

  if (!Number.isFinite(centre[0]) || !Number.isFinite(centre[1])) return null;
  if (!Number.isFinite(length) || !Number.isFinite(width) || !Number.isFinite(rotation)) return null;
  if (length <= 0 || width <= 0) return null;

  return { centre, length, width, rotation };
}

/** A gable's rise over a given span. */
export function gableRise(spanM: number): number {
  const rise = spanM * GABLE_RISE_RATIO;
  return Math.min(GABLE_MAX_RISE_M, Math.max(GABLE_MIN_RISE_M, rise));
}

/**
 * Which roof does this building get, and why.
 *
 * The rule, in order:
 *   1. A type that is plainly not a house → flat.
 *   2. A type that is a house → gable, unless OSM says it is tall.
 *   3. An untagged building → gable if it is small and low, flat if it
 *      is a block.
 */
export function chooseRoofKind(input: {
  type: string | null | undefined;
  levels: number | null | undefined;
  areaM2: number;
}): { kind: RoofKind; reason: string } {
  const type = (input.type ?? "yes").toLowerCase();
  const levels = typeof input.levels === "number" && Number.isFinite(input.levels) ? input.levels : null;

  if (FLAT_TYPES.has(type)) {
    return { kind: "flat", reason: `OSM building type "${type}" is not a house` };
  }
  if (levels !== null && levels > GABLE_MAX_LEVELS) {
    return { kind: "flat", reason: `OSM says ${levels} levels, above the gable limit of ${GABLE_MAX_LEVELS}` };
  }
  if (GABLE_TYPES.has(type)) {
    return { kind: "gable", reason: `OSM building type "${type}" is house-like` };
  }
  if (input.areaM2 > UNTAGGED_GABLE_MAX_AREA_M2) {
    return {
      kind: "flat",
      reason: `untagged building, ${Math.round(input.areaM2)} m² — over the ${UNTAGGED_GABLE_MAX_AREA_M2} m² block threshold`,
    };
  }
  return { kind: "gable", reason: "untagged building, small and low — house-like by footprint" };
}

/** What the renderer needs to draw one city's roofs. */
export interface CityRoofInput {
  /** Footprint ring, [lon, lat]. */
  ring: [number, number][];
  /** The supplied total height, metres; source may be measured or estimated. */
  height: number;
  /** The building's OSM type. */
  type?: string | null;
  /** Storeys, where OSM gives them. */
  levels?: number | null;
}

/**
 * The roof for one city building, or null when the footprint cannot
 * carry one.
 *
 * The wall always stops where the roof begins, and the roof always
 * ends at the building's total height. So the wall is `total −
 * roofDepth` in both cases and the number the board reports — OSM's
 * height — is the number on the ground.
 */
export function cityRoof(input: CityRoofInput): { roof: RoofInstance; areaM2: number; reason: string } | null {
  const rect = minAreaRect(input.ring);
  if (!rect) return null;
  const areaM2 = rect.length * rect.width;
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return null;

  const total = Number.isFinite(input.height) && input.height > 0 ? input.height : 0;
  if (total <= 0) return null;

  const { kind, reason } = chooseRoofKind({
    type: input.type,
    levels: input.levels,
    areaM2,
  });

  const flatRoof = (why: string): { roof: RoofInstance; areaM2: number; reason: string } => {
    // A flat roof is a cap, not a storey. It is a slab set into the
    // top of the wall, so the wall's edge still shows around it.
    const depth = Math.min(total * 0.5, 0.3, Math.max(0.12, total * 0.04));
    const inset = Math.min(0.12, Math.min(rect.length, rect.width) * 0.08);
    return {
      areaM2,
      reason: why,
      roof: {
        centre: rect.centre,
        length: Math.max(0.5, rect.length - inset * 2),
        width: Math.max(0.5, rect.width - inset * 2),
        rotation: rect.rotation,
        eaves: total - depth,
        rise: depth,
        kind: "flat",
        category: "city-flat",
        total,
      },
    };
  };

  if (kind === "flat") return flatRoof(reason);

  const rise = gableRise(rect.width);
  // A very low building cannot carry a gable inside its own height.
  const usableRise = Math.min(rise, total * 0.55);
  if (usableRise < 0.8) return flatRoof("too low for a gable at this height");

  return {
    areaM2,
    reason,
    roof: {
      centre: rect.centre,
      length: rect.length + ROOF_OVERHANG_M * 2,
      width: rect.width + ROOF_OVERHANG_M * 2,
      rotation: rect.rotation,
      eaves: total - usableRise,
      rise: usableRise,
      kind: "gable",
      category: "city-gable",
      total,
    },
  };
}
