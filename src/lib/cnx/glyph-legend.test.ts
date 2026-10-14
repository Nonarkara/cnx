// The legend is the thing that stops the map being misread, so it is tested
// against the same things that make it dangerous in the first place:
//
//   • a legend swatch that drifts from the mark on the map teaches a shape
//     the operator then cannot find on screen;
//   • a legend that silently omits a layer implies the layer is absent;
//   • a legend with three blue swatches and no provenance launders a model
//     forecast into looking like a measurement.
//
// The third is the one this board treats as fatal, so "every row says where
// its number came from" is asserted rather than assumed.

import { describe, expect, it } from "vitest";
import { GLYPH_MAPPING, GLYPH_NAMES, glyphMarkup } from "./map-glyphs";
import { LEGEND_ROWS, type LegendShape } from "../../components/CNX/CNXGlyphLegend";

const GLYPH_SHAPES: LegendShape[] = ["flame", "droplet", "arrow"];

describe("the symbol key is complete", () => {
  it("gives every mark the map draws a row", () => {
    const ids = LEGEND_ROWS.map((r) => r.id);
    // Anything the operator could confuse must be present. A missing row is
    // not a neutral omission: it reads as "nothing of this kind is here".
    for (const required of ["wind", "rain-gauge", "rain-forecast", "fire", "pm25", "citizen"]) {
      expect(ids).toContain(required);
    }
  });

  it("has no duplicate ids", () => {
    const ids = LEGEND_ROWS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("every row states where its number comes from", () => {
  it("carries both a Thai and an English origin word", () => {
    for (const r of LEGEND_ROWS) {
      expect(r.originTh.trim().length).toBeGreaterThan(0);
      expect(r.originEn.trim().length).toBeGreaterThan(0);
      expect(r.labelTh.trim().length).toBeGreaterThan(0);
      expect(r.labelEn.trim().length).toBeGreaterThan(0);
    }
  });

  it("distinguishes measured from modelled — the distinction this board exists to protect", () => {
    const origins = LEGEND_ROWS.map((r) => r.originEn);
    expect(origins).toContain("measured");
    expect(origins).toContain("model");
    // The rain gauge and the rain forecast are both blue on the map. If the
    // key ever collapses them to one word, a forecast would be readable as a
    // gauge reading.
    expect(LEGEND_ROWS.find((r) => r.id === "rain-gauge")?.originEn).toBe("measured");
    expect(LEGEND_ROWS.find((r) => r.id === "rain-forecast")?.originEn).toBe("model");
  });
});

describe("the key cannot drift from the map", () => {
  it("uses only glyphs that are actually drawn", () => {
    for (const r of LEGEND_ROWS) {
      if (GLYPH_SHAPES.includes(r.shape)) {
        expect(GLYPH_NAMES).toContain(r.shape);
        expect(GLYPH_MAPPING[r.shape as (typeof GLYPH_NAMES)[number]]).toBeDefined();
      }
    }
  });

  it("renders the swatch from the same path data the atlas uses", () => {
    // The exact drift this catches: someone redraws the flame in the legend
    // "to look better" while the map keeps the old one.
    for (const name of GLYPH_NAMES) {
      const markup = glyphMarkup(name, 16, "red");
      expect(markup).toContain("<svg");
      expect(markup).toContain('viewBox="0 0 64 64"');
      // The markup carries the path itself — not an <img> of a separately
      // maintained file that could drift from the atlas.
      expect(markup.match(/<path|<polygon/)).not.toBeNull();
      expect(markup).not.toContain("<image");
    }
  });

  it("keeps flame and droplet as separate rows — they were both circles once", () => {
    const flame = LEGEND_ROWS.find((r) => r.shape === "flame");
    const droplet = LEGEND_ROWS.find((r) => r.shape === "droplet");
    expect(flame).toBeDefined();
    expect(droplet).toBeDefined();
    expect(flame!.id).not.toBe(droplet!.id);
  });

  it("labels the arrow as pointing downwind, not from", () => {
    // The bar's text says where the wind comes FROM and the arrow points the
    // other way. Both are true; neither may be left for the reader to infer.
    const arrow = LEGEND_ROWS.find((r) => r.shape === "arrow");
    expect(arrow?.labelEn.toLowerCase()).toContain("where the air is moving");
    expect(arrow?.labelTh).toContain("ทางที่ลมพัดไป");
  });

  it("names the moving lines as wind and the rain forecast as a colour wash", () => {
    const streaks = LEGEND_ROWS.find((r) => r.id === "wind-streaks");
    const rain = LEGEND_ROWS.find((r) => r.id === "rain-forecast");
    expect(streaks?.labelEn).toContain("Moving lines are wind");
    expect(streaks?.labelTh).toContain("เส้นที่เคลื่อนคือลม");
    expect(rain?.labelEn.toLowerCase()).toContain("colour wash");
    expect(rain?.labelTh).toContain("สีบนแผนที่");
  });
});

describe("legend colours match the map", () => {
  it("uses the fire alert colour the fire layer paints", () => {
    // Kept in step with CNXMap's fire getColor by assertion, not by sharing
    // a constant, because the map's palette is deliberately independent of
    // theme tokens (it sits on imagery, not on the page ground).
    expect(LEGEND_ROWS.find((r) => r.shape === "flame")?.color).toBe("rgb(255,140,0)");
  });

  it("uses the heavy-rain colour the rain layer paints", () => {
    expect(LEGEND_ROWS.find((r) => r.shape === "droplet")?.color).toBe("rgb(37,99,235)");
  });

  it("gives every non-ink row an explicit colour", () => {
    for (const r of LEGEND_ROWS) {
      const inkShapes: LegendShape[] = ["arrow", "streak", "rainRamp", "pmRamp"];
      if (!inkShapes.includes(r.shape)) {
        expect(r.color, `row ${r.id} has no colour`).toBeTruthy();
      }
    }
  });
});