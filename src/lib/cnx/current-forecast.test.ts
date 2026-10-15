import { describe, expect, it } from "vitest";
import { buildOutlook, currentForecast, outlookWatchItems } from "./outlook";
import type { ForecastFieldResponse } from "./wind-field";
const NOW = Date.parse("2026-10-15T12:30:00Z");
function feed(): ForecastFieldResponse {
  const hour = Math.floor(NOW / 3_600_000) * 3600;
  const times = Array.from({ length: 49 }, (_, i) => hour + i * 3600);
  const frames = (n: number) => times.map(() => [n, n, n, n]);
  const precip = frames(0), pm25 = frames(5);
  precip[0] = [100, 100, 100, 100]; pm25[0] = [200, 200, 200, 200];
  return { generatedAt: new Date(NOW).toISOString(), fetchedAt: new Date(NOW).toISOString(), provenance: "model", source: "test", note: "", outlook: [], field: { grid: { lon0: 97, lat0: 17, d: 4, nx: 2, ny: 2 }, times, precip, pm25, u10: frames(1), v10: frames(0), u850: frames(1), v850: frames(0) } };
}
describe("retained forecast decision evidence", () => {
  it("recomputes future totals and peaks rather than retaining a past storm", () => {
    const value = currentForecast(feed(), NOW)!;
    expect(value.outlook.length).toBeGreaterThan(0);
    expect(value.outlook.every(d => d.rain24h === 0 && d.pm25Peak === 5 && d.pm25PeakAt! > NOW / 1000)).toBe(true);
  });
  it("expires an old response and an exhausted forecast horizon", () => {
    expect(currentForecast(feed(), NOW + 7 * 3_600_000)?.provenance).toBe("unavailable");
    const f = feed(); f.field!.times = f.field!.times.map(t => t - 3 * 86400);
    expect(currentForecast(f, NOW)?.field).toBeNull();
  });
  it("does not turn missing cells or a short first-day horizon into dry weather", () => {
    const f = feed(); f.field!.precip[1] = [null, null, null, null];
    expect(currentForecast(f, NOW)?.provenance).toBe("unavailable");
    const short = feed(); short.field!.times = short.field!.times.slice(0, 12);
    expect(currentForecast(short, NOW)?.provenance).toBe("unavailable");
  });
  it("does not describe an all-missing PM2.5 grid as clean air", () => {
    const f = feed(); f.field!.pm25 = f.field!.times.map(() => [null, null, null, null]);
    const outlook = buildOutlook(currentForecast(f, NOW), [], null);
    expect(outlookWatchItems(outlook)[1].level).toBe("unknown");
  });
  it("does not certify clean air from one low hour amid missing future samples", () => {
    const f = feed(); f.field!.pm25![2] = [null, null, null, null];
    const outlook = buildOutlook(currentForecast(f, NOW), [], null);
    expect(outlookWatchItems(outlook)[1].level).toBe("unknown");
    expect(outlookWatchItems(outlook)[0].level).toBe("good");
  });
});
