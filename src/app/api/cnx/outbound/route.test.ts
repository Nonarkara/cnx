import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchResult, FlightState } from "../../../../lib/cnx/opensky";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), append: vi.fn(), get: vi.fn(), put: vi.fn() }));
vi.mock("../../../../lib/cnx/opensky", () => ({ fetchCnxSnapshot: mocks.fetch }));
vi.mock("../../../../lib/cnx/snapshot-store", () => ({ appendSnapshot: mocks.append }));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { CNX_FLIGHTS_KV: { get: mocks.get, put: mocks.put } } }),
}));
import { GET } from "./route";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const aircraft: FlightState = {
  icao24: "abc123", callsign: "TEST", originCountry: "Thailand", timePosition: NOW, lastContact: NOW,
  longitude: 98.9, latitude: 18.8, baroAltitude: 3000, geoAltitude: 3000, onGround: false,
  velocity: 100, trueTrack: 180, verticalRate: 0, positionSource: 1,
};
const snapshot = (overrides: Partial<FetchResult> = {}): FetchResult => ({
  fetchedAt: NOW, observedAt: NOW, airborne: [aircraft], ground: [], degraded: false, ...overrides,
});

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  mocks.get.mockResolvedValue(null);
  mocks.put.mockResolvedValue(undefined);
  mocks.append.mockResolvedValue(undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); });

describe("outbound evidence and archive", () => {
  it("does not record a failed fetch as a zero-aircraft observation", async () => {
    mocks.fetch.mockResolvedValue(snapshot({ degraded: true, airborne: [] }));
    const body = await (await GET()).json();
    expect(body).toMatchObject({ provenance: "unavailable", degraded: true, observedAt: null, totalAirborne: 0 });
    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it.each([NOW - 600_001, NOW + 300_001, NaN])("withholds unusable observations (%s) from counts and history", async (observedAt) => {
    mocks.fetch.mockResolvedValue(snapshot({ observedAt }));
    const body = await (await GET()).json();
    expect(body).toMatchObject({ provenance: "unavailable", degraded: true, totalAirborne: 0, byQuadrant: [] });
    expect(body.observedAt).toBe(Number.isFinite(observedAt) ? observedAt : null);
    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("records a genuinely observed empty area as live zero", async () => {
    mocks.fetch.mockResolvedValue(snapshot({ airborne: [] }));
    const body = await (await GET()).json();
    expect(body).toMatchObject({ provenance: "live", degraded: false, observedAt: NOW, totalAirborne: 0 });
    expect(mocks.append).toHaveBeenCalledWith(expect.objectContaining({ airborne: 0, ts: NOW }));
  });

  it("returns current aircraft evidence without rewriting an already recorded minute", async () => {
    mocks.fetch.mockResolvedValue(snapshot());
    mocks.get.mockResolvedValue(String(NOW - 10_000));
    const body = await (await GET()).json();
    expect(body).toMatchObject({ provenance: "live", degraded: false, observedAt: NOW, totalAirborne: 1 });
    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
