import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: { CNX_FLIGHTS_KV: kv } }) }));
import { POST as ingestFlights } from "../../app/api/cnx/flights/ingest/route";
import { POST as ingestArrivals } from "../../app/api/cnx/arrivals/ingest/route";
import { readArrivalsFromKv } from "./arrivals-kv";
import { fetchCnxSnapshot } from "./opensky";

beforeEach(() => {
  vi.stubEnv("CNX_FLIGHTS_RELAY_SECRET", "test-secret");
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-02T06:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
  kv.get.mockReset();
  kv.put.mockReset();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe.each([["flights", ingestFlights], ["arrivals", ingestArrivals]] as const)("%s ingest", (_name, ingest) => {
  it("rejects an oversized chunked body before KV writes", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(600_000)); },
      cancel() { cancelled = true; },
    });
    const request = new Request("https://cnx.test/ingest", { method: "POST", headers: { "x-relay-secret": "test-secret" }, body, duplex: "half" } as RequestInit);
    expect((await ingest(request)).status).toBe(413);
    expect(cancelled).toBe(true);
    expect(kv.put).not.toHaveBeenCalled();
  });
  it("refuses a missing relay secret before reading a body", async () => {
    vi.stubEnv("CNX_FLIGHTS_RELAY_SECRET", "");
    const request = new Request("https://cnx.test/ingest", { method: "POST", body: "{}" });
    expect((await ingest(request)).status).toBe(503);
    expect(request.bodyUsed).toBe(false);
    expect(kv.put).not.toHaveBeenCalled();
  });
});

describe("duplicated relay readers", () => {
  it.each(["invalid", "2026-10-03T06:00:00Z", "2026-10-01T06:00:00Z"])("rejects unusable arrivals timestamp %s", async (generatedAt) => {
    kv.get.mockResolvedValue(JSON.stringify({ days: [], generatedAt }));
    expect(await readArrivalsFromKv()).toBeNull();
  });
  it("accepts a fresh arrivals response", async () => {
    const response = { days: [], generatedAt: "2026-10-02T05:59:00Z" };
    kv.get.mockResolvedValue(JSON.stringify(response));
    expect(await readArrivalsFromKv()).toEqual(response);
  });
  it("rejects a future flight snapshot and falls back honestly", async () => {
    kv.get.mockResolvedValue(JSON.stringify({ fetchedAt: Date.now() + 86_400_000, observedAt: Date.now(), degraded: false, airborne: [], ground: [] }));
    expect((await fetchCnxSnapshot()).degraded).toBe(true);
  });
  it("accepts a fresh flight snapshot without upstream fetches", async () => {
    kv.get.mockResolvedValue(JSON.stringify({ fetchedAt: Date.now(), observedAt: Date.now(), degraded: false, airborne: [], ground: [] }));
    expect((await fetchCnxSnapshot()).source).toBe("relay");
    expect(fetch).not.toHaveBeenCalled();
  });
});
