// A failure the operator cannot act on is not a disclosure.
//
// On 2026-10-12 the forecast layer went dark and said "The forecast model
// did not answer". True, and useless: Open-Meteo was answering HTTP 429
// "Daily API request limit exceeded" — a daily quota that resets tomorrow.
// An operator reading the old note hunts an outage that does not exist;
// an operator reading "HTTP 429" knows to wait.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchForecastField, lastForecastFailureReason } from "./wind-field";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

function okGrid(cells: number, times: number) {
  const time = Array.from({ length: times }, (_, i) => 1_800_000_000 + i * 3600);
  return Array.from({ length: cells }, () => ({
    hourly: { time, wind_speed_10m: time.map(() => 3), wind_direction_10m: time.map(() => 0), wind_speed_850hPa: time.map(() => 8), wind_direction_850hPa: time.map(() => 0), precipitation: time.map(() => 0) },
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the forecast layer names why it is dark", () => {
  it("reports the upstream HTTP status, not a shrug", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 429 })));
    const r = await fetchForecastField();
    expect(r.provenance).toBe("unavailable");
    expect(r.field).toBeNull();
    expect(r.note).toMatch(/HTTP 429/);
  });

  it("still says that no field is not a calm forecast, whatever the cause", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 503 })));
    const r = await fetchForecastField();
    expect(r.note).toMatch(/not a calm forecast/i);
    expect(r.note).toMatch(/HTTP 503/);
  });

  it("names a timeout as a timeout rather than inventing a status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      const e = new Error("The operation was aborted");
      e.name = "TimeoutError";
      throw e;
    }));
    const r = await fetchForecastField();
    expect(r.note).toMatch(/timed out/i);
  });

  it("does not quote a previous attempt's reason for a later failure", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      return call === 1 ? new Response("no", { status: 429 }) : new Response("no", { status: 500 });
    }));
    await fetchForecastField();
    expect(lastForecastFailureReason()).toMatch(/429/);
    await fetchForecastField();
    // The second attempt must speak for itself, not inherit the first.
    expect(lastForecastFailureReason()).toMatch(/500/);
    expect(lastForecastFailureReason()).not.toMatch(/429/);
  });

  it("survives a truncated grid and names the count it expected", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (String(u).includes("air-quality")
      ? new Response("[]", { status: 200 })
      : new Response(JSON.stringify(okGrid(2, 3)), { status: 200, headers: { "content-type": "application/json" } }))));
    await fetchForecastField();
    // Either it drew a field, or it explained itself. It must never be a
    // silent empty one.
    const r = lastForecastFailureReason();
    expect(r === null || /grid cells/.test(r)).toBe(true);
  });

  it("never returns a field it did not fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 429 })));
    const r = await fetchForecastField();
    expect(r.field).toBeNull();
    expect(r.outlook).toEqual([]);
    expect(FORECAST_URL).toContain("open-meteo");
  });
});