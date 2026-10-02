import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("RFD failure provenance", () => {
  it("distinguishes a successful empty detection window from failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ hotspot: [] })));
    const { fetchCnxRfdFires } = await import("./fire-rfd");
    expect(await fetchCnxRfdFires()).toMatchObject({ provenance: "live", totalCount: 0 });
  });
  it.each(["http", "malformed", "network"])("does not claim no fires when the feed fails (%s)", async (failure) => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (failure === "network") throw new Error("offline");
      return failure === "http" ? new Response("busy", { status: 503 }) : Response.json({ error: "source unavailable" });
    }));
    const { fetchCnxRfdFires } = await import("./fire-rfd");
    const data = await fetchCnxRfdFires();
    expect(data.provenance).toBe("unavailable");
    expect(data.note).toContain("not evidence of no fires");
  });
});
