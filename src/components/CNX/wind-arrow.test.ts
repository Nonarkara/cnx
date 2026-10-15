import { describe, expect, it } from "vitest";
import { windArrowSegments } from "./forecast-render";

describe("wind arrows stay recognizable in light wind", () => {
  it("keeps a visible shaft and two head wings at low speed", () => {
    const [tail, tip, left, right] = windArrowSegments(0.01, 0)!;
    expect(tip[0] - tail[0]).toBe(14);
    expect(left[1]).toBeLessThan(0);
    expect(right[1]).toBeGreaterThan(0);
    expect(left[0]).toBeLessThan(tip[0]);
  });
  it("points along the screen velocity, including a southward flow", () => {
    const [tail, tip, left, right] = windArrowSegments(0, 2)!;
    expect(tip[1]).toBeGreaterThan(tail[1]);
    expect(left[0]).toBeGreaterThan(tip[0]);
    expect(right[0]).toBeLessThan(tip[0]);
  });
  it("does not invent a direction for calm or invalid wind", () => {
    expect(windArrowSegments(0, 0)).toBeNull();
    expect(windArrowSegments(NaN, 1)).toBeNull();
  });
});
