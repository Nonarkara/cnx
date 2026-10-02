import { describe, expect, it } from "vitest";
import { discoverRoutes, checkRiverPayload, checkPublishedHead } from "../../../scripts/deploy-checks.mjs";

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
  it("includes previously omitted routes and required-query probes", () => {
    const routes = discoverRoutes();
    for (const [route, status] of [["aeronet", 200], ["ask", 400], ["aircraft", 400], ["river-level/ingest", 405]] as const) {
      expect(routes.find((r) => r.route === route)?.status).toBe(status);
    }
    expect(new Set(routes.map((r) => r.route)).size).toBe(routes.length);
  });
  it("does not accept unavailable data or partially unstamped gauges as a live river expectation", () => {
    expect(checkRiverPayload({ provenance: "unavailable", gauges: [], catalogueCount: null }).length).toBeGreaterThan(0);
    expect(checkRiverPayload({ provenance: "live", gaugeCount: 2, gauges: [{ observedAt: "2026-10-02T00:00:00Z" }, { observedAt: null }], catalogueCount: 128 })).toContain("a gauge has no valid observation time");
    expect(checkRiverPayload({ provenance: "live", gaugeCount: 1, gauges: [{ observedAt: "2026-10-02T00:00:00Z" }], catalogueCount: 128 })).toEqual([]);
    expect(checkRiverPayload({ provenance: "live", gaugeCount: 1, gauges: [{ observedAt: new Date(Date.now() + 6 * 60_000).toISOString() }], catalogueCount: 128 })).toContain("a gauge observation time is in the future");
  });
});
