import { afterEach, expect, it, vi } from "vitest";
const aerosol = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./aerosol", () => ({ fetchCnxAerosol: aerosol.fetch }));
vi.mock("./twin-manifest", async original => {
  const actual = await original<typeof import("./twin-manifest")>();
  return { ...actual, TWIN_ENTITIES: actual.TWIN_ENTITIES.filter(entity => entity.id === "cams-aod") };
});
import { probeAll } from "./twin-manifest-live";
afterEach(() => aerosol.fetch.mockReset());
it("ages CAMS by model observation instead of the fresh response timestamp", async () => {
  aerosol.fetch.mockResolvedValue({ provenance: "model", generatedAt: "2026-10-20T14:00:00Z", observedAt: "2026-10-19T08:00:00Z" });
  expect((await probeAll())["cams-aod"]).toEqual({ provenance: "model", lastObservedAt: "2026-10-19T08:00:00.000Z" });
});
it.each([null, undefined, "invalid"])("keeps a missing CAMS observation clock unknown (%s)", async observedAt => {
  aerosol.fetch.mockResolvedValue({ provenance: "model", generatedAt: "2026-10-20T14:00:00Z", observedAt });
  expect((await probeAll())["cams-aod"].lastObservedAt).toBeNull();
});
