import { afterEach, expect, it, vi } from "vitest";
import { fetchCnxHazeVision, isHazeVisionPayload, type CameraHaze, type HazeVisionPayload } from "./haze-vision";
import { readRelayJson } from "./relay-kv";
vi.mock("./relay-kv", async original => ({ ...await original<typeof import("./relay-kv")>(), readRelayJson: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
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

it.each([
  { cameras: [] },
  { cameras: [{ ...camera, verdict: "calibrating" as const, score: null, baselineSamples: 1 }] },
  { cameras: [{ ...camera, observedAt: "2026-10-19T07:00:00Z" }] },
])("keeps current relay provenance separate from missing current camera assessment %j", async ({ cameras }) => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(generatedAt));
  const held: HazeVisionPayload = { ...payload({}), cameras };
  vi.mocked(readRelayJson).mockResolvedValueOnce(held);
  const result = await fetchCnxHazeVision();
  expect(result.provenance).toBe("live");
  expect(result.note).toContain("Camera haze conditions are unknown, not clear");
  expect(result.cameras).toEqual(cameras);
});
it("retains current assessed camera evidence without a missing-camera warning", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(generatedAt));
  vi.mocked(readRelayJson).mockResolvedValueOnce(payload({}));
  const result = await fetchCnxHazeVision();
  expect(result).toMatchObject({ provenance: "live", note: null });
  expect(result.cameras[0].verdict).toBe("clear");
});
