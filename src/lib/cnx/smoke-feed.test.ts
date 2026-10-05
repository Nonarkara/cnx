import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWind } from "./smoke-feed";
afterEach(() => vi.unstubAllGlobals());
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
