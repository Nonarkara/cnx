// CNX temple compounds — the grammar that turns a mapped temple boundary
// into something that reads as a temple compound from the air.
//
// WHY THIS FILE EXISTS
//
// The 3D city layer extruded every `amenity=place_of_worship` polygon as
// ONE gold block. For a shrine that is right. For Wat Chedi Luang — a
// compound whose mapped boundary is 49,525 m² and contains 41 separate OSM
// building footprints including its own stupa and the Pra Wihan Luang —
// it was a 50,000 m² gold slab with the entire compound crushed into it.
// The operator saw a block, and a block says nothing: no wall, no gate, no
// courtyard, no chedi, no axial order. That is a spatial hallucination of
// the kind this board treats as fatal elsewhere — the shape on screen
// asserts a thing the ground does not say.
//
// THE GRAMMAR
//
// A walled temple compound is not a set of buildings; it is an ORDER.
// The order this file encodes is the one shared by a Lanna wat and a
// northern Chinese Buddhist temple (北方寺院), which is why the two read
// the same from the air and why the Chinese form is a usable reference:
//
//   • a walled enclosure (院墙) with a single gate on the central axis
//   • the gate on the SOUTH end, so the compound faces the approach
//   • a courtyard (院) on the axis between gate and hall
//   • the main hall (大雄宝殿 / โบสถ์) at the NORTH end of that axis,
//     the widest, tallest thing in the compound
//   • flanking side halls (配殿 / วิหาร) either side of the main hall
//   • a tower — a pagoda in the Chinese case, a chedi in the Lanna case —
//     standing in the courtyard where it can be seen from the gate
//
// So a compound is: WALL · GATE · COURT · HALL · SIDE HALL ×2 · CHEDI.
// Every one of those is placed from the mapped boundary, never invented
// as a free-floating shape.
//
// HONESTY — THE PART THAT MATTERS
//
// Every part carries an `origin`:
//
//   "measured" — a real OpenStreetMap footprint (the boundary, or an
//                interior building that OSM actually maps). Its position
//                and size are data.
//   "model"   — placed by the grammar above. The wall is on the mapped
//                boundary, but the gate's width, the chedi's height and
//                the roof overhangs are the grammar's choices. They show
//                HOW a temple compound is arranged, not what is on the
//                ground at that wat.
//
// The map styles the two differently and the click card says which is
// which. A modelled chedi must never be readable as a surveyed one.
//
// The rule this file obeys: model the compound, but never let the model
// impersonate a measurement. Absence of a mapped building is not
// evidence that the building is absent — it means OSM did not map it.

/** A closed ring of `[lon, lat]` pairs. */
export type Ring = [number, number][];

// ─── Imports ───────────────────────────────────────────────────────────
//
// The roof grammar lives in its own file so that the two grammars do
// not import each other; the shared metric helpers live in ./geo.

import { EARTH_LAT_M, metresPerDegreeLon } from "./geo.ts";
import { minAreaRect, type RoofCategory, type RoofInstance } from "./roof.ts";

/** What a part of a compound is. */
export type CompoundPartKind =
  | "wall"
  | "gate"
  | "hall"
  | "side_hall"
  | "chedi"
  | "court";

/** Whether a part's geometry is mapped data or the grammar's own work. */
export type CompoundOrigin = "measured" | "model";

/**
 * Which piece of a part this is.
 *
 * A roof is always `model` even when the building under it is measured:
 * the overhang is the grammar's, not the survey's. Splitting it out means
 * the map can style a roof differently from the wall it caps, and the
 * click card can say "roof overhang is modelled" without hedging about
 * the building's own footprint.
 */
export type CompoundTier = "body" | "roof";

/** One extruded piece of a temple compound. */
export interface CompoundPart {
  kind: CompoundPartKind;
  origin: CompoundOrigin;
  tier: CompoundTier;
  /** Closed ring, `[lon, lat]`. The exterior boundary. */
  ring: Ring;
  /**
   * Interior rings — holes cut out of the exterior.
   *
   * The wall is the one part that needs them: it is a BAND around the
   * compound, not a slab, and a slab would fill the courtyard the wall
   * is supposed to enclose. GeoJSON carries holes as extra rings in
   * the polygon's coordinate array, and MapLibre's fill-extrusion
   * honours them.
   */
  holes?: Ring[];
  /** Height above `base_height`, in metres. */
  height: number;
  /** Height of the base, in metres — the tier below starts here. */
  base_height: number;
  /** Where the height came from. A mapped footprint can still carry a
   *  defaulted height, and the operator is entitled to know which. */
  heightSource: HeightSource;
}

/** How much we actually know about a compound. */
export type CompoundEvidence =
  /** OSM maps buildings inside the boundary. The interior is real. */
  | "osm-footprints"
  /** Only the boundary is mapped. The interior is the grammar's work. */
  | "osm-boundary-only"
  /** The polygon is one building, not a compound. */
  | "single-footprint";

/** Where a part's HEIGHT came from — separate from where its shape came from. */
export type HeightSource =
  /** A mapped height tag, or the mapped footprint's own levels. */
  | "osm"
  /** The extractor's default for a footprint with no height tag. */
  | "fallback"
  /** A dimension the grammar chose. */
  | "grammar";

/** A real OSM building footprint that falls inside a temple boundary. */
export interface InteriorBuilding {
  ring: Ring;
  /** Metres. From the OSM `height` tag, or the extractor's fallback. */
  height: number;
  name: string | null;
  /** Whether `height` was mapped or defaulted. */
  heightSource: "osm" | "fallback";
}

/** The result of composing one compound. */
export interface CompoundResult {
  parts: CompoundPart[];
  /**
   * The pitched roofs that cap the compound's halls, side halls and
   * gate.
   *
   * A roof is not a thinner box. A Lanna hall is a steep gable, and a
   * viharn is a shallower one; drawing them as slabs is what made the
   * compound read as a set of crates. These are drawn as real roofs by
   * the map's roof layer, and they carry the same rule as everything
   * else in this file: the FORM is the grammar's, always.
   */
  roofs: RoofInstance[];
  evidence: CompoundEvidence;
  /** The compound's area in m². */
  areaM2: number;
  /** The compound's short side in m — the width across the axis. */
  shortSideM: number;
  /** The compound's long side in m — the depth along the axis. */
  longSideM: number;
}

// ─── The grammar's dimensions, in metres ───────────────────────────
//
// These are the grammar's own numbers. They are sized to read from the
// air at the zoom a governor views the city, and they are declared as
// model parts, so no part of them is passed off as surveyed.

/** Below this area a temple polygon is a building, not a compound. */
export const COMPOUND_MIN_AREA_M2 = 1200;

/** Height of the enclosure wall. */
export const WALL_HEIGHT = 2.4;
/** Distance from the mapped boundary to the outer face of the wall. */
export const WALL_INSET = 0.8;
/** Thickness of the wall. */
export const WALL_THICKNESS = 1.2;
/** Height of the courtyard floor — a hair above zero, so it catches light. */
export const COURT_HEIGHT = 0.3;

/** Gatehouse (เปรียญ / 山门) dimensions. */
export const GATE_WIDTH = 6.5;
export const GATE_DEPTH = 4;
export const GATE_BODY_HEIGHT = 5.5;
/** Rise of the gate's gable, eaves to ridge. */
export const GATE_ROOF_RISE = 2;

/** A modelled main hall: width across the axis. */
export const HALL_WIDTH = 13;
/** A modelled main hall: depth along the axis. */
export const HALL_DEPTH = 8;
/** Height of a modelled hall's body, excluding the roof. */
export const HALL_BODY_HEIGHT = 6.5;
/** Rise of a hall's gable, eaves to ridge. */
export const HALL_ROOF_RISE = 2.4;
/** Rise of the second, receding roof tier on the main hall. */
export const HALL_TIER_RISE = 1.6;
/**
 * How much of the hall the second, receding roof tier covers.
 *
 * A Lanna hall's roof steps inward as it rises, and a tier that is
 * barely smaller than the one below reads as two stacked slabs rather
 * than a stepped roof. 0.78 is the point where the step reads.
 */
export const HALL_TIER_SCALE = 0.78;

/** A modelled side hall. */
export const SIDE_HALL_WIDTH = 7;
export const SIDE_HALL_DEPTH = 6;
export const SIDE_HALL_BODY_HEIGHT = 5;
/** Rise of a side hall's gable, eaves to ridge. */
export const SIDE_HALL_ROOF_RISE = 1.8;

/** Metres of roof overhang beyond each side of its fitted rectangle. */
export const ROOF_OVERHANG = 0.1;

/** A compound needs a short side this wide before it gets a chedi. */
export const CHEDI_MIN_SHORT_SIDE = 18;
/** ...and before it gets flanking side halls. */
export const SIDE_HALL_MIN_SHORT_SIDE = 24;

// ─── Planar geometry, in local metres ─────────────────────────────
//
// Everything below works in a local metre frame centred on the
// compound, because rotating a rectangle by an axis angle is trivial
// there and fiddly in degrees. The conversion back to lon/lat happens
// once, at the end.

type Vec = { x: number; y: number };

/** Metres per degree of longitude at the given latitude. */
export { metresPerDegreeLon } from "./geo.ts";

function ringToLocal(ring: Ring, origin: [number, number], mPerLon: number, mPerLat: number): Vec[] {
  return ring.map((p) => ({ x: (p[0] - origin[0]) * mPerLon, y: (p[1] - origin[1]) * mPerLat }));
}

function localToRing(pts: Vec[], origin: [number, number], mPerLon: number, mPerLat: number): Ring {
  return pts.map((p) => [
    origin[0] + p.x / mPerLon,
    origin[1] + p.y / mPerLat,
  ] as [number, number]);
}

/** Signed area in m². Positive for counter-clockwise. */
export function signedArea(pts: Vec[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Returns the ring counter-clockwise, so the inward normal is well-defined. */
function toCounterClockwise(pts: Vec[]): Vec[] {
  return signedArea(pts) < 0 ? [...pts].reverse() : pts;
}

/** Removes a repeated closing vertex and any duplicate consecutive points. */
function dedupe(pts: Vec[]): Vec[] {
  const out: Vec[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 1e-9 || Math.abs(last.y - p.y) > 1e-9) out.push(p);
  }
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) out.pop();
  }
  return out;
}

function centroidOf(pts: Vec[]): Vec {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

/**
 * The inward normal of the edge a→b for a counter-clockwise ring.
 * Walking counter-clockwise, the interior is always to the left, and the
 * left normal of (dx, dy) is (-dy, dx).
 */
function inwardNormal(a: Vec, b: Vec): Vec {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return { x: 0, y: 0 };
  return { x: -dy / len, y: dx / len };
}

/**
 * Offsets a counter-clockwise ring inward by `dist` metres.
 *
 * Miter joins: each vertex moves along the bisector of its two edge
 * normals, scaled by 1/(1 + n1·n2) so the offset edges stay parallel.
 * A near-reversal (n1·n2 ≈ -1) has no stable bisector, so that vertex
 * falls back to a plain normal offset — the wall pinches there instead
 * of shooting off to infinity.
 */
export function offsetRingInward(pts: Vec[], dist: number): Vec[] {
  const n = pts.length;
  const out: Vec[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const n1 = inwardNormal(prev, cur);
    const n2 = inwardNormal(cur, next);
    const dot = n1.x * n2.x + n1.y * n2.y;
    const denom = 1 + dot;
    if (denom < 1e-6) {
      out.push({ x: cur.x + n1.x * dist, y: cur.y + n1.y * dist });
      continue;
    }
    out.push({
      x: cur.x + ((n1.x + n2.x) / denom) * dist,
      y: cur.y + ((n1.y + n2.y) / denom) * dist,
    });
  }
  return out;
}

/**
 * The compound's principal axis, in local metres.
 *
 * PCA over the boundary vertices: the eigenvector of the covariance
 * matrix with the larger eigenvalue is the long axis. A near-square
 * compound has two comparable eigenvalues and PCA's answer flips with
 * the vertex order, so anything that is not clearly elongated falls
 * back to north–south — the axis a temple compound is actually built
 * on, and the one the gate sits at the south end of.
 */
export function principalAxis(pts: Vec[]): { dir: Vec; centre: Vec } {
  const c = centroidOf(pts);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of pts) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const n = pts.length;
  sxx /= n;
  sxy /= n;
  syy /= n;
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const lambdaMax = tr / 2 + disc;
  const lambdaMin = tr / 2 - disc;
  // Elongation ratio. Below 1.25 the shape is close enough to square
  // that PCA's axis is noise, so we use the north–south axis instead.
  if (lambdaMin <= 1e-9 || lambdaMax / lambdaMin < 1.25) {
    return { dir: { x: 0, y: 1 }, centre: c };
  }
  let dir: Vec;
  if (Math.abs(sxy) > 1e-12) {
    dir = { x: lambdaMax - syy, y: sxy };
  } else {
    dir = sxx >= syy ? { x: 1, y: 0 } : { x: 0, y: 1 };
  }
  const len = Math.hypot(dir.x, dir.y) || 1;
  dir = { x: dir.x / len, y: dir.y / len };
  // Point the axis NORTH so "south end" is always the low end.
  if (dir.y < 0) dir = { x: -dir.x, y: -dir.y };
  return { dir, centre: c };
}

/** The two ends of the axis, as the projections of the vertices. */
function axisEnds(pts: Vec[], axis: { dir: Vec; centre: Vec }): { south: Vec; north: Vec; length: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    const t = (p.x - axis.centre.x) * axis.dir.x + (p.y - axis.centre.y) * axis.dir.y;
    if (t < min) min = t;
    if (t > max) max = t;
  }
  const along = (t: number): Vec => ({
    x: axis.centre.x + axis.dir.x * t,
    y: axis.centre.y + axis.dir.y * t,
  });
  return { south: along(min), north: along(max), length: max - min };
}

/** A rectangle as four corner points, counter-clockwise. */
function rect(centre: Vec, along: Vec, width: number, depth: number): Vec[] {
  const perp = { x: -along.y, y: along.x };
  const hw = width / 2;
  const hd = depth / 2;
  const corner = (u: number, v: number): Vec => ({
    x: centre.x + along.x * u + perp.x * v,
    y: centre.y + along.y * u + perp.y * v,
  });
  // Counter-clockwise when (along, perp) is right-handed: perp is
  // along rotated +90°, so (u, v) = (+hw,+hd) → (-hw,+hd) → ... is CCW.
  return [corner(hw, hd), corner(-hw, hd), corner(-hw, -hd), corner(hw, -hd)];
}

/** Scales a ring about its own centroid. */
function scaleRing(pts: Vec[], factor: number): Vec[] {
  const c = centroidOf(pts);
  return pts.map((p) => ({
    x: c.x + (p.x - c.x) * factor,
    y: c.y + (p.y - c.y) * factor,
  }));
}

/** A ring with its first vertex repeated at the end, as GeoJSON wants. */
function closeRing(pts: Vec[]): Vec[] {
  if (pts.length === 0) return pts;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) return pts;
  return [...pts, { x: first.x, y: first.y }];
}

/** Whether a ring contains a point (ray casting). */
export function pointInRing(p: Vec, ring: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Names that mark a mapped building as the compound's tower.
 *
 * OSM's `man_made=stupa` is not in the extract we bake, so the tower is
 * found by name — in English or Thai. "Phra That" is the transliteration
 * of พระธาตุ, the Thai name for a stupa, and Wat Phra Singh's own chedi
 * is mapped as "Phra That Wat Phra Sing" — a name that contains neither
 * "chedi" nor "stupa" and was therefore missed, which put a modelled
 * tower inside a compound that already had a real one.
 *
 * A miss here is not an error: the grammar then models a chedi, and the
 * model's own parts say `model`.
 */
export function looksLikeChedi(name: string | null): boolean {
  if (!name) return false;
  return /chedi|stupa|pagoda|phra\s?that|phrathat|prathat|เจดีย์|ธาตุ|พระธาตุ/i.test(name);
}

/**
 * Where a compound's gate goes.
 *
 * The Chinese form puts the gate at the south end of the axis. In
 * Chiang Mai the equivalent statement is that a wat's gate faces its
 * APPROACH — the town it serves — which is the side of the compound
 * nearest the city centre. Using the city's position instead of a
 * compass direction handles all three cases without a special case
 * each: a compound north of town gets its south end, a compound on
 * Doi Suthep gets the end that faces the city the way the naga
 * stair does, and an east–west compound gets the end that faces town.
 *
 * This is a grammar choice, so the gate is a `model` part. It is also a
 * choice that can be wrong — and saying so is why it is labelled.
 */
export const CITY_CENTRE_LON = 98.9853;
export const CITY_CENTRE_LAT = 18.7883;

// ─── Composition ──────────────────────────────────────────────────

export interface ComposeInput {
  /** The mapped temple boundary. */
  boundary: Ring;
  /** Real OSM footprints inside the boundary. */
  interiors: InteriorBuilding[];
  /**
   * The religion the OSM way is tagged with.
   *
   * It decides the TOWER, not just the colour. The stepped tower this
   * grammar places is a stupa — a Buddhist form, and in the Chinese
   * case a pagoda, which is the same religion's architecture. Putting
   * one in the courtyard of a church or a mosque would be the grammar
   * asserting a faith the site does not have. A stupa is drawn only
   * where a stupa belongs.
   */
  religion?: string;
}

/**
 * Composes one temple compound.
 *
 * Returns an empty `parts` array when the boundary is too small to be a
 * compound — the caller then renders the boundary as the single mapped
 * building it is.
 */
export function composeCompound(input: ComposeInput): CompoundResult {
  const raw = dedupe(
    input.boundary.map((p) => ({ x: p[0], y: p[1] })),
  );
  const meanLat = raw.reduce((s, p) => s + p.y, 0) / Math.max(1, raw.length);
  const mPerLon = metresPerDegreeLon(meanLat);
  const mPerLat = EARTH_LAT_M;
  const origin: [number, number] = [raw[0].x, raw[0].y];
  const local = toCounterClockwise(ringToLocal(input.boundary, origin, mPerLon, mPerLat));
  const pts = dedupe(local);

  const areaM2 = Math.abs(signedArea(pts));
  // A measurement that is not a number is not a small measurement, it is
  // no measurement. `NaN < threshold` is false, so an unguarded area
  // would sail past this test and every broken polygon would become a
  // compound. Fail closed: an unusable boundary is a single footprint.
  if (!Number.isFinite(areaM2) || pts.length < 3 || areaM2 < COMPOUND_MIN_AREA_M2) {
    return {
      parts: [],
      roofs: [],
      evidence: "single-footprint",
      areaM2: Number.isFinite(areaM2) ? areaM2 : 0,
      shortSideM: 0,
      longSideM: 0,
    };
  }

  const axis = principalAxis(pts);
  const ends = axisEnds(pts, axis);
  // The width across the axis: the narrowest extent of the boundary
  // measured perpendicular to the axis.
  let acrossMin = Infinity;
  let acrossMax = -Infinity;
  const perp = { x: -axis.dir.y, y: axis.dir.x };
  for (const p of pts) {
    const t = (p.x - axis.centre.x) * perp.x + (p.y - axis.centre.y) * perp.y;
    if (t < acrossMin) acrossMin = t;
    if (t > acrossMax) acrossMax = t;
  }
  const shortSideM = acrossMax - acrossMin;
  const longSideM = ends.length;

  const parts: CompoundPart[] = [];
  const push = (
    kind: CompoundPartKind,
    originKind: CompoundOrigin,
    ringPts: Vec[],
    height: number,
    heightSource: HeightSource,
    baseHeight = 0,
    tier: CompoundTier = "body",
  ): void => {
    if (ringPts.length < 3) return;
    // Close in the LOCAL frame, then convert. Closing after the
    // conversion handed `closeRing` lon/lat tuples where it expected
    // `{x, y}` vectors, and the ring's last point serialised as `{}` —
    // a malformed polygon that GeoJSON consumers must reject.
    const ring = localToRing(closeRing(ringPts), origin, mPerLon, mPerLat);
    parts.push({ kind, origin: originKind, tier, ring, height, base_height: baseHeight, heightSource });
  };

  // ─── The roofs ────────────────────────────────────────────────────────
  //
  // A roof is drawn as a real gable — two slopes and two gable ends —
  // not as a thinner box. The ridge runs along the part's long side,
  // which for a hall is across the compound's axis, the way an ubosot
  // is actually built: you read the facade, not the side.
  //
  // The rise is the grammar's, always, and it is carved out of the
  // part's own height where that height is mapped: a hall whose OSM
  // height is 9 m gets a 9 m building, wall and roof together.
  const roofs: RoofInstance[] = [];
  const addRoof = (
    ring: Ring,
    eaves: number,
    wanted: number,
    category: RoofCategory,
    scale = 1,
  ): void => {
    if (!Number.isFinite(eaves) || eaves <= 0) return;
    if (!Number.isFinite(wanted) || wanted <= 0) return;
    // A roof may not eat more than half the building it caps.
    const rise = Math.min(wanted, eaves * 1.1);
    if (rise < 0.5) return;
    const fit = minAreaRect(ring);
    if (!fit) return;
    roofs.push({
      centre: fit.centre,
      length: fit.length * scale + ROOF_OVERHANG * 2,
      width: fit.width * scale + ROOF_OVERHANG * 2,
      rotation: fit.rotation,
      eaves,
      rise,
      kind: "gable",
      category,
      total: eaves + rise,
    });
  };

  // ── The wall: the mapped boundary, given thickness and height.
  //    Outer face sits just inside the boundary; the inner face is one
  //    wall-thickness further in. The band is one polygon with a hole.
  const wallOuter = offsetRingInward(pts, WALL_INSET);
  const wallInner = offsetRingInward(pts, WALL_INSET + WALL_THICKNESS);
  parts.push({
    kind: "wall",
    origin: "measured",
    tier: "body",
    ring: localToRing(closeRing(wallOuter), origin, mPerLon, mPerLat),
    holes: [localToRing(closeRing(wallInner), origin, mPerLon, mPerLat)],
    height: WALL_HEIGHT,
    base_height: 0,
    heightSource: "grammar",
  });
  // The wall's inner face is the courtyard's edge; the courtyard floor
  // is the hole itself, so the wall reads as a band around a court.
  const court = offsetRingInward(pts, WALL_INSET + WALL_THICKNESS);
  push("court", "measured", court, COURT_HEIGHT, "grammar");

  // ── The gate: on the axis, at the end that faces the town.
  //
  //    The Chinese form puts the gate at the south end, and the Lanna
  //    form agrees — a wat faces south. So the SOUTH end is the rule,
  //    and it needs no reference to where the city happens to be.
  //
  //    The exception is a compound whose long axis runs east–west:
  //    there "south" is not an end of the axis at all, and the axis
  //    direction's north component is noise. There the tie is broken by
  //    the city: the gate goes at the end nearest the town, because
  //    that is the side a wat's approach actually arrives from.
  const cityLocal: Vec = {
    x: (CITY_CENTRE_LON - origin[0]) * mPerLon,
    y: (CITY_CENTRE_LAT - origin[1]) * mPerLat,
  };
  const distToSouth = Math.hypot(cityLocal.x - ends.south.x, cityLocal.y - ends.south.y);
  const distToNorth = Math.hypot(cityLocal.x - ends.north.x, cityLocal.y - ends.north.y);
  const axisRunsNorthSouth = Math.abs(axis.dir.y) >= 0.5;
  const approachEnd = axisRunsNorthSouth
    ? ends.south
    : distToSouth <= distToNorth
      ? ends.south
      : ends.north;
  const farEnd = approachEnd === ends.south ? ends.north : ends.south;
  const gateCentre = approachEnd;
  const gateRing = rect(gateCentre, axis.dir, GATE_WIDTH, GATE_DEPTH);
  push("gate", "model", gateRing, GATE_BODY_HEIGHT, "grammar");
  addRoof(localToRing(closeRing(gateRing), origin, mPerLon, mPerLat), GATE_BODY_HEIGHT, GATE_ROOF_RISE, "gate");

  // ── The interior buildings, in local metres.
  const interiorLocals = input.interiors
    .map((b) => {
      const ring = dedupe(b.ring.map((p) => ({ x: p[0], y: p[1] })));
      if (ring.length < 3) return null;
      const localPts = toCounterClockwise(ringToLocal(b.ring, origin, mPerLon, mPerLat));
      return {
        pts: dedupe(localPts),
        height: b.height,
        heightSource: b.heightSource,
        name: b.name,
        area: Math.abs(signedArea(localPts)),
        centre: centroidOf(localPts),
        used: false,
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  const hasFootprints = interiorLocals.length > 0;

  // Which interior building sits on the axis at the north end and is
  // big enough to be the main hall? The nearest large one to the north
  // end wins; a hall is the compound's largest building, so the area
  // floor is relative to the compound.
  const hallAreaFloor = areaM2 * 0.02;
  const axial = (b: { centre: Vec }): number =>
    (b.centre.x - axis.centre.x) * axis.dir.x + (b.centre.y - axis.centre.y) * axis.dir.y;
  const lateral = (b: { centre: Vec }): number =>
    (b.centre.x - axis.centre.x) * perp.x + (b.centre.y - axis.centre.y) * perp.y;

  const candidates = interiorLocals.filter((b) => b.area >= hallAreaFloor && !looksLikeChedi(b.name));
  candidates.sort((a, b) => axial(b) - axial(a));
  const measuredHall = candidates[0] ?? null;

  let hallCentre: Vec;
  let hallWidth: number;
  let hallDepth: number;
  let hallBodyHeight: number;
  if (measuredHall) {
    measuredHall.used = true;
    hallCentre = measuredHall.centre;
    hallWidth = HALL_WIDTH;
    hallDepth = HALL_DEPTH;
    // A mapped height is the total, roof included, so the gable is
    // carved out of it and the hall keeps the height OSM gave it.
    const mappedHeight = measuredHall.height;
    const candidateRise = Math.min(HALL_ROOF_RISE, Math.max(0, mappedHeight * 0.45));
    const rise = candidateRise >= 0.5 ? candidateRise : 0;
    hallBodyHeight = mappedHeight - rise;
    push("hall", "measured", measuredHall.pts, hallBodyHeight, measuredHall.heightSource);
    addRoof(
      localToRing(closeRing(measuredHall.pts), origin, mPerLon, mPerLat),
      hallBodyHeight,
      rise,
      "hall",
    );
  } else {
    // No mapped hall: the grammar puts one at the north end of the
    // axis, set back from the wall by its own depth.
    hallWidth = Math.min(HALL_WIDTH, Math.max(8, shortSideM * 0.42));
    hallDepth = Math.min(HALL_DEPTH, Math.max(5, longSideM * 0.16));
    hallBodyHeight = HALL_BODY_HEIGHT;
    const setBack = hallDepth / 2 + WALL_INSET + WALL_THICKNESS + 1.5;
    hallCentre = {
      x: farEnd.x - axis.dir.x * setBack,
      y: farEnd.y - axis.dir.y * setBack,
    };
    const hallRing = rect(hallCentre, axis.dir, hallWidth, hallDepth);
    push("hall", "model", hallRing, hallBodyHeight, "grammar");
    addRoof(localToRing(closeRing(hallRing), origin, mPerLon, mPerLat), hallBodyHeight, HALL_ROOF_RISE, "hall");
    // A second, receding tier — the stepped roof a Lanna hall has.
    // It sits partway up the first gable, which is where a real
    // stepping roof's eave line is, so it reads as a step and not as
    // a slab floating over the ridge.
    addRoof(
      localToRing(closeRing(hallRing), origin, mPerLon, mPerLat),
      hallBodyHeight + HALL_ROOF_RISE * 0.42,
      HALL_TIER_RISE,
      "hall",
      HALL_TIER_SCALE,
    );
  }

  // ── Flanking side halls, one each side of the axis.
  if (shortSideM >= SIDE_HALL_MIN_SHORT_SIDE) {
    const flank = interiorLocals.filter(
      (b) =>
        !b.used &&
        !looksLikeChedi(b.name) &&
        b.area >= hallAreaFloor * 0.45 &&
        Math.abs(lateral(b)) > shortSideM * 0.12,
    );
    flank.sort((a, b) => b.area - a.area);
    const left = flank.find((b) => lateral(b) < 0);
    const right = flank.find((b) => lateral(b) > 0);
    const sideOffset = shortSideM * 0.28;
    const sideDepth = Math.min(SIDE_HALL_DEPTH, Math.max(4, longSideM * 0.1));
    const sideWidth = Math.min(SIDE_HALL_WIDTH, Math.max(4.5, shortSideM * 0.16));
    const sideRing = (sign: number): Vec[] =>
      rect(
        {
          x: hallCentre.x + perp.x * sideOffset * sign,
          y: hallCentre.y + perp.y * sideOffset * sign,
        },
        axis.dir,
        sideWidth,
        sideDepth,
      );
    if (left) {
      left.used = true;
      const candidateRise = Math.min(SIDE_HALL_ROOF_RISE, left.height * 0.45);
      const rise = candidateRise >= 0.5 ? candidateRise : 0;
      const body = left.height - rise;
      push("side_hall", "measured", left.pts, body, left.heightSource);
      addRoof(
        localToRing(closeRing(left.pts), origin, mPerLon, mPerLat),
        body,
        rise,
        "side_hall",
      );
    } else {
      const r = sideRing(-1);
      push("side_hall", "model", r, SIDE_HALL_BODY_HEIGHT, "grammar");
      addRoof(
        localToRing(closeRing(r), origin, mPerLon, mPerLat),
        SIDE_HALL_BODY_HEIGHT,
        SIDE_HALL_ROOF_RISE,
        "side_hall",
      );
    }
    if (right) {
      right.used = true;
      const candidateRise = Math.min(SIDE_HALL_ROOF_RISE, right.height * 0.45);
      const rise = candidateRise >= 0.5 ? candidateRise : 0;
      const body = right.height - rise;
      push("side_hall", "measured", right.pts, body, right.heightSource);
      addRoof(
        localToRing(closeRing(right.pts), origin, mPerLon, mPerLat),
        body,
        rise,
        "side_hall",
      );
    } else {
      const r = sideRing(1);
      push("side_hall", "model", r, SIDE_HALL_BODY_HEIGHT, "grammar");
      addRoof(
        localToRing(closeRing(r), origin, mPerLon, mPerLat),
        SIDE_HALL_BODY_HEIGHT,
        SIDE_HALL_ROOF_RISE,
        "side_hall",
      );
    }
  }

  // ── The tower: a mapped chedi if OSM names one, else a modelled one
  //    standing in the courtyard on the axis, where the gate sees it.
  // A stupa only goes where a stupa belongs. The compound grammar is a
  // Buddhist-monastery grammar — the walled axis with a tower in the
  // courtyard is the same order in a Lanna wat and in a northern
  // Chinese Buddhist temple — so the tower is placed only where that
  // architecture belongs. A church or a mosque gets its mapped
  // buildings and nothing more.
  //
  // "unknown" is NOT treated as non-Buddhist. An untagged temple site
  // in Chiang Mai is overwhelmingly a wat, and the same rule the board
  // applies everywhere else applies here: absence of a tag is not
  // evidence of absence. A Chinese folk shrine keeps its tower too —
  // the pagoda is that architecture as well.
  const NON_TOWER_RELIGIONS = new Set(["christian", "muslim", "hindu", "jewish", "shinto", "sikh"]);
  const isBuddhist = !NON_TOWER_RELIGIONS.has((input.religion ?? "buddhist").toLowerCase());
  const measuredChedi = isBuddhist
    ? interiorLocals.find((b) => !b.used && looksLikeChedi(b.name))
    : undefined;
  if (measuredChedi) {
    measuredChedi.used = true;
    // The mapped footprint is the tower's BASE — and OSM often tags a
    // stupa with the height of its plinth (Wat Chedi Luang's stupa
    // carries height=3 m for a tower that stands sixty). So the base
    // is measured and the mass above it is the grammar's: receding
    // tiers, sized to the footprint the survey actually gives.
    const baseHeight = Math.max(measuredChedi.height, 2);
    push("chedi", "measured", measuredChedi.pts, baseHeight, measuredChedi.heightSource);
    const towerSize = Math.sqrt(Math.max(1, Math.abs(signedArea(measuredChedi.pts))));
    const towerHeight = Math.min(towerSize * 1.5, Math.max(9, towerSize * 0.95));
    const tiers = 3;
    const tierHeight = towerHeight / tiers;
    for (let i = 0; i < tiers; i += 1) {
      const factor = 0.82 - i * 0.2;
      const r = scaleRing(measuredChedi.pts, factor);
      push("chedi", "model", r, tierHeight, "grammar", baseHeight + i * tierHeight);
    }
  } else if (isBuddhist && shortSideM >= CHEDI_MIN_SHORT_SIDE) {
    // The tower scales with its compound. Wat Chedi Luang's own stupa
    // is 3,354 m² — 58 m across — in a 270 m compound, so a fixed 9 m
    // spire would be a speck beside the real one. A modelled tower is
    // sized as a fraction of the compound's short side, capped so it
    // never out-masses the hall.
    const chediSize = Math.min(26, Math.max(4.5, shortSideM * 0.17));
    const chediHeight = Math.min(chediSize * 2.6, Math.max(10, chediSize * 2.1));
    // Between the gate and the hall, on the axis, clear of both.
    const span = Math.hypot(farEnd.x - approachEnd.x, farEnd.y - approachEnd.y) || longSideM;
    const t = span * 0.42;
    const chediCentre: Vec = {
      x: approachEnd.x + axis.dir.x * t,
      y: approachEnd.y + axis.dir.y * t,
    };
    // Four receding tiers: a stepped square tower, which is what a
    // Lanna mondop and Doi Suthep's chedi both actually are.
    const tiers = 4;
    const tierHeight = chediHeight / tiers;
    for (let i = 0; i < tiers; i += 1) {
      const factor = 1 - i * 0.18;
      const r = rect(chediCentre, axis.dir, chediSize * factor, chediSize * factor);
      push("chedi", "model", r, tierHeight, "grammar", i * tierHeight);
    }
  }

  // ── Every OTHER mapped building inside the compound.
  //
  //    This is the part that makes the compound an aerial read rather
  //    than an arrangement of four symbolic shapes. Wat Chedi Luang maps
  //    41 buildings inside its boundary — the stupa, the Pra Wihan
  //    Luang, the monastic cells, the school. Dropping all but the
  //    hall and the two flanks left a bare cream rectangle with three
  //    gold boxes on it, which is the spatial hallucination this file
  //    exists to remove. The grammar does not get to decide a mapped
  //    building is not there.
  const leftovers = interiorLocals.filter((b) => !b.used);
  for (const b of leftovers) {
    b.used = true;
    // A mapped outbuilding's height is its total, roof included, so the
    // gable comes out of it rather than on top of it.
    const candidateRise = Math.min(HALL_ROOF_RISE, Math.max(0, b.height * 0.45));
    const rise = b.area >= 90 && candidateRise >= 0.5 ? candidateRise : 0;
    const body = b.height - rise;
    push("hall", "measured", b.pts, body, b.heightSource);
    // A roof cap on the substantial ones only: a monastic cell's eave
    // is invisible at city zoom and the part count is not free.
    if (b.area >= 90) {
      addRoof(localToRing(closeRing(b.pts), origin, mPerLon, mPerLat), body, rise, "hall");
    }
  }

  return {
    parts,
    roofs,
    evidence: hasFootprints ? "osm-footprints" : "osm-boundary-only",
    areaM2,
    shortSideM,
    longSideM,
  };
}
