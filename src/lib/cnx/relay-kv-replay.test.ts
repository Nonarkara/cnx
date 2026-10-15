// Replay defence on the shared relay ingest secret.
//
// Every ingest route (haze-vision, rain, river-level, citizen, social, dam)
// authenticates with ONE static secret in `x-relay-secret`. Anyone who ever
// captures one POST body plus that header can resend it indefinitely. The
// harm is not "a stranger can write junk" — the validators already reject
// malformed bodies — it is that a CAPTURED, VALID, STALE body replayed on a
// timer pins the board to old readings that are still inside the freshness
// window, so the dashboard shows last night's river as current.
//
// The guard is monotonicity: a push must be strictly newer than what is
// held. No new headers, no new secrets, no relay/edge clock sync.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ingestRelayJson } from "./relay-kv";

const SECRET = "test-relay-secret";
const KEY = "test-key";

/** Minimal in-memory stand-in for a KV namespace. */
function fakeKv(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
  };
}

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({ env: { CNX_FLIGHTS_KV: fakeKv() } })),
}));

const isValid = (v: unknown): v is { generatedAt: string } =>
  typeof v === "object" && v !== null && typeof (v as { generatedAt?: unknown }).generatedAt === "string";

/** A guard that accepts any object — used where the stamp is deliberately absent. */
const acceptObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function post(body: unknown, secret = SECRET): Request {
  return new Request("https://x/api/cnx/test/ingest", {
    method: "POST",
    headers: { "x-relay-secret": secret, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  vi.stubEnv("CNX_FLIGHTS_RELAY_SECRET", SECRET);
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  vi.mocked(getCloudflareContext).mockResolvedValue({ env: { CNX_FLIGHTS_KV: fakeKv() } } as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

/** Point the mocked context at a KV already holding `generatedAt`. */
async function seed(generatedAt: string) {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const fresh = fakeKv({ [KEY]: JSON.stringify({ generatedAt }) });
  vi.mocked(getCloudflareContext).mockResolvedValue({ env: { CNX_FLIGHTS_KV: fresh } } as never);
  return fresh;
}

describe("relay ingest rejects a replayed or out-of-order push", () => {
  it("rejects future poisoning without overwriting the readable copy", async () => {
    const now = Date.now();
    const held = new Date(now).toISOString();
    const store = await seed(held);
    const res = await ingestRelayJson(post({ generatedAt: new Date(now + 6 * 60_000).toISOString() }), KEY, isValid, 600);
    expect(res.status).toBe(422);
    expect(store.store.get(KEY)).toBe(JSON.stringify({ generatedAt: held }));
    expect(store.put).not.toHaveBeenCalled();
  });

  it("allows limited future skew but still rejects a replay within that allowance", async () => {
    const stamp = new Date(Date.now() + 4 * 60_000).toISOString();
    const store = await seed(new Date(Date.now() - 1_000).toISOString());
    expect((await ingestRelayJson(post({ generatedAt: stamp }), KEY, isValid, 600)).status).toBe(200);
    expect((await ingestRelayJson(post({ generatedAt: stamp }), KEY, isValid, 600)).status).toBe(409);
    expect(store.put).toHaveBeenCalledOnce();
  });

  it("repairs a previously poisoned future copy with a current push", async () => {
    const now = Date.now();
    const store = await seed(new Date(now + 24 * 60 * 60_000).toISOString());
    const current = new Date(now).toISOString();
    const res = await ingestRelayJson(post({ generatedAt: current }), KEY, isValid, 600);
    expect(res.status).toBe(200);
    expect(store.store.get(KEY)).toBe(JSON.stringify({ generatedAt: current }));
  });

  it("accepts the first push when nothing is stored", async () => {
    const res = await ingestRelayJson(post({ generatedAt: "2026-10-12T00:00:00Z" }), KEY, isValid, 600);
    expect(res.status).toBe(200);
  });

  it("refuses a replayed body and leaves the newer data in place", async () => {
    const store = await seed("2026-10-12T06:00:00Z");
    const before = store.store.get(KEY);

    // Same captured body, sent again an hour later.
    const res = await ingestRelayJson(post({ generatedAt: "2026-10-12T05:00:00Z" }), KEY, isValid, 600);

    expect(res.status).toBe(409);
    expect(store.store.get(KEY)).toBe(before); // NOT overwritten
    expect(store.put).not.toHaveBeenCalled();
  });

  it("refuses an identical timestamp, not just an older one", async () => {
    const store = await seed("2026-10-12T06:00:00Z");
    const res = await ingestRelayJson(post({ generatedAt: "2026-10-12T06:00:00Z" }), KEY, isValid, 600);
    expect(res.status).toBe(409);
    expect(store.put).not.toHaveBeenCalled();
  });

  it("still accepts a genuinely newer push", async () => {
    const store = await seed("2026-10-12T06:00:00Z");
    const res = await ingestRelayJson(post({ generatedAt: "2026-10-12T07:00:00Z" }), KEY, isValid, 600);
    expect(res.status).toBe(200);
    expect(store.put).toHaveBeenCalledOnce();
  });

  it("names both timestamps so a rejected push is diagnosable", async () => {
    await seed("2026-10-12T06:00:00Z");
    const res = await ingestRelayJson(post({ generatedAt: "2026-10-12T05:00:00Z" }), KEY, isValid, 600);
    const body = (await res.json()) as { held?: string; received?: string };
    expect(body.held).toBe("2026-10-12T06:00:00.000Z");
    expect(body.received).toBe("2026-10-12T05:00:00.000Z");
  });

  it("accepts when the stored value is unreadable — corruption is not a replay", async () => {
    const store = fakeKv({ [KEY]: "{not json" });
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: { CNX_FLIGHTS_KV: store } } as never);

    const res = await ingestRelayJson(post({ generatedAt: "2026-10-12T00:00:00Z" }), KEY, isValid, 600);
    expect(res.status).toBe(200); // a fresh valid push repairs it
  });

  it("does not block a payload that carries no timestamp at all", async () => {
    await seed("2026-10-12T06:00:00Z");
    const res = await ingestRelayJson(post({ somethingElse: 1 }), KEY, acceptObject, 600);
    expect(res.status).toBe(200);
  });

  it("still rejects a bad secret before any of this", async () => {
    const store = await seed("2026-10-12T06:00:00Z");
    const res = await ingestRelayJson(post({ generatedAt: "2026-10-12T07:00:00Z" }, "wrong"), KEY, isValid, 600);
    expect(res.status).toBe(401);
    expect(store.put).not.toHaveBeenCalled();
  });
});
