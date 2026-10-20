import { afterEach, expect, it, vi } from "vitest";
import { fetchCnxWaterVision, isWaterVisionPayload } from "./water-vision";
import { WATER_CAMERAS, WATER_METHODOLOGY, waterImageStatus, type WaterVisionPayload } from "./water-vision-core";
import { POST } from "../../app/api/cnx/water-vision/ingest/route";

const store = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: { CNX_FLIGHTS_KV: store } }) }));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); store.get.mockReset(); store.put.mockReset(); });
const now = Date.parse("2026-10-20T14:00:00Z");
const payload = (): WaterVisionPayload => ({ generatedAt: new Date(now).toISOString(), cameras: WATER_CAMERAS.map(camera => ({ ...camera, observedAt: new Date(now - 600_000).toISOString(), collectedAt: new Date(now).toISOString(), status: "inspectable", frameChanged: null, metrics: { meanLuminance: 0.5, contrast: 0.15, luminanceRange: 0.6 }, note: null })) });

it("requires pinned camera identity, URLs and internally honest capture/quality status", () => {
  const valid = payload();
  expect(isWaterVisionPayload(valid)).toBe(true);
  for (const patch of [{ snapshotUrl: "https://evil.test/track" }, { cameraId: "other" }, { latitude: 0 }, { observedAt: null }, { metrics: null }, { observedAt: new Date(now + 3600_000).toISOString() }, { collectedAt: new Date(now + 3600_000).toISOString() }, { metrics: { meanLuminance: 0, contrast: 0, luminanceRange: 0 } }]) {
    expect(isWaterVisionPayload({ ...valid, cameras: [{ ...valid.cameras[0], ...patch }, ...valid.cameras.slice(1)] }), JSON.stringify(patch)).toBe(false);
  }
  expect(isWaterVisionPayload({ ...valid, cameras: [valid.cameras[0], valid.cameras[0]] })).toBe(false);
});
it("separates unknown capture clocks, stale captures and image visibility without a flood verdict", () => {
  const metrics = { meanLuminance: 0.5, contrast: 0.15, luminanceRange: 0.6 };
  expect(waterImageStatus(metrics, null, now)).toBe("capture-time-unknown");
  expect(waterImageStatus(metrics, new Date(now - 46 * 60_000).toISOString(), now)).toBe("stale");
  expect(waterImageStatus({ ...metrics, meanLuminance: 0.02 }, new Date(now).toISOString(), now)).toBe("low-light");
  expect(waterImageStatus({ ...metrics, contrast: 0.001, luminanceRange: 0 }, new Date(now).toISOString(), now)).toBe("low-detail");
  expect(WATER_METHODOLOGY).toMatch(/not.*flood|not.*depth/i);
});
it("uses existing ingest auth/body caps and rejects invalid camera payloads", async () => {
  vi.stubEnv("CNX_FLIGHTS_RELAY_SECRET", "test-secret");
  vi.spyOn(Date, "now").mockReturnValue(now);
  const request = (body: string, headers = {}) => new Request("https://cnx.test/ingest", { method: "POST", body, headers });
  expect((await POST(request(JSON.stringify(payload())))).status).toBe(401);
  expect((await POST(request("{}", { "x-relay-secret": "test-secret" }))).status).toBe(422);
  expect((await POST(request("{}", { "x-relay-secret": "test-secret", "content-length": "1048577" }))).status).toBe(413);
  expect((await POST(request(JSON.stringify(payload()), { "x-relay-secret": "test-secret" }))).status).toBe(200);
});
it("withholds expired relay copies without inventing an empty or safe water finding", async () => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  store.get.mockResolvedValue(JSON.stringify(payload()));
  expect((await fetchCnxWaterVision()).provenance).toBe("live");
  store.get.mockResolvedValue(JSON.stringify({ ...payload(), generatedAt: new Date(now - 46 * 60_000).toISOString() }));
  expect(await fetchCnxWaterVision()).toMatchObject({ provenance: "unavailable", cameras: [] });
});
it("re-ages captures even when the relay batch is still current", async () => {
  vi.spyOn(Date, "now").mockReturnValue(now + 40 * 60_000);
  store.get.mockResolvedValue(JSON.stringify(payload()));
  expect((await fetchCnxWaterVision()).cameras[0].status).toBe("stale");
});
