import { afterEach, describe, expect, it, vi } from "vitest";

const AMBIENT_KEY = process.env.ASMC_API_KEY;
const AMBIENT_BASE = process.env.ASMC_BASE;

afterEach(() => {
  if (AMBIENT_KEY) process.env.ASMC_API_KEY = AMBIENT_KEY;
  else delete process.env.ASMC_API_KEY;
  if (AMBIENT_BASE) process.env.ASMC_BASE = AMBIENT_BASE;
  else delete process.env.ASMC_BASE;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubFetch(impl: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => impl(String(input))));
}

/** The module caches for 30 min, so each case needs a fresh module instance. */
async function freshFetch() {
  vi.resetModules();
  const mod = await import("./asmc");
  return mod.fetchCnxAsmc;
}

describe("ASMC fetchCnxAsmc", () => {
  it("reports needs-key and calls nothing when no key is configured", async () => {
    const calls: string[] = [];
    stubFetch((u) => {
      calls.push(u);
      return new Response("{}", { status: 200 });
    });
    const res = await (await freshFetch())();
    expect(res.provenance).toBe("needs-key");
    expect(res.assessment).toBe("unknown");
    expect(res.regions).toEqual([]);
    expect(res.note).toMatch(/no public API host is known/);
    expect(calls).toEqual([]);
  });

  it("makes no request when a key is set but no working host is named", async () => {
    // Regression: ASMC_BASE used to default to api.haze.asean.org, which is
    // NXDOMAIN, so every cycle burned two DNS failures for nothing.
    process.env.ASMC_API_KEY = "k";
    const calls: string[] = [];
    stubFetch((u) => {
      calls.push(u);
      return new Response("{}", { status: 200 });
    });
    const res = await (await freshFetch())();
    expect(res.provenance).toBe("needs-key");
    expect(res.note).toMatch(/ASMC_BASE is not/);
    expect(calls).toEqual([]);
  });

  it("normalises a live assessment and hotspot payload", async () => {
    process.env.ASMC_API_KEY = "k";
    process.env.ASMC_BASE = "https://example.invalid";
    stubFetch((u) => {
      if (u.endsWith("/api/v1/regional/haze-assessment")) {
        return Response.json({
          observed_at: "2026-09-29T06:00:00Z",
          assessment: "Unhealthy for sensitive groups",
          summary: "Regional hotspot activity elevated",
          hotspots: [
            { region: "MMR-N", name: "Shan State", count: 640, delta_7d: 120 },
            { region: "THA-N", name: "Northern Thailand", count: 12 },
          ],
        });
      }
      return new Response("not found", { status: 404 });
    });
    const res = await (await freshFetch())();
    expect(res.provenance).toBe("live");
    expect(res.assessment).toBe("unhealthy");
    expect(res.assessment_th).toMatch(/มีผลกระทบต่อสุขภาพ/);
    expect(res.observedAt).toBe("2026-09-29T06:00:00Z");
    expect(res.regions).toEqual([
      { region: "MMR-N", name: "Shan State", hotspots24h: 640, severity: "critical", deltaVs7d: 120 },
      { region: "THA-N", name: "Northern Thailand", hotspots24h: 12, severity: "good", deltaVs7d: null },
    ]);
  });

  it("accepts the alternative hotspots_24h key shape", async () => {
    process.env.ASMC_API_KEY = "k";
    process.env.ASMC_BASE = "https://example.invalid";
    stubFetch(() =>
      Response.json({
        assessment: "hazardous",
        regions: [{ region: "LAO-N", name: "Bokeo", hotspots_24h: 210 }],
      }),
    );
    const res = await (await freshFetch())();
    expect(res.assessment).toBe("hazardous");
    expect(res.regions[0]).toMatchObject({ region: "LAO-N", hotspots24h: 210, severity: "alert" });
  });

  it("falls back to the first working endpoint when the preferred shape 404s", async () => {
    process.env.ASMC_API_KEY = "k";
    process.env.ASMC_BASE = "https://example.invalid";
    const seen: string[] = [];
    stubFetch((u) => {
      seen.push(u);
      if (u.endsWith("/api/v1/regional/haze-assessment")) return new Response("", { status: 404 });
      return Response.json({ assessment: "moderate", hotspots: [] });
    });
    const res = await (await freshFetch())();
    expect(res.assessment).toBe("moderate");
    expect(seen).toHaveLength(2);
  });

  it("reports scenario when a configured host answers nothing usable", async () => {
    process.env.ASMC_API_KEY = "k";
    process.env.ASMC_BASE = "https://example.invalid";
    stubFetch(() => new Response("nope", { status: 403 }));
    const res = await (await freshFetch())();
    expect(res.provenance).toBe("scenario");
    expect(res.regions).toEqual([]);
    expect(res.note).toMatch(/check the token scope or the host/);
  });

  it("survives a thrown fetch and does not invent hotspot counts", async () => {
    process.env.ASMC_API_KEY = "k";
    process.env.ASMC_BASE = "https://example.invalid";
    stubFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    const res = await (await freshFetch())();
    expect(res.provenance).toBe("scenario");
    expect(res.regions).toEqual([]);
    expect(res.assessment).toBe("unknown");
  });
});
