import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Module-level in-process caches mean each test needs a fresh module
// instance — otherwise an earlier test's cached (mocked) result leaks
// into a later one regardless of what its own fetch mock returns.
async function freshModule() {
  vi.resetModules();
  return import("./weather-layers");
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

describe("fetchWeatherLayerUrls", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T19:26:00Z"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("builds a rainRadar template from the latest RainViewer frame, leaves {z}/{x}/{y} intact", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("rainviewer.com/public")) {
          return jsonResponse({
            host: "https://tilecache.rainviewer.com",
            radar: { past: [{ time: 1000, path: "/v2/radar/old" }, { time: 2000, path: "/v2/radar/latest" }] },
          });
        }
        return new Response(null, { status: 404 }); // GIBS: no data in probe window
      }),
    );
    const { fetchWeatherLayerUrls } = await freshModule();
    const result = await fetchWeatherLayerUrls();
    expect(result.rainRadar).toBe("https://tilecache.rainviewer.com/v2/radar/latest/256/{z}/{x}/{y}/2/1_1.png");
    expect(result.himawari).toBeNull();
    expect(result.aerosol).toBeNull();
  });

  it("returns null for rainRadar when RainViewer is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    const { fetchWeatherLayerUrls } = await freshModule();
    expect((await fetchWeatherLayerUrls()).rainRadar).toBeNull();
  });

  it("resolves Himawari to the newest 10-minute bucket that actually has a tile", async () => {
    // "Now" is 19:26 UTC; only the 18:50 bucket (4 steps back) succeeds.
    const goodTime = "2026-09-18T18:50:00Z";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("rainviewer")) return new Response(null, { status: 503 });
        if (url.includes("Himawari") && url.includes(goodTime)) return new Response("png-bytes", { status: 200 });
        return new Response(null, { status: 404 });
      }),
    );
    const { fetchWeatherLayerUrls } = await freshModule();
    const result = await fetchWeatherLayerUrls();
    expect(result.himawari).toContain(goodTime);
    expect(result.himawari).toMatch(/\{z\}\/\{y\}\/\{x\}\.png$/);
  });

  it("resolves aerosol using whole-day granularity, not a timestamp", async () => {
    const goodDate = "2026-09-16";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("rainviewer")) return new Response(null, { status: 503 });
        if (url.includes("AOD") && url.includes(goodDate)) return new Response("png-bytes", { status: 200 });
        return new Response(null, { status: 404 });
      }),
    );
    const { fetchWeatherLayerUrls } = await freshModule();
    const result = await fetchWeatherLayerUrls();
    expect(result.aerosol).toContain(`/${goodDate}/`);
  });

  it("gives up after a bounded number of probes rather than searching forever", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("rainviewer")) return new Response(null, { status: 503 });
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchWeatherLayerUrls } = await freshModule();
    const result = await fetchWeatherLayerUrls();
    expect(result.himawari).toBeNull();
    expect(result.aerosol).toBeNull();
    // 1 rainviewer call + a bounded number of GIBS probes for each of
    // himawari (≤19) and aerosol (≤6) — not hundreds.
    expect(fetchMock.mock.calls.length).toBeLessThan(30);
  });
});
