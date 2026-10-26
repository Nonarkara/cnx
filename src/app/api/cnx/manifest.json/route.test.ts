import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/cnx/twin-manifest-live", () => ({
  probeAll: vi.fn(async () => ({ dustboy: { lastObservedAt: new Date(Date.now() - 60_000).toISOString(), provenance: "live" } })),
}));

import { GET } from "./route";
import type { TwinManifest } from "../../../../lib/cnx/twin-manifest";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cnx/manifest.json", () => {
  it("serves the registry with live fields, version and commit, cached 120 s at the edge", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.9.0");
    vi.stubEnv("NEXT_PUBLIC_GIT_SHA", "35a611a");
    const res = await GET(new Request("https://cnx.nonarkara.org/api/cnx/manifest.json"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const body = (await res.json()) as TwinManifest;
    expect(body).toMatchObject({ schema: "cnx-twin-manifest/1", version: "1.9.0", commit: "35a611a" });
    expect(Number.isFinite(Date.parse(body.generatedAt))).toBe(true);
    expect(body.entities.find((e) => e.id === "dustboy")).toMatchObject({ provenance: "live", withinSlo: true, sloState: "within" });
    expect(body.entities.find((e) => e.id === "aeronet")).toMatchObject({ lastObservedAt: null, withinSlo: false, sloState: "missing" });
    expect(body.relay.offline).toBe(true);
  });
});
