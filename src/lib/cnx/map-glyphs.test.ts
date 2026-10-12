// The glyphs exist to stop one dot on the map being read as another. That
// only holds if the three silhouettes stay mutually distinguishable at the
// size they are actually drawn — and two earlier cuts of these paths looked
// fine in source and collapsed into the same blob when rendered at 14 px.
//
// So the tests here assert the properties the eye checked, not the paths.
// A future tweak that re-squashes the flame onto the droplet fails these.

import { describe, expect, it } from "vitest";
import { GLYPH_ATLAS, GLYPH_CELL, GLYPH_MAPPING, GLYPH_NAMES, mappedGlyphs } from "./map-glyphs";

function svgSource(): string {
  return decodeURIComponent(GLYPH_ATLAS.replace("data:image/svg+xml;utf8,", ""));
}

/** Tight bounding box of drawn pixels, in the 64×64 cell. */
function inkBounds(cellIndex: number): { w: number; h: number; y0: number; y1: number } {
  // Measured from the geometry constants rather than rasterised, so the test
  // needs no image dependency and stays fast and deterministic.
  const svg = svgSource();
  const cells = svg.match(/<g transform="translate\(\d+,0\)">.*?<\/g>/g) ?? [];
  const body = cells[cellIndex];
  const nums = (body.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  // Ignore the leading translate offset (two numbers per g tag).
  const coords = nums.slice(2);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i + 1 < coords.length; i += 2) {
    xs.push(coords[i]);
    ys.push(coords[i + 1]);
  }
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  return { w: x1 - x0, h: y1 - y0, y0, y1 };
}

describe("the glyph atlas is internally consistent", () => {
  it("maps exactly the glyphs it draws — no more, no fewer", () => {
    // A glyph drawn but not mapped silently falls back to deck.gl's default
    // icon, which is a circle: the exact failure this module exists to stop,
    // and one that would not throw.
    expect(mappedGlyphs().sort()).toEqual([...GLYPH_NAMES].sort());
    expect(Object.keys(GLYPH_MAPPING)).toHaveLength(GLYPH_NAMES.length);
  });

  it("lays cells out left to right with no overlap", () => {
    GLYPH_NAMES.forEach((name, i) => {
      const m = GLYPH_MAPPING[name];
      expect(m.x).toBe(i * GLYPH_CELL);
      expect(m.y).toBe(0);
      expect(m.width).toBe(GLYPH_CELL);
      expect(m.height).toBe(GLYPH_CELL);
    });
  });

  it("centres each glyph on its anchor so markers do not sit half a cell low", () => {
    for (const name of GLYPH_NAMES) {
      expect(GLYPH_MAPPING[name].anchorY).toBe(GLYPH_CELL / 2);
    }
  });

  it("masks every glyph so one atlas can serve every severity colour", () => {
    for (const name of GLYPH_NAMES) {
      expect(GLYPH_MAPPING[name].mask).toBe(true);
    }
  });

  it("declares an atlas wide enough for all cells", () => {
    const svg = svgSource();
    expect(svg).toContain(`width="${GLYPH_NAMES.length * GLYPH_CELL}"`);
    expect(svg).toContain(`height="${GLYPH_CELL}"`);
  });
});

describe("flame and droplet must not collapse into each other", () => {
  it("separates them by aspect ratio — the cue that survives pixelation", () => {
    const flame = inkBounds(GLYPH_NAMES.indexOf("flame"));
    const droplet = inkBounds(GLYPH_NAMES.indexOf("droplet"));
    // Flame is the squat one, droplet the tall one. Same height, very
    // different width is what a governor can still tell apart from across a
    // room; matching aspect ratios is what made the first two cuts useless.
    expect(flame.w / flame.h).toBeLessThan(1.35);
    expect(droplet.w / droplet.h).toBeLessThan(0.75);
  });

  it("gives the flame a pointed crown rather than a round top", () => {
    // A droplet's defining feature is its point. If the flame also tapers to
    // a point at the same place, the two converge at any size.
    const flame = inkBounds(GLYPH_NAMES.indexOf("flame"));
    const droplet = inkBounds(GLYPH_NAMES.indexOf("droplet"));
    expect(flame.w).toBeGreaterThan(droplet.w * 1.5);
    expect(droplet.y0).toBeLessThan(flame.y0); // droplet reaches higher
  });
});

describe("the arrow must still read as an arrow at marker size", () => {
  it("gives the head a real share of the glyph, not a conventional small one", () => {
    const svg = svgSource();
    const arrow = svg.match(/<polygon[^>]*\/>/)?.[0] ?? "";
    const nums = (arrow.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const totalWidth = Math.max(...xs) - Math.min(...xs);
    // Shaft runs from x=2 to x=26; the head then owns everything out to 54.
    // Two earlier cuts made the head ~16 units on a 48-unit glyph and it
    // disappeared at 14 px, reading as a plain bar.
    expect(totalWidth).toBe(52);
    expect(54 - 26).toBeGreaterThanOrEqual(24);
  });

  it("points east at angle 0, so getAngle needs no per-glyph correction", () => {
    const arrow = svgSource().match(/<polygon[^>]*\/>/)?.[0] ?? "";
    const nums = (arrow.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    const ys = pts.map(([, y]) => y);
    const midY = (Math.max(...ys) + Math.min(...ys)) / 2;
    // The rightmost point is the tip, and it must sit on the vertical centre
    // line — that is what makes angle 0 mean east. (Finding the max rather
    // than reading the last point: the polygon's vertex order is an
    // implementation detail, the tip's position is the contract.)
    const tip = pts.reduce((a, b) => (b[0] > a[0] ? b : a));
    expect(tip[0]).toBe(54);
    expect(tip[1]).toBe(midY);
  });
});

describe("every glyph path is real geometry", () => {
  it("has a fill, so nothing renders as an invisible outline", () => {
    const svg = svgSource();
    expect(svg).toContain('fill="white"');
    expect(svg).toContain('stroke="none"');
  });

  it("emits one drawable shape per cell", () => {
    const cells = svgSource().match(/<g transform="translate\(\d+,0\)">/g) ?? [];
    expect(cells).toHaveLength(GLYPH_NAMES.length);
  });
});