import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Module-level caches mean each test needs a fresh module instance.
async function freshModule() {
  vi.resetModules();
  return import("./cctv");
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

const LONGDO_URL = "camera.longdo.com";

describe("fetchCnxCctv", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("serves Windy + in-area Longdo cameras, never scenario filler", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes(LONGDO_URL)) {
          return jsonResponse({
            cameras: [
              // In operational bbox (Lamphun corridor).
              { camid: "DOH-PER-12-002", title: "1147", latitude: 18.5863, longitude: 99.08, imgurl: "http://x/i.jpg", hls_url: "http://x/h.m3u8" },
              // Tak — outside the operational bbox, must be excluded.
              { camid: "DOH-PER-7-026", title: "Tak", latitude: 17.112, longitude: 99.0863, imgurl: "http://x/i.jpg", hls_url: "http://x/h.m3u8" },
            ],
          });
        }
        // Windy snapshot probes — all reachable.
        return new Response("fake-jpeg-bytes", { status: 200 });
      }),
    );
    const { fetchCnxCctv } = await freshModule();
    const feed = await fetchCnxCctv();

    const ids = feed.slots.map((s) => s.id);
    // No fake scenario slots.
    expect(ids.some((id) => id.startsWith("cnx-c"))).toBe(false);
    // All nine Windy cameras present with player + refresh cadence.
    const windy = feed.slots.filter((s) => s.source === "windy");
    expect(windy).toHaveLength(9);
    for (const w of windy) {
      expect(w.playerUrl).toContain("webcams.windy.com");
      expect(w.snapshotRefreshSec).toBeGreaterThan(0);
      expect(w.posterUrl).toContain("imgproxy.windy.com");
    }
    // In-area Longdo kept, Tak excluded.
    expect(ids).toContain("longdo-DOH-PER-12-002");
    expect(ids).not.toContain("longdo-DOH-PER-7-026");
    expect(feed.reachableCount).toBe(feed.totalCount);
  });

  it("marks unreachable Windy cameras honestly instead of green", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes(LONGDO_URL)) return jsonResponse({ cameras: [] });
        return new Response(null, { status: 404 });
      }),
    );
    const { fetchCnxCctv } = await freshModule();
    const feed = await fetchCnxCctv();
    const windy = feed.slots.filter((s) => s.source === "windy");
    expect(windy).toHaveLength(9);
    expect(windy.every((w) => w.reachable === false)).toBe(true);
    expect(feed.reachableCount).toBe(0);
  });
});
