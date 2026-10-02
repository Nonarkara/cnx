import { describe, expect, it } from "vitest";
import { MIN_BASELINE_SAMPLES, MIN_COLOUR_SATURATION, baselineFrom, classifyFrame, computeFrameMetrics, isScorable, pearson, type FrameMetrics } from "./haze-vision-core";

const W = 40;
const H = 40;

/** A textured scene; `haze` blends every pixel toward grey airlight (He et
 *  al.'s I = J·t + A·(1−t) model with t = 1 − haze). */
function scene(haze: number, brightness = 1): Uint8Array {
  const px = new Uint8Array(W * H * 3);
  const airlight = 200;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const clear = [(x * 37) % 256, (y * 53) % 256, ((x + y) * 17) % 90];
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(((1 - haze) * clear[c] + haze * airlight) * brightness);
    }
  }
  return px;
}

/** A monochrome infrared night-vision frame: R=G=B everywhere. Mirrors the
 *  real Windy still captured 2026-09-29 19:25 BKK (luminance 0.315,
 *  darkChannel 0.271, saturation exactly 0). */
function infraredScene(brightness = 0.31): Uint8Array {
  const px = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const g = Math.round(((x * 31 + y * 17) % 90 + 40) * brightness * 3);
      px[i] = px[i + 1] = px[i + 2] = g;
    }
  }
  return px;
}

const metrics = (haze: number, brightness = 1) => computeFrameMetrics(scene(haze, brightness), W, H, 3);
const irMetrics = (brightness = 0.31) => computeFrameMetrics(infraredScene(brightness), W, H, 3);

describe("computeFrameMetrics", () => {
  it("raises the dark channel and lowers contrast and saturation as haze thickens", () => {
    const clear = metrics(0);
    const hazy = metrics(0.7);
    expect(hazy.darkChannel).toBeGreaterThan(clear.darkChannel + 0.2);
    expect(hazy.contrast).toBeLessThan(clear.contrast);
    expect(hazy.saturation).toBeLessThan(clear.saturation);
  });
});

describe("classifyFrame", () => {
  const history: FrameMetrics[] = Array.from({ length: MIN_BASELINE_SAMPLES }, (_, i) => metrics(i % 3 === 0 ? 0.4 : 0.05));

  it("waits for enough daylight history before judging", () => {
    expect(classifyFrame(metrics(0.7), history.slice(0, 3)).label).toBe("calibrating");
  });

  it("skips night frames instead of calling them hazy", () => {
    expect(classifyFrame(metrics(0, 0.05), history).label).toBe("too-dark");
  });

  it("rejects bright monochrome infrared frames that pass the luminance gate", () => {
    // Regression: Windy cameras that switch to IR after dusk produce frames
    // bright enough to clear MIN_DAYLIGHT_LUMINANCE but with no colour.
    const ir = irMetrics();
    expect(ir.meanLuminance).toBeGreaterThan(0.14);
    expect(ir.saturation).toBeLessThan(MIN_COLOUR_SATURATION);
    expect(isScorable(ir)).toBe(false);
    const v = classifyFrame(ir, history);
    expect(v.label).toBe("no-colour");
    expect(v.score).toBeNull();
  });

  it("keeps infrared frames out of the baseline so they cannot drift the score", () => {
    // 20 daylight frames + 20 IR frames. The baseline must be built from the
    // 20 daylight frames only, not diluted by the night-vision images.
    const withIr = [...history, ...Array.from({ length: 20 }, () => irMetrics())];
    const base = baselineFrom(withIr);
    expect(base?.samples).toBe(MIN_BASELINE_SAMPLES);
    const clean = baselineFrom(history);
    expect(base?.darkChannel).toBeCloseTo(clean?.darkChannel ?? -1, 10);
  });

  it("still scores genuinely colourful frames as daylight", () => {
    const day = metrics(0.05);
    expect(day.saturation).toBeGreaterThan(MIN_COLOUR_SATURATION);
    expect(isScorable(day)).toBe(true);
  });

  it("separates a hazy frame from a clear one against the camera's own baseline", () => {
    expect(classifyFrame(metrics(0.05), history).label).toBe("clear");
    const hazy = classifyFrame(metrics(0.75), history);
    expect(hazy.label).toBe("haze-likely");
    expect(hazy.score).toBeGreaterThanOrEqual(0.5);
  });

  it("does not interpret a uniform exposure change as haze", () => {
    const clear: FrameMetrics = { meanLuminance: 0.5, darkChannel: 0.2, contrast: 0.15, saturation: 0.3 };
    const baseline = Array.from({ length: MIN_BASELINE_SAMPLES }, () => clear);
    for (const gain of [0.5, 1, 1.8]) {
      const exposed = { ...clear, meanLuminance: clear.meanLuminance * gain, darkChannel: clear.darkChannel * gain, contrast: clear.contrast * gain };
      expect(classifyFrame(exposed, baseline)).toEqual({ label: "clear", score: 0 });
    }
  });

  it("preserves the haze signal across exposure changes", () => {
    const baseline = Array.from({ length: MIN_BASELINE_SAMPLES }, () => metrics(0.05));
    const bright = classifyFrame(metrics(0.7), baseline);
    const dim = classifyFrame(metrics(0.7, 0.6), baseline);
    expect(bright.label).toBe("haze-likely");
    expect(dim.label).toBe(bright.label);
    expect(Math.abs(dim.score! - bright.score!)).toBeLessThanOrEqual(0.02);
  });

  it("builds the baseline from daylight frames only", () => {
    const withNights = [...history, ...Array.from({ length: 20 }, () => metrics(0, 0.05))];
    expect(baselineFrom(withNights)?.samples).toBe(MIN_BASELINE_SAMPLES);
  });
});

describe("pearson", () => {
  it("returns null for too few pairs or no variance", () => {
    expect(pearson([1, 2, 3], [1, 2, 3])).toBeNull();
    expect(pearson(Array(10).fill(1), Array.from({ length: 10 }, (_, i) => i))).toBeNull();
  });

  it("measures agreement", () => {
    const xs = Array.from({ length: 10 }, (_, i) => i);
    expect(pearson(xs, xs.map((x) => 2 * x + 1))).toBe(1);
    expect(pearson(xs, xs.map((x) => -x))).toBe(-1);
  });
});
