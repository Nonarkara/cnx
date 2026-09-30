// The agreement metric is the only place this project publishes a claim
// about its OWN accuracy against ground truth. That makes it the most
// dangerous string in the codebase: a number an operator reads as a
// verdict on whether the cameras work.
//
// The defect these lock
//
// For the first month of operation the panel printed:
//
//     Agreement with nearest DustBoy sensor so far: r = 0.12 over 252
//     frame/sensor pairs.
//
// which reads as "the cameras do not track reality." The truth is that
// every paired reading was clean air — 3 to 20 µg/m³, median 7 — so
// there was no haze episode for the scorer to detect. Pearson against a
// near-constant response returns a small number whether the image
// statistics are excellent or worthless. The metric was reporting the
// absence of a test in the visual language of a failed one, which is the
// same disease as the flood panel that shipped before the DEMO badge.
//
// So the payload now carries the ground range and whether the window
// spanned a real event, and the panel says "not yet measurable" until it
// has. The r is still published — just never without the context that
// makes it interpretable.

import { describe, expect, it } from "vitest";
import { HAZE_TESTABLE_SPREAD, isHazeVisionPayload, type HazeVisionPayload } from "./haze-vision";

function payload(over: Partial<HazeVisionPayload["agreement"]> = {}): HazeVisionPayload {
  return {
    generatedAt: "2026-09-30T04:00:00.000Z",
    cameras: [],
    agreement: { r: 0.12, pairs: 252, pm25Min: 3, pm25Max: 20, spansHazeEvent: false, ...over },
  };
}

describe("haze agreement payload", () => {
  it("accepts the full agreement context", () => {
    expect(isHazeVisionPayload(payload())).toBe(true);
  });

  it("rejects a bare r with no range — the shape that shipped", () => {
    // This is the old contract. It must no longer validate, or an older
    // relay push could keep rendering "r = 0.12" with no caveat.
    expect(
      isHazeVisionPayload({
        generatedAt: "2026-09-30T04:00:00.000Z",
        cameras: [],
        agreement: { r: 0.12, pairs: 252 },
      }),
    ).toBe(false);
  });

  it("requires spansHazeEvent to be a boolean, not a truthy value", () => {
    expect(isHazeVisionPayload(payload({ spansHazeEvent: undefined as never }))).toBe(false);
  });

  it("distinguishes a clean-air window from a real episode", () => {
    const clean = payload({ pm25Min: 3, pm25Max: 20, spansHazeEvent: false });
    const episode = payload({ pm25Min: 8, pm25Max: 149, spansHazeEvent: true });
    expect(clean.agreement.spansHazeEvent).toBe(false);
    expect(episode.agreement.spansHazeEvent).toBe(true);
    expect(isHazeVisionPayload(clean)).toBe(true);
    expect(isHazeVisionPayload(episode)).toBe(true);
  });

  it("sets the testable-spread floor at the WHO 24h guideline", () => {
    // 20 µg/m³ — below this a correlation cannot discriminate a working
    // scorer from a broken one. The September dataset spanned 3-20, i.e.
    // entirely inside the untestable band.
    expect(HAZE_TESTABLE_SPREAD).toBe(20);
  });
});
