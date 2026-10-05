import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCnxRain, isRainPayload } from "./rain";
import { readRelayJson } from "./relay-kv";

vi.mock("./relay-kv", async importOriginal => ({ ...await importOriginal<typeof import("./relay-kv")>(), readRelayJson: vi.fn() }));
const now = Date.parse("2026-10-05T06:00:00Z");
const row = { id: "one", rain24h: 94.5, at: "2026-10-05 12:00", station: "test", amphoeTh: "จอมทอง", amphoeEn: "Chom Thong", tambonTh: "test", lat: 18.375, lon: 98.534, agency: "DWR" };
const payload = { generatedAt: new Date(now).toISOString(), rows: [row] };
beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(now); vi.mocked(readRelayJson).mockReset(); });
afterEach(() => vi.restoreAllMocks());

describe("rain input and unavailable states", () => {
  it("accepts measured rows and rejects invalid coordinates or calendar dates", () => {
    expect(isRainPayload(payload)).toBe(true);
    expect(isRainPayload({ ...payload, rows: [{ ...row, lat: 181 }] })).toBe(false);
    expect(isRainPayload({ ...payload, rows: [{ ...row, at: "2026-02-30 12:00" }] })).toBe(false);
    expect(isRainPayload({ ...payload, rows: [{ ...row, rain24h: -1 }] })).toBe(false);
  });
  it("retains collection and observation times separately", async () => {
    vi.mocked(readRelayJson).mockResolvedValue(payload);
    expect(await fetchCnxRain()).toMatchObject({ provenance: "live", collectedAt: payload.generatedAt, wettest: { observedAt: "2026-10-05T05:00:00.000Z" } });
  });
  it("does not present a successful relay with stale gauges as live zero rain", async () => {
    const stale = { ...payload, rows: [{ ...row, at: "2026-10-04 12:00" }] };
    vi.mocked(readRelayJson).mockResolvedValue(stale);
    expect(await fetchCnxRain()).toMatchObject({ provenance: "unavailable", wettest: null, stations: [] });
  });
  it("distinguishes genuinely measured dry weather from a missing feed", async () => {
    const dry = { ...payload, rows: [{ ...row, rain24h: 0 }] };
    vi.mocked(readRelayJson).mockResolvedValue(dry);
    expect(await fetchCnxRain()).toMatchObject({ provenance: "live", wettest: { rain24h: 0 } });
    vi.mocked(readRelayJson).mockResolvedValue(null);
    expect(await fetchCnxRain()).toMatchObject({ provenance: "unavailable", wettest: null });
  });
});
