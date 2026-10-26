import { describe, expect, it } from "vitest";
import { discoverRoutes, checkRiverPayload, checkRainPayload, checkPublishedHead, checkBrowserCachePolicy } from "../../../scripts/deploy-checks.mjs";

describe("live feed browser cache contract", () => {
  it("rejects the observed four-hour cache policy as well as missing browser protection", () => {
    expect(checkBrowserCachePolicy("public, max-age=14400")).toContain("browser caching");
    expect(checkBrowserCachePolicy("s-maxage=600")).toContain("browser caching");
    expect(checkBrowserCachePolicy(null)).toContain("missing");
    expect(checkBrowserCachePolicy("private, no-store")).toBeNull();
  });
});

describe("published release identity", () => {
  it("accepts a HEAD recoverable from origin/main", () => {
    expect(checkPublishedHead("release", "release")).toBeNull();
  });
  it("rejects local-only commits even when the deployed badge matches", () => {
    expect(checkPublishedHead("release", "older")).toContain("differs from HEAD");
  });
  it("rejects a missing published branch", () => {
    expect(checkPublishedHead("release", "")).toContain("not recoverable");
  });
});

describe("release route inventory", () => {
  it("checks rainfall observations and collection rather than accepting 200 JSON alone", () => {
    const observedAt = new Date().toISOString();
    const good = { provenance: "live", collectedAt: observedAt, stations: [{ observedAt, rain24h: 102 }], wettest: { rain24h: 102 } };
    expect(checkRainPayload(good)).toEqual([]);
    expect(checkRainPayload({ ...good, collectedAt: "invalid" }).length).toBeGreaterThan(0);
    expect(checkRainPayload({ ...good, wettest: { rain24h: 0 } }).length).toBeGreaterThan(0);
    expect(checkRainPayload({ ...good, stations: [{ observedAt: new Date(Date.now() - 7 * 3_600_000).toISOString(), rain24h: 102 }] }).length).toBeGreaterThan(0);
  });
  it("includes previously omitted routes and required-query probes", () => {
    const routes = discoverRoutes();
    for (const [route, status] of [["aeronet", 200], ["ask", 400], ["burnscar", 400], ["river-level/ingest", 405]] as const) {
      expect(routes.find((r) => r.route === route)?.status).toBe(status);
    }
    expect(new Set(routes.map((r) => r.route)).size).toBe(routes.length);
  });
  it("does not accept unavailable data or partially unstamped gauges as a live river expectation", () => {
    expect(checkRiverPayload({ provenance: "unavailable", gauges: [], catalogueCount: null }).length).toBeGreaterThan(0);
    expect(checkRiverPayload({ provenance: "live", gaugeCount: 2, gauges: [{ observedAt: "2026-10-02T00:00:00Z" }, { observedAt: null }], catalogueCount: 128 })).toContain("a gauge has no valid observation time");
    expect(checkRiverPayload({ provenance: "live", gaugeCount: 1, gauges: [{ observedAt: new Date().toISOString() }], catalogueCount: 128 })).toEqual([]);
    expect(checkRiverPayload({ provenance: "live", gaugeCount: 1, gauges: [{ observedAt: new Date(Date.now() + 6 * 60_000).toISOString() }], catalogueCount: 128 })).toContain("a gauge observation time is in the future");
  });
  it("rejects freshly served river JSON when all observations are stale, but permits older stations alongside a current reading", () => {
    const old = { observedAt: new Date(Date.now() - 7 * 3_600_000).toISOString() };
    const base = { provenance: "live", gaugeCount: 1, gauges: [old], catalogueCount: 128, generatedAt: new Date().toISOString() };
    expect(checkRiverPayload(base)).toContain("river-level has no observation within its 45-minute freshness limit");
    expect(checkRiverPayload({ ...base, gaugeCount: 2, gauges: [old, { observedAt: new Date().toISOString() }] })).toEqual([]);
  });
});
