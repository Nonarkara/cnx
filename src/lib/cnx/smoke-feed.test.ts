import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSmokeTrajectory, fetchWind } from "./smoke-feed";
import { trajectoryWind } from "./wind-field";
vi.mock("./fires", () => ({ fetchFirmsInBbox: vi.fn(async () => [{ id: "detection", latitude: 18.788, longitude: 98.985 }]) }));
vi.mock("./wind-field", () => ({ trajectoryWind: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("preserves unavailable six-hour coverage even when FIRMS answered live", async () => {
  const now = Date.parse("2026-10-19T14:00:00Z");
  vi.spyOn(Date, "now").mockReturnValue(now);
  const frames = [[1, 1, 1, 1], [1, 1, 1, 1]];
  vi.mocked(trajectoryWind).mockResolvedValue([{ grid: { lon0: 98, lat0: 18, d: 2, nx: 2, ny: 2 },
    times: [now / 1000, now / 1000 + 3600], u10: frames, v10: frames, u850: frames, v850: frames }]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ current: { wind_speed_10m: 10, wind_direction_10m: 270 } }))));
  const result = await fetchSmokeTrajectory();
  expect(result).toMatchObject({ provenance: "unavailable", hotspotSource: "firms", omittedTrajectories: 1, segments: [], summary: { total: 1, shown: 0 } });
  expect(result.note).toMatch(/unknown/i);
});
describe("smoke transport wind units", () => {
  it("keeps 10 km/h at 10 km/h rather than inflating plume travel 3.6 times", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ current: { wind_speed_10m: 10, wind_direction_10m: 270 } })));
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchWind()).toEqual({ speedKmh: 10, fromDirectionDeg: 270 });
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("wind_speed_unit")).toBe("kmh");
  });
  it("does not advect plumes using an invalid wind", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ current: { wind_speed_10m: -10, wind_direction_10m: 270 } }))));
    expect(await fetchWind()).toBeNull();
  });
});
