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
import {
  HAZE_EVENT_MIN_READINGS,
  HAZE_EVENT_UG,
  HAZE_TESTABLE_SPREAD,
  isHazeVisionPayload,
  type HazeVisionPayload,
} from "./haze-vision";

function payload(over: Partial<HazeVisionPayload["agreement"]> = {}): HazeVisionPayload {
  return {
    generatedAt: "2026-09-30T04:00:00.000Z",
    cameras: [],
    agreement: {
      r: 0.12,
      pairs: 252,
      pm25Min: 3,
      pm25Max: 20,
      pm25Median: 7,
      pm25P95: 13,
      eventReadings: 0,
      spansHazeEvent: false,
      ...over,
    },
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
    const clean = payload({ pm25Median: 7, pm25P95: 13, eventReadings: 0, spansHazeEvent: false });
    const episode = payload({ pm25Median: 22, pm25P95: 96, eventReadings: 14, eventStations: 3, spansHazeEvent: true });
    expect(clean.agreement.spansHazeEvent).toBe(false);
    expect(episode.agreement.spansHazeEvent).toBe(true);
    expect(isHazeVisionPayload(clean)).toBe(true);
    expect(isHazeVisionPayload(episode)).toBe(true);
  });

  it("will not let one faulted sensor manufacture a testable window", () => {
    // This is the real shape of the September history: median 7, p95 13,
    // and exactly two readings at 149 µg/m³ from the broken indoor unit.
    // A min/max spread calls that "3–149, a 146 µg/m³ range" and happily
    // reports a meaningless correlation. The robust test does not.
    const spikeOnly = payload({
      pm25Min: 3,
      pm25Max: 149,
      pm25Median: 7,
      pm25P95: 13,
      eventReadings: 2,
      spansHazeEvent: false,
    });
    expect(spikeOnly.agreement.pm25Max!).toBeGreaterThan(HAZE_EVENT_UG);
    expect(spikeOnly.agreement.spansHazeEvent).toBe(false);
    expect(HAZE_EVENT_MIN_READINGS).toBe(3);
    expect(HAZE_EVENT_UG).toBe(50);
  });

  it("requires a robust spread, not just one high reading", () => {
    // median 7 -> p95 13 is a 6 µg/m³ spread; even with 3 unhealthy
    // readings the window is not a regional episode.
    const narrow = payload({ pm25Median: 7, pm25P95: 13, eventReadings: 3, spansHazeEvent: false });
    expect(narrow.agreement.spansHazeEvent).toBe(false);
  });

  it("rejects a regional-event claim without independent-station evidence", () => {
    const claim = { pm25Median: 7, pm25P95: 90, eventReadings: 5, spansHazeEvent: true };
    expect(isHazeVisionPayload(payload(claim))).toBe(false);
    expect(isHazeVisionPayload(payload({ ...claim, eventStations: 1 }))).toBe(false);
    expect(isHazeVisionPayload(payload({ ...claim, eventStations: 3 }))).toBe(true);
    expect(isHazeVisionPayload(payload({ ...claim, eventStations: 6 }))).toBe(false);
  });

  it("does not trust a claimed event with insufficient spread", () => {
    expect(isHazeVisionPayload(payload({ pm25Median: 7, pm25P95: 13, eventReadings: 5, eventStations: 3, spansHazeEvent: true }))).toBe(false);
  });

  it("keeps the operational testable-spread floor explicit", () => {
    // An engineering diversity gate, not a health guideline or accuracy result.
    expect(HAZE_TESTABLE_SPREAD).toBe(20);
  });
});
