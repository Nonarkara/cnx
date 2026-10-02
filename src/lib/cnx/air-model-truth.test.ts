import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const NOW = Date.parse("2026-10-02T06:30:00Z");
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function feed(pm: (number | null)[], aod: (number | null)[] = [0.1, 0.2, 0.9]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("air4thai") ? { stations: [] } : { hourly: { time: [NOW / 1000 - 5400, NOW / 1000 - 1800, NOW / 1000 + 1800], pm2_5: pm, aerosol_optical_depth: aod } }), { status: 200 })));
}
describe("current model conditions", () => {
  it("uses the current hour and one actual CAMS grid point", async () => {
    feed([10, 20, 900]);
    const data = await (await import("./air-quality")).fetchCnxAirQuality();
    expect(data.stations).toHaveLength(1);
    expect(data.provinceAvgPm25).toBe(20);
    expect(data.stations[0].observedAt).toBe("2026-10-02T06:00:00.000Z");
    expect(data.stations[0].name).toMatch(/model grid/);
  });
  it("does not invent a reading for missing PM2.5", async () => {
    feed([10, null, 900]);
    const data = await (await import("./air-quality")).fetchCnxAirQuality();
    expect(data.stations).toEqual([]);
    expect(data.provinceAvgPm25).toBeUndefined();
  });
  it("uses current model AOD, keeping genuine zero values", async () => {
    feed([], [0.1, 0, 0.9]);
    const data = await (await import("./aerosol")).fetchCnxAerosol();
    expect(data).toMatchObject({ aod550: 0, aodMin: 0, aodMax: 0, provenance: "model" });
  });
  it("reports unavailable AOD when every model request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const data = await (await import("./aerosol")).fetchCnxAerosol();
    expect(data).toMatchObject({ aod550: null, aodMin: null, aodMax: null, level: null, provenance: "unavailable" });
  });
  it("rejects blank and future PCD values instead of treating them as zero or fresh", async () => {
    const { parseAir4Thai } = await import("./air-quality");
    const station = { lat: "18.8", long: "99", areaTH: "เชียงใหม่", AQILast: { date: "2026-10-02", time: "14:00", PM25: { value: "20" } } };
    expect(parseAir4Thai({ stations: [station] }, NOW)).toEqual([]);
    expect(parseAir4Thai({ stations: [{ ...station, AQILast: { date: "2026-10-02", time: "13:00", PM25: { value: "" } } }] }, NOW)).toEqual([]);
  });
});
