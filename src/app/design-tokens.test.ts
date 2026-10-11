// Guards the colour claims written in the header of globals.css.
//
// The war room's severity colours are load-bearing: an operator reads
// "watch" versus "alert" off them at a glance, on both themes. These
// assertions measure the token values actually shipped, so a re-anchor
// of the palette cannot quietly push a warning below legibility or slide
// the action colour into the warning band (Palette design core, D1).
//
// Units follow the Palette field guide: WCAG 2.x relative-luminance
// contrast; HSL hue in degrees; chroma as RGB max − min on 0–255.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

type Tokens = Record<string, string>;

/** Hex-valued custom properties declared directly inside the first block
 *  that follows `selector`. var() aliases are ignored by design. */
function tokensAfter(selector: string): Tokens {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`selector not found in globals.css: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const body = css.slice(open + 1, close);
  const out: Tokens = {};
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

const light = tokensAfter(":root {");
const darkMedia = tokensAfter(':root:not([data-theme="light"])');
const darkToggle = tokensAfter(':root[data-theme="dark"]');
// The dark blocks override; anything they leave alone inherits light.
const dark: Tokens = { ...light, ...darkToggle };

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hue(hex: string): number | null {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return null;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function chroma(hex: string): number {
  const c = rgb(hex);
  return Math.max(...c) - Math.min(...c);
}

function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const SEVERITIES = ["sev-good", "sev-watch", "sev-alert", "sev-critical", "sev-unknown"] as const;
const CHROMATIC = ["sev-good", "sev-watch", "sev-alert", "sev-critical"] as const;
const THEMES: Array<[string, Tokens]> = [
  ["light", light],
  ["dark", dark],
];

describe("globals.css design tokens", () => {
  it("declares every signal and structure token as a hex value in each theme", () => {
    for (const [, t] of THEMES) {
      for (const k of [...SEVERITIES, "bg", "bg-raised", "ink", "dim", "cool", "line"]) {
        expect(t[k], k).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("keeps the OS-preference and in-app dark blocks identical", () => {
    expect(darkMedia).toEqual(darkToggle);
  });

  describe.each(THEMES)("%s theme", (_name, t) => {
    it.each(SEVERITIES)("%s clears 4.5:1 as text on --bg and --bg-raised", (sev) => {
      expect(contrast(t[sev], t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t[sev], t["bg-raised"])).toBeGreaterThanOrEqual(4.5);
    });

    it("ink clears 7:1 and quiet ink 4.5:1 on every surface", () => {
      for (const surface of ["bg", "bg-raised", "bg-surface"]) {
        expect(contrast(t.ink, t[surface]), `ink on ${surface}`).toBeGreaterThanOrEqual(7);
        expect(contrast(t.dim, t[surface]), `dim on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("action colour clears 4.5:1 as text on --bg and --bg-raised", () => {
      expect(contrast(t.cool, t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.cool, t["bg-raised"])).toBeGreaterThanOrEqual(4.5);
    });

    it("watch and alert sit at least 25° apart in hue", () => {
      expect(hueGap(hue(t["sev-watch"])!, hue(t["sev-alert"])!)).toBeGreaterThanOrEqual(25);
    });

    it("unknown is neutral, so no data can never read as good", () => {
      expect(chroma(t["sev-unknown"])).toBeLessThanOrEqual(8);
    });

    it("the action colour is ≥30° from every severity hue and less chromatic", () => {
      const accentHue = hue(t.cool)!;
      for (const sev of CHROMATIC) {
        expect(hueGap(accentHue, hue(t[sev])!), `${sev} hue gap`).toBeGreaterThanOrEqual(30);
        expect(chroma(t.cool), `${sev} chroma`).toBeLessThan(chroma(t[sev]));
      }
    });
  });
});
