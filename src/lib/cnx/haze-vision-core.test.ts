import { describe, expect, it } from "vitest";
import { MIN_BASELINE_SAMPLES, baselineFrom, classifyFrame, computeFrameMetrics, pearson, type FrameMetrics } from "./haze-vision-core";

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

const metrics = (haze: number, brightness = 1) => computeFrameMetrics(scene(haze, brightness), W, H, 3);

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

  it("separates a hazy frame from a clear one against the camera's own baseline", () => {
    expect(classifyFrame(metrics(0.05), history).label).toBe("clear");
    const hazy = classifyFrame(metrics(0.75), history);
    expect(hazy.label).toBe("haze-likely");
    expect(hazy.score).toBeGreaterThanOrEqual(0.5);
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
