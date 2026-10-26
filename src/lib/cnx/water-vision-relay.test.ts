import { afterEach, beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import { WATER_CAMERAS } from "./water-vision-core";
import { isWaterVisionPayload } from "./water-vision";
const disk = vi.hoisted(() => ({ value: "{}" }));
vi.mock("node:fs", async original => ({ ...await original<typeof import("node:fs")>(), readFileSync: vi.fn(() => disk.value), mkdirSync: vi.fn(), writeFileSync: vi.fn((_p: string, text: string) => { disk.value = text; }), renameSync: vi.fn() }));
let relay: typeof import("../../../scripts/water-vision.mjs");
let frame: Buffer;
let takenAt: string | null;
let fetcher: ReturnType<typeof vi.fn>;
const NOW = Date.parse("2026-10-20T14:00:00Z");
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); disk.value = "{}";
  relay = await import("../../../scripts/water-vision.mjs");
  frame = await sharp({ create: { width: 40, height: 40, channels: 3, background: "black" } }).png().toBuffer();
  takenAt = new Date(NOW - 10 * 60_000).toISOString();
  fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? Response.json({ ok: true }) : new Response(new Uint8Array(frame), { headers: { "content-type": "image/png", ...(takenAt ? { "x-taken-at": takenAt } : {}) } }));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const run = () => relay.runWaterVision({ baseUrl: "https://cnx.test", secret: "test-secret" });
const pushed = () => JSON.parse(fetcher.mock.calls.find(call => call[1]?.method === "POST")![1].body);

it("ages every image at the final batch clock when serial collection crosses the stale boundary", async () => {
  takenAt = new Date(NOW - 45 * 60_000 + 1000).toISOString();
  let captures = 0;
  fetcher.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") return Response.json({ ok: true });
    if (++captures === 2) vi.setSystemTime(NOW + 2000);
    return new Response(new Uint8Array(frame), { headers: { "content-type": "image/png", "x-taken-at": takenAt! } });
  });
  await run();
  expect(pushed().cameras[0].status).toBe("stale");
  expect(isWaterVisionPayload(pushed())).toBe(true);
});

it("captures exactly three pinned DWR views, retains credit and separates known capture from collection", async () => {
  await run();
  const body = pushed();
  expect(body.cameras).toHaveLength(3);
  expect(body.cameras[0]).toMatchObject({ ...WATER_CAMERAS[0], observedAt: takenAt, collectedAt: new Date(NOW).toISOString(), status: "low-light", frameChanged: null });
  for (const [url, init] of fetcher.mock.calls.filter(call => call[1]?.method !== "POST")) {
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:8340\/api\/cctv\/dwr\?id=/);
    expect(init.redirect).toBe("error");
  }
  expect(fetcher.mock.calls.find(call => call[1]?.method === "POST")![1]).toMatchObject({ redirect: "error", headers: { "X-Relay-Secret": "test-secret" } });
  await run(); expect(fetcher).toHaveBeenCalledTimes(4);
});
it("never promotes collection time or a future source header to capture time", async () => {
  for (const header of [null, "invalid", new Date(NOW + 6 * 60_000).toISOString()]) {
    vi.resetModules(); relay = await import("../../../scripts/water-vision.mjs"); takenAt = header; fetcher.mockClear(); disk.value = "{}";
    await run(); expect(pushed().cameras[0]).toMatchObject({ observedAt: null, status: "capture-time-unknown" });
  }
});
it("persists rejected nighttime fingerprints across restarts and prevents a refreshed clock from refreshing frozen pixels", async () => {
  await run();
  vi.setSystemTime(NOW + 60 * 60_000); takenAt = new Date(NOW + 60 * 60_000).toISOString();
  vi.resetModules(); relay = await import("../../../scripts/water-vision.mjs"); fetcher.mockClear();
  await run();
  expect(pushed().cameras[0]).toMatchObject({ observedAt: new Date(NOW - 10 * 60_000).toISOString(), status: "stale", frameChanged: false });
});
it("rejects an oversized response without buffering it and reports unavailable rather than safe", async () => {
  const cancel = vi.fn();
  fetcher.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === "POST" ? Response.json({ ok: true }) : new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1)); }, cancel }), { headers: { "content-type": "image/jpeg", "content-length": "12582913" } }));
  await run(); expect(pushed().cameras.every((c: { status: string; observedAt: unknown }) => c.status === "unavailable" && c.observedAt === null)).toBe(true); expect(cancel).toHaveBeenCalledTimes(3);
});
it("caps chunked bodies even without a trustworthy Content-Length", async () => {
  const cancel = vi.fn();
  fetcher.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === "POST" ? Response.json({ ok: true }) : new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(12 * 1024 * 1024)); c.enqueue(new Uint8Array(1)); }, cancel }), { headers: { "content-type": "image/jpeg" } }));
  await run(); expect(pushed().cameras[0].status).toBe("unavailable"); expect(cancel).toHaveBeenCalledTimes(3);
});
it("does not refresh a fixed scene when only the source clock band changes", async () => {
  await run();
  const pixels = Buffer.alloc(40 * 40 * 3);
  pixels.fill(255, 0, 40 * 7 * 3);
  frame = await sharp(pixels, { raw: { width: 40, height: 40, channels: 3 } }).png().toBuffer();
  vi.setSystemTime(NOW + 60 * 60_000); takenAt = new Date(NOW + 60 * 60_000).toISOString(); fetcher.mockClear();
  await run(); expect(pushed().cameras[0]).toMatchObject({ status: "stale", frameChanged: false, observedAt: new Date(NOW - 10 * 60_000).toISOString() });
});
it("keeps an initially unknown capture clock unknown for identical pixels", async () => {
  takenAt = null; await run();
  vi.setSystemTime(NOW + 15 * 60_000); takenAt = new Date(NOW + 15 * 60_000).toISOString(); fetcher.mockClear();
  await run(); expect(pushed().cameras[0]).toMatchObject({ observedAt: null, status: "capture-time-unknown", frameChanged: false });
});
it.each([
  { mode: "timeout", reason: "Source image timed out after 15 seconds." },
  { mode: "network", reason: "Source image request failed (ECONNRESET)." },
  { mode: "redacted", reason: "Source image request failed." },
  { mode: "http", reason: "Source image returned HTTP 503." },
  { mode: "decode", reason: "Source image could not be decoded within pixel limits." },
])("reports bounded $mode diagnostics without exposing raw errors or claiming a water finding", async ({ mode, reason }) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  fetcher.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") return Response.json({ ok: true });
    if (mode === "timeout") throw new DOMException("https://private.invalid/test-secret", "TimeoutError");
    if (mode === "network" || mode === "redacted") throw new TypeError("https://private.invalid/test-secret", { cause: { code: mode === "network" ? "ECONNRESET" : "test-secret" } });
    if (mode === "http") return new Response("private body", { status: 503 });
    return new Response("not a decoded image", { headers: { "content-type": "image/jpeg" } });
  });
  await run();
  const camera = pushed().cameras[0];
  expect(camera).toMatchObject({ status: "unavailable", observedAt: null, metrics: null, note: `${reason} No water assessment is available.` });
  expect(warn).toHaveBeenCalledWith(`[water] ${WATER_CAMERAS[0].cameraId}: ${reason}`);
  expect(warn.mock.calls.flat().join(" ")).not.toMatch(/test-secret|private\.invalid|private body/);
  expect(isWaterVisionPayload(pushed())).toBe(true);
});
it("contains failed secret-bearing pushes so the existing relay keeps running", async () => {
  fetcher.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") throw new Error("redirect rejected");
    return new Response(new Uint8Array(frame), { headers: { "content-type": "image/png", "x-taken-at": takenAt! } });
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await expect(run()).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalled();
  expect(warn.mock.calls.flat().join(" ")).not.toContain("test-secret");
});
