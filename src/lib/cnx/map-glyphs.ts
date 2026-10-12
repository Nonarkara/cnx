// Shape, not just colour, is what tells one phenomenon from another on this
// map. Before this module every observation on CNXMap was a
// `ScatterplotLayer` circle — fire, rain gauges, flood gauges, citizen
// reports, CCTV — separated only by hue and a pixel or two of radius. On a
// haze-hazed basemap at province zoom an orange dot is genuinely ambiguous:
// it could be a fire, a heavy-rain gauge, or a flood gauge in warning. That
// is a number-right / symbol-wrong split, the same defect class this board
// treats as fatal elsewhere.
//
// So each phenomenon gets a distinct silhouette, drawn white on transparent
// and tinted per-instance by `getColor` (`mask: true`), following the pattern
// the plane IconLayer already used. Shape survives when colour does not —
// to a colour-blind operator, on a washed-out satellite basemap, under
// haze, or projected to a wall from across a room.
//
// Glyph design is constrained by where it has to read:
//   • ≥10 px tall, so silhouettes stay separable from each other at any
//     count. 346 rain gauges can be on screen at once.
//   • Closed shapes with no thin strokes; strokes disappear at small size.
//   • Each glyph has a *semantic* silhouette (flame = fire, droplet = rain,
//     arrow = direction) so the key survives being learned once.

/** One atlas cell in SVG user units. */
export const GLYPH_CELL = 64;

export const GLYPH_NAMES = ["flame", "droplet", "arrow"] as const;
export type GlyphName = (typeof GLYPH_NAMES)[number];

/**
 * Silhouettes, drawn white so `mask: true` can tint them.
 *
 * These were rendered at 14 px and looked at before being accepted. The first
 * cut failed that check: a 44×59 flame and a 40×58 droplet both collapse into
 * the same round blob at marker size, which is precisely the collision this
 * module exists to remove — shape that only separates when zoomed in is not
 * shape, it is decoration. So the separation is carried by ASPECT RATIO, the
 * one cue that survives pixelation:
 *
 *   flame   — wide and squat (48 × 51). Pointed crown, notched shoulders.
 *             Deliberately NOT a triangle: the plane glyph is already a
 *             north-pointing triangle and reusing it would collide with
 *             aircraft.
 *   droplet — narrow and tall (28 × 56). The classic teardrop. Its narrowness
 *             is the whole point: full height, half the flame's width.
 *   arrow   — points RIGHT (east) at angle 0, so a caller can place it with
 *             deck.gl's `getAngle` in degrees clockwise from north and no
 *             per-glyph correction. Drawn as a short shaft plus a head that
 *             is nearly half the glyph's width: two earlier cuts used a
 *             conventional shaft-to-head ratio, and at 14 px the head
 *             vanished both times, leaving a bar with a bump. Proportion, not
 *             detail, is what survives pixelation.
 *
 * Every path uses ABSOLUTE coordinates only (M/C/L/Z — no `s`/`a`/`h`/`v`, no
 * arc flags). That is a testability constraint, not a style preference: the
 * suite measures each glyph's real extent by reading these numbers, and
 * relative commands would make them lie about where the ink actually is.
 * The droplet's round belly is a cubic approximation for the same reason —
 * an arc segment would reintroduce numbers that read as coordinates.
 */
const GLYPH_SVG: Record<GlyphName, string> = {
  flame:
    '<path d="M32 9C42 23 56 29 56 43C56 55 45 60 32 60C19 60 8 55 8 43C8 33 18 23 24 13C26 22 29 26 32 28C30 20 31 15 32 9Z"/>',
  droplet:
    '<path d="M32 4C32 4 18 26 18 40C18 54 24 60 32 60C40 60 46 54 46 40C46 26 32 4 32 4Z"/>',
  arrow:
    '<polygon points="2,27 26,27 26,8 54,32 26,56 26,37 2,37"/>',
};

function atlasSvg(): string {
  const cells = GLYPH_NAMES.map((name, i) => {
    // Each glyph is drawn in its own 64×64 cell; `transform` moves it into
    // place inside the single row atlas.
    return `<g transform="translate(${i * GLYPH_CELL},0)">${GLYPH_SVG[name]}</g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GLYPH_NAMES.length * GLYPH_CELL}" height="${GLYPH_CELL}" fill="white" stroke="none">${cells}</svg>`;
}

/** A single-row atlas, one cell per glyph, ready for `IconLayer`. */
export const GLYPH_ATLAS =
  "data:image/svg+xml;utf8," + encodeURIComponent(atlasSvg());

/**
 * deck.gl icon mapping. `mask: true` means deck.gl uses the glyph's alpha as
 * a mask and fills it with `getColor`, so one atlas serves every colour a
 * phenomenon needs. `anchorY` centres the glyph on its anchor point —
 * without it deck.gl anchors at the image's top edge and every marker sits
 * one half-cell too low.
 */
export interface GlyphDefinition {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorY: number;
  mask: true;
}

export const GLYPH_MAPPING = GLYPH_NAMES.reduce<Record<GlyphName, GlyphDefinition>>((acc, name, i) => {
  acc[name] = {
    x: i * GLYPH_CELL,
    y: 0,
    width: GLYPH_CELL,
    height: GLYPH_CELL,
    anchorY: GLYPH_CELL / 2,
    mask: true,
  };
  return acc;
}, {} as Record<GlyphName, GlyphDefinition>);

/**
 * A test pins this, not the eye: the mapping must cover exactly the atlas
 * and nothing else. A glyph drawn but not mapped silently never renders —
 * deck.gl falls back to the default icon and you are back to circles.
 */
export function mappedGlyphs(): GlyphName[] {
  return Object.keys(GLYPH_MAPPING) as GlyphName[];
}

/**
 * The same path data the map uses, as an inline `<svg>` for a legend swatch.
 *
 * Sourced from GLYPH_SVG rather than redrawn, because a legend showing an
 * arrow that is not quite the arrow on the map is worse than no legend at
 * all: it teaches a shape the operator then fails to find on screen.
 */
export function glyphMarkup(name: GlyphName, size = 16, color = "currentColor"): string {
  return `<svg viewBox="0 0 ${GLYPH_CELL} ${GLYPH_CELL}" width="${size}" height="${size}" fill="${color}" aria-hidden="true">${GLYPH_SVG[name]}</svg>`;
}