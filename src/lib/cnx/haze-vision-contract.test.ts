import { expect, it } from "vitest";
import { isHazeVisionPayload, type CameraHaze } from "./haze-vision";
const generatedAt = "2026-10-19T08:00:00Z";
const camera: CameraHaze = { cameraId: "one", label: "View", latitude: 18.8, longitude: 99, snapshotUrl: "https://example.test/view.jpg", observedAt: generatedAt, verdict: "clear", score: 0.1, metrics: { meanLuminance: 0.5, contrast: 0.2, darkChannel: 0.1, saturation: 0.3, luminanceRange: 0.7 }, baselineSamples: 12, nearestPm25: null };
const payload = (patch: Partial<CameraHaze>) => ({ generatedAt, cameras: [{ ...camera, ...patch }], agreement: { r: null, pairs: 0, pm25Min: null, pm25Max: null, pm25Median: null, pm25P95: null, eventReadings: 0, eventStations: 0, spansHazeEvent: false } });
it("admits a coherent camera screening result", () => expect(isHazeVisionPayload(payload({}))).toBe(true));
it.each([
  { score: null }, { score: 4 }, { score: -1 }, { metrics: null }, { baselineSamples: 1 },
  { verdict: "haze-likely" as const, score: 0.1 }, { verdict: "unusable" as const, score: 0.1 },
  { observedAt: "2026-10-19T09:00:00Z" }, { observedAt: "2026-10-19T01:00:00Z" },
  { latitude: 999 }, { baselineSamples: -1 },
  { nearestPm25: { stationName: "Ground", pm25: -1, distanceKm: 1, observedAt: generatedAt } },
  { nearestPm25: { stationName: "Ground", pm25: 20, distanceKm: 16, observedAt: generatedAt } },
  { nearestPm25: { stationName: "Ground", pm25: 20, distanceKm: 1, observedAt: "2026-10-19T05:00:00Z" } },
])("rejects incoherent camera evidence %j", patch => expect(isHazeVisionPayload(payload(patch))).toBe(false));
