import { afterEach, describe, expect, it, vi } from "vitest";
import { ingestRelayJson, readBoundedJson, readRelayJson } from "./relay-kv";

const store = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: { CNX_FLIGHTS_KV: store } }) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); store.get.mockReset(); store.put.mockReset(); });
const valid = (v: unknown): v is { generatedAt: string } => !!v && typeof (v as { generatedAt?: unknown }).generatedAt === "string";

function streaming(chunks: Uint8Array[], headers?: Record<string, string>, cancel?: () => void) {
  let i = 0;
  return new Request("https://relay.test/ingest", {
    method: "POST", headers,
    body: new ReadableStream({ pull(c) { if (i < chunks.length) c.enqueue(chunks[i++]); else c.close(); }, cancel }),
    duplex: "half",
  } as RequestInit);
}

describe("bounded relay ingestion", () => {
  it("parses JSON split across UTF-8 byte boundaries", async () => {
    const bytes = new TextEncoder().encode('{"name":"เชียงใหม่"}');
    const result = await readBoundedJson(streaming([bytes.subarray(0, 11), bytes.subarray(11)]));
    expect(result).toEqual({ body: { name: "เชียงใหม่" } });
  });
  it("rejects declared oversized payload before consuming the body", async () => {
    const request = new Request("https://relay.test", { method: "POST", headers: { "content-length": "1048577" }, body: "{}" });
    const result = await readBoundedJson(request);
    expect("response" in result && result.response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
  });
  it("caps chunked bodies even with a dishonest Content-Length and cancels the stream", async () => {
    const cancelled = vi.fn();
    const result = await readBoundedJson(streaming([new Uint8Array(1_048_576), new Uint8Array(1), new Uint8Array(10)], { "content-length": "2" }, cancelled));
    expect("response" in result && result.response.status).toBe(413);
    expect(cancelled).toHaveBeenCalled();
  });
  it("rejects malformed JSON and broken body streams", async () => {
    const broken = new Request("https://relay.test", { method: "POST", body: new ReadableStream({ start(c) { c.error(new Error("broken")); } }), duplex: "half" } as RequestInit);
    for (const request of [new Request("https://relay.test", { method: "POST", body: "{" }), broken]) {
      const result = await readBoundedJson(request);
      expect("response" in result && result.response.status).toBe(400);
    }
  });
  it("authenticates before reading and stores only validated bodies", async () => {
    vi.stubEnv("CNX_FLIGHTS_RELAY_SECRET", "test-secret");
    const denied = new Request("https://relay.test", { method: "POST", body: "{}" });
    expect((await ingestRelayJson(denied, "key", valid, 60)).status).toBe(401);
    expect(denied.bodyUsed).toBe(false);
    const request = new Request("https://relay.test", { method: "POST", headers: { "x-relay-secret": "test-secret" }, body: JSON.stringify({ generatedAt: new Date().toISOString() }) });
    expect((await ingestRelayJson(request, "key", valid, 60)).status).toBe(200);
    expect(store.put).toHaveBeenCalledOnce();
  });
});

describe("relay freshness", () => {
  it("rejects expired, invalid and future generation times", async () => {
    const now = Date.now();
    for (const generatedAt of ["bad", new Date(now + 6 * 60_000).toISOString(), new Date(now - 61_000).toISOString()]) {
      store.get.mockResolvedValue(JSON.stringify({ generatedAt }));
      expect(await readRelayJson("key", 60_000, valid)).toBeNull();
    }
  });
  it("accepts a fresh copy and limited clock skew", async () => {
    for (const offset of [-30_000, 60_000]) {
      const copy = { generatedAt: new Date(Date.now() + offset).toISOString() };
      store.get.mockResolvedValue(JSON.stringify(copy));
      expect(await readRelayJson("key", 60_000, valid)).toEqual(copy);
    }
  });
});
