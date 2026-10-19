import { describe, expect, it } from "vitest";
import { buildHazeWatchState } from "./haze-watch-state";
import type { CameraHaze, HazeVisionResponse } from "./haze-vision";
import type { DustboyResponse } from "./dustboy";
import type { AirQualityResponse } from "../../types/cnx";

const NOW = Date.parse("2026-10-19T08:00:00Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const camera = (patch: Partial<CameraHaze> = {}): CameraHaze => ({ cameraId: "one", label: "View", latitude: 18.8, longitude: 99, snapshotUrl: "https://example.test/camera.jpg", observedAt: ago(10), verdict: "clear", score: 0.1, metrics: { meanLuminance: 0.5, contrast: 0.2, saturation: 0.3, darkChannel: 0.1, luminanceRange: 0.7 }, baselineSamples: 12, nearestPm25: null, ...patch });
const vision = (cameras: CameraHaze[], generatedAt = ago(1)): HazeVisionResponse => ({ cameras, generatedAt, provenance: "live", methodology: "screening", note: null, agreement: { r: null, pairs: 0, pm25Min: null, pm25Max: null, pm25Median: null, pm25P95: null, eventReadings: 0, spansHazeEvent: false } });

describe("haze evidence at the current decision clock", () => {
  it("does not let a new relay push refresh an old frame, or retain a score after relay expiry", () => {
    const state = buildHazeWatchState({ now: NOW, hazeVision: vision([camera(), camera({ cameraId: "old", observedAt: ago(90), verdict: "haze-likely", score: 0.7 })]) });
    expect(state.assessedCameras).toHaveLength(1);
    expect(state.hazyCameras).toHaveLength(0);
    expect(state.staleCameras).toHaveLength(1);
    expect(buildHazeWatchState({ now: NOW, hazeVision: vision([camera()], ago(46)) }).assessedCameras).toHaveLength(0);
  });
  it("never promotes malformed, uncalibrated or night frames to assessed clear air", () => {
    for (const bad of [{ score: null }, { score: NaN }, { score: 4 }, { baselineSamples: 1 }, { metrics: null }, { observedAt: ago(-10) }, { verdict: "no-colour" as const, score: null }]) {
      expect(buildHazeWatchState({ now: NOW, hazeVision: vision([camera(bad)]) }).assessedCameras, JSON.stringify(bad)).toHaveLength(0);
    }
  });
  it("re-ages measured/model values instead of trusting a retained aggregate or suspect sensor", () => {
    const air = { generatedAt: ago(1), stations: [
      { stationId: "pcd", source: "pcd", pm25: 0, observedAt: ago(5) },
      { stationId: "stale", source: "pcd", pm25: 99, observedAt: ago(181) },
      { stationId: "future", source: "open-meteo", pm25: 20, observedAt: ago(-10) },
      { stationId: "bad", source: "pcd", pm25: NaN, observedAt: ago(5) },
    ] } as AirQualityResponse;
    const dustboy = { provenance: "live", stations: [
      { stationId: "cm", province: "เชียงใหม่", pm25: 10, suspect: false, observedAt: ago(60) },
      { stationId: "other", province: "ลำพูน", pm25: 20, suspect: false, observedAt: ago(60) },
      { stationId: "broken", province: "เชียงใหม่", pm25: 900, suspect: true, observedAt: ago(60) },
      { stationId: "old", province: "เชียงใหม่", pm25: 90, suspect: false, observedAt: ago(181) },
    ] } as DustboyResponse;
    const state = buildHazeWatchState({ now: NOW, air, dustboy });
    expect(state.freshPcd.map(s => s.stationId)).toEqual(["pcd"]);
    expect(state.freshModel).toHaveLength(0);
    expect(state.freshDustboy).toHaveLength(2);
    expect(state.chiangMaiDustboy.map(s => s.stationId)).toEqual(["cm"]);
    expect(buildHazeWatchState({ now: NOW + 4 * 3_600_000, air, dustboy }).freshPcd).toHaveLength(0);
  });
  it.each([null, undefined])("cannot refresh AOD without an actual model observation hour (%s)", observedAt => {
    expect(buildHazeWatchState({ now: NOW, aerosol: { generatedAt: ago(1), observedAt, provenance: "model", aod550: 0.1 } as never }).currentAerosol).toBe(false);
  });
  it("uses the model observation hour, never the new JSON assembly time", () => {
    expect(buildHazeWatchState({ now: NOW, aerosol: { generatedAt: ago(1), observedAt: ago(181), provenance: "model", aod550: 0.1 } as never }).currentAerosol).toBe(false);
  });
});
