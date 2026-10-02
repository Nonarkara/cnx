import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { isHazeVisionPayload, type HazeVisionPayload } from "./haze-vision";

const storage = vi.hoisted(() => ({ history: "{}" }));
vi.mock("node:fs", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs")>(),
  readFileSync: vi.fn(() => storage.history),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn((_path: string, text: string) => { storage.history = text; }),
}));

const NOW = Date.parse("2026-10-02T06:00:00Z");
let relay: typeof import("../../../scripts/haze-vision.mjs");
let image: Buffer;
let modified: string | null;
let capturedAt: string | undefined;
let payload: HazeVisionPayload;
let sensors: object[];

beforeEach(async () => {
  vi.resetModules();
  storage.history = "{}";
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  relay = await import("../../../scripts/haze-vision.mjs");
  const pixels = Buffer.alloc(40 * 40 * 3);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
    const i = (y * 40 + x) * 3;
    pixels[i] = (x * 37) % 256;
    pixels[i + 1] = (y * 53) % 256;
    pixels[i + 2] = ((x + y) * 17) % 90;
  }
  image = await sharp(pixels, { raw: { width: 40, height: 40, channels: 3 } }).png().toBuffer();
  modified = new Date(NOW).toUTCString();
  capturedAt = undefined;
  sensors = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith("/cctv")) return Response.json({ slots: [{ id: "camera", label: "Test camera", latitude: 18.8, longitude: 99, reachable: true, posterUrl: "https://camera.test/image.png", capturedAt }] });
    if (url.includes("stations.json")) return Response.json(sensors);
    if (url === "https://camera.test/image.png") return new Response(new Uint8Array(image), { headers: modified ? { "last-modified": modified } : {} });
    if (url.endsWith("/ingest")) { payload = JSON.parse(options!.body as string); return Response.json({ ok: true }); }
    throw new Error(`Unexpected fetch: ${url}`);
  }));
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const run = () => relay.runHazeVision({ baseUrl: "https://relay.test", secret: "test-secret" });

function sensor(log: string, pm25 = 12, name = "Station") {
  return { dustboy_uri: name, dustboy_name: name, dustboy_lat: "18.8", dustboy_lon: "99", province_code: "50", pm25, log_datetime: log };
}

describe("camera vision relay", () => {
  it("rejects a declared oversized snapshot before decoding", async () => {
    const ordinaryFetch = fetch;
    let cancelled = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "https://camera.test/image.png") return new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
        headers: { "last-modified": modified!, "content-length": String(13 * 1024 * 1024) },
      });
      return ordinaryFetch(url, options);
    }));
    await run();
    expect(cancelled).toBe(true);
    expect(payload.cameras).toHaveLength(0);
  });

  it("cancels an oversized chunked snapshot without trusting Content-Length", async () => {
    const ordinaryFetch = fetch;
    let cancelled = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "https://camera.test/image.png") return new Response(new ReadableStream({
        pull(controller) { controller.enqueue(new Uint8Array(7 * 1024 * 1024)); },
        cancel() { cancelled = true; },
      }), { headers: { "last-modified": modified! } });
      return ordinaryFetch(url, options);
    }));
    await run();
    expect(cancelled).toBe(true);
    expect(payload.cameras).toHaveLength(0);
  });

  it("rejects a compressed image whose decoded dimensions exceed 24 million pixels", async () => {
    image = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "red" } }).png().toBuffer();
    expect(image.length).toBeLessThan(12 * 1024 * 1024);
    await run();
    expect(payload.cameras).toHaveLength(0);
  });

  it("does not invent a capture time when neither source supplies one", async () => {
    modified = null;
    await run();
    expect(payload.cameras).toHaveLength(0);
    expect(JSON.parse(storage.history).camera ?? []).toHaveLength(0);
  });

  it("uses a known roster capture time when the image has no Last-Modified", async () => {
    modified = null;
    capturedAt = new Date(NOW - 30 * 60_000).toISOString();
    await run();
    expect(payload.cameras[0].observedAt).toBe(capturedAt);
    expect(isHazeVisionPayload(payload)).toBe(true);
  });

  it("rejects future-dated and stale images", async () => {
    modified = new Date(NOW + 60 * 60_000).toUTCString();
    await run();
    expect(payload.cameras).toHaveLength(0);
    vi.spyOn(Date, "now").mockReturnValue(NOW + 10 * 60_000);
    modified = new Date(NOW - 7 * 60 * 60_000).toUTCString();
    await run();
    expect(payload.cameras).toHaveLength(0);
  });

  it("does not count an identical image twice when the CDN changes its timestamp", async () => {
    await run();
    vi.spyOn(Date, "now").mockReturnValue(NOW + 10 * 60_000);
    modified = new Date(NOW + 10 * 60_000).toUTCString();
    await run();
    expect(JSON.parse(storage.history).camera).toHaveLength(1);
    expect(payload.cameras[0].baselineSamples).toBe(1);
    expect(payload.cameras[0].observedAt).toBe(new Date(NOW).toISOString());
  });

  it("allows a genuinely changed image to add a calibration sample", async () => {
    await run();
    vi.spyOn(Date, "now").mockReturnValue(NOW + 10 * 60_000);
    modified = new Date(NOW + 10 * 60_000).toUTCString();
    image = await sharp(image).tint({ r: 180, g: 80, b: 30 }).png().toBuffer();
    await run();
    expect(JSON.parse(storage.history).camera).toHaveLength(2);
  });

  it("expires a frozen image even when its CDN timestamp keeps advancing", async () => {
    await run();
    vi.spyOn(Date, "now").mockReturnValue(NOW + 7 * 60 * 60_000);
    modified = new Date(NOW + 7 * 60 * 60_000).toUTCString();
    await run();
    expect(payload.cameras).toHaveLength(0);
  });

  it("decodes a one-channel infrared image as RGB and keeps it out of calibration", async () => {
    image = await sharp(image).toColourspace("b-w").png().toBuffer();
    await run();
    expect(payload.cameras[0].verdict).toBe("no-colour");
    expect(payload.cameras[0].score).toBeNull();
    expect(payload.cameras[0].baselineSamples).toBe(0);
  });

  it("counts one hourly sensor observation once across multiple frames and cameras", async () => {
    const observation = { m: { meanLuminance: 0.5, contrast: 0.2, darkChannel: 0.15, saturation: 0.3 }, scorerVersion: 2, pm25: 60, pmPairKey: "Station:2026-10-02T05:00:00Z" };
    storage.history = JSON.stringify({
      camera: Array.from({ length: 12 }, (_, i) => ({ ...observation, t: NOW - (i + 1) * 60_000, score: i / 12 })),
      other: [{ ...observation, t: NOW, score: 0.5 }],
    });
    await run();
    expect(payload.agreement.pairs).toBe(1);
    expect(payload.agreement.eventReadings).toBe(1);
    expect(payload.agreement.spansHazeEvent).toBe(false);
    expect(payload.agreement.r).toBeNull();
  });

  it("preserves a varied event while averaging camera scores for each ground reading", async () => {
    const readings = [10, 10, 10, 10, 10, 50, 70, 90];
    const entries = readings.map((pm25, i) => ({ t: NOW - (i + 1) * 60_000, m: { meanLuminance: 0.5, contrast: 0.2, darkChannel: 0.15, saturation: 0.3 }, scorerVersion: 2, score: pm25 / 100, pm25, pmPairKey: `Station:${i}` }));
    storage.history = JSON.stringify({ camera: entries, other: entries.map((e) => ({ ...e, score: e.score / 2 })) });
    await run();
    expect(payload.agreement.pairs).toBe(8);
    expect(payload.agreement.eventReadings).toBe(3);
    expect(payload.agreement.spansHazeEvent).toBe(true);
    expect(payload.agreement.r).toBe(1);
  });

  it("prunes offline cameras before calculating agreement", async () => {
    storage.history = JSON.stringify({ offline: [{ t: NOW - 31 * 86_400_000, m: { meanLuminance: 0.5, contrast: 0.2, darkChannel: 0.15, saturation: 0.3 }, scorerVersion: 2, score: 0.8, pm25: 80, pmPairKey: "old" }] });
    await run();
    expect(JSON.parse(storage.history).offline).toHaveLength(0);
    expect(payload.agreement.pairs).toBe(0);
  });

  it("does not pair an old frame with a newer PM2.5 reading", async () => {
    modified = new Date(NOW - 4 * 60 * 60_000).toUTCString();
    sensors = [sensor("2026-10-02 06:00:00")];
    await run();
    expect(payload.cameras[0].nearestPm25).toBeNull();
  });

  it("excludes future sensor readings even when they are within the pairing window", async () => {
    sensors = [sensor("2026-10-02 07:00:00")];
    await run();
    expect(payload.cameras[0].nearestPm25).toBeNull();
  });

  it("pairs an hourly ground reading with a frame taken near the same time", async () => {
    sensors = [sensor("2026-10-02 05:00:00")];
    await run();
    expect(payload.cameras[0].nearestPm25?.pm25).toBe(12);
  });

  it("excludes the existing DustBoy suspect readings from camera validation", async () => {
    sensors = [sensor("2026-10-02 06:00:00", 649, "Fault"), ...Array.from({ length: 10 }, (_, i) => sensor("2026-10-02 06:00:00", 12, `Peer ${i}`))];
    await run();
    expect(payload.cameras[0].nearestPm25?.pm25).toBe(12);
  });

  it("does not mix historical scores from the old method into new agreement", async () => {
    storage.history = JSON.stringify({ camera: Array.from({ length: 12 }, (_, i) => ({ t: NOW - (i + 1) * 60_000, m: { meanLuminance: 0.5, contrast: 0.2, darkChannel: 0.15, saturation: 0.3 }, score: i / 12, pm25: 10 + i })) });
    await run();
    expect(payload.agreement.pairs).toBe(0);
  });
});
