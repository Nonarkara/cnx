import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./flood", () => ({ fetchCnxFlood: async () => ({ provenance: "scenario", gauges: [], reservoirs: [], rainfall: [] }) }));
vi.mock("./air-quality", () => ({ fetchCnxAirQuality: async () => ({ provinceAvgPm25: 20 }) }));
vi.mock("./fires", () => ({ fetchCnxFires: async () => ({ provenance: "scenario" }) }));
vi.mock("./dustboy", () => ({ fetchCnxDustboy: async () => ({ provenance: "unavailable" }) }));
const smoke = vi.hoisted(() => ({ value: { provenance: "unavailable" } as Record<string, unknown> }));
vi.mock("./smoke-feed", () => ({ fetchSmokeTrajectory: async () => smoke.value }));
vi.mock("./river-level", () => ({ fetchRiverLevel: async () => ({ provenance: "unavailable" }), isPingMainstem: () => true }));
const NOW = Date.parse("2026-10-02T06:30:00Z");
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(NOW); smoke.value = { provenance: "unavailable" }; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("twin forecast joins", () => {
  it("passes the actual transport method into the situation summary", async () => {
    smoke.value = { provenance: "live", method: "forecast-field", summary: { nearCnx: 1, hitsCnx: 3, origin_th: "ตะวันออกของเชียงใหม่", origin_en: "east of Chiang Mai" } };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ current: { wind_speed_10m: 10 }, hourly: { time: [], precipitation: [], pm2_5: [] } })));
    const { fetchCnxTwin } = await import("./twin");
    const reason = (await fetchCnxTwin()).verdict.reasons.find(reason => reason.evidence === "near=1 hits=3");
    expect(reason?.en).toContain("850 hPa hourly wind model");
    expect(reason?.en).toContain("0–6 h");
    expect(reason?.en).not.toContain("Straight-line");
  });
  it("keeps km/h units and computes the next24hour interval without an extra PM request", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("current=wind_speed")) return Response.json({ current: { wind_speed_10m: 10 } });
      const time = Array.from({ length: 48 }, (_, i) => NOW / 1000 - 1800 + i * 3600);
      if (url.includes("hourly=precipitation")) return Response.json({ hourly: { time, precipitation: time.map((_, i) => i <= 24 ? 1 : 100) } });
      return Response.json({ hourly: { time, pm2_5: time.map((_, i) => i <= 24 ? 20 : 200) } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchCnxTwin } = await import("./twin");
    const data = await fetchCnxTwin();
    expect(data.deltas.air.wind_kmh).toBe(10);
    expect(data.deltas.air.rain_fc_24h_mm).toBe(24);
    expect(data.deltas.air.pm25_fc_24h).toBe(20);
    expect(data.deltas.air.washout_expected_pct).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([url]) => !url.includes("pm2_5,precipitation"))).toBe(true);
  });
});
