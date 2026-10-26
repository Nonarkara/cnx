import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheKey, edgeCached, sMaxAge } from "./edge-cache";

describe("edge cache", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_GIT_SHA", ""));
  afterEach(() => {
    delete (globalThis as { caches?: unknown }).caches;
    vi.unstubAllEnvs();
  });

  it("keys on the path and only the parameters the route reads", () => {
    const k = cacheKey(new Request("https://x.test/api/cnx/social?_release=abc&countries=KR&junk=1&multilingual=1"), ["multilingual", "countries"]);
    expect(k.url).toBe("https://x.test/api/cnx/social?countries=KR&multilingual=1");
    expect(cacheKey(new Request("https://x.test/api/cnx/fires?bust=9")).url).toBe("https://x.test/api/cnx/fires");
  });

  it("reads the route's own s-maxage", () => {
    expect(sMaxAge(new Response("", { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" } }))).toBe(300);
    expect(sMaxAge(new Response(""))).toBe(0);
  });

  it("isolates deployed contracts without accepting caller cache-busting keys", () => {
    vi.stubEnv("NEXT_PUBLIC_GIT_SHA", "a".repeat(40));
    const old = cacheKey(new Request("https://x.test/api/cnx/rain?_release=caller"));
    vi.stubEnv("NEXT_PUBLIC_GIT_SHA", "b".repeat(40));
    const next = cacheKey(new Request("https://x.test/api/cnx/rain?_release=other"));
    expect(old.url).not.toBe(next.url);
    expect(next.url).toBe(cacheKey(new Request("https://x.test/api/cnx/rain?bust=100")).url);
    expect(next.url).not.toContain("other");
  });

  it("serves a second request from the cache instead of re-running the route", async () => {
    const store = new Map<string, Response>();
    (globalThis as { caches?: unknown }).caches = {
      default: {
        match: async (r: Request) => store.get(r.url)?.clone(),
        put: async (r: Request, res: Response) => void store.set(r.url, res),
      },
    };
    const produce = vi.fn(async () => Response.json({ ok: 1 }, { headers: { "Cache-Control": "s-maxage=60" } }));
    const a = await edgeCached(new Request("https://x.test/api/cnx/fires?x=1"), produce);
    const b = await edgeCached(new Request("https://x.test/api/cnx/fires?y=2"), produce);
    expect(produce).toHaveBeenCalledTimes(1);
    expect(a.headers.get("x-cnx-cache")).toBe("MISS");
    expect(b.headers.get("x-cnx-cache")).toBe("HIT");
    expect(a.headers.get("Cache-Control")).toBe("private, no-store");
    expect(b.headers.get("Cache-Control")).toBe("private, no-store");
    expect([...store.values()][0].headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(await b.json()).toEqual({ ok: 1 });
  });

  it("does not return a legacy browser-cacheable hit or uncached error policy", async () => {
    (globalThis as { caches?: unknown }).caches = { default: {
      match: async () => Response.json({ old: 1 }, { headers: { "Cache-Control": "public, max-age=14400" } }),
      put: vi.fn(),
    } };
    const hit = await edgeCached(new Request("https://x.test/api/cnx/rain"), vi.fn());
    expect(hit.headers.get("Cache-Control")).toBe("private, no-store");
    delete (globalThis as { caches?: unknown }).caches;
    const failure = await edgeCached(new Request("https://x.test/api/cnx/rain"), async () => new Response("down", { status: 503 }));
    expect(failure.status).toBe(503);
    expect(failure.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not cache errors or responses without a TTL", async () => {
    const store = new Map<string, Response>();
    (globalThis as { caches?: unknown }).caches = { default: { match: async (r: Request) => store.get(r.url), put: async (r: Request, res: Response) => void store.set(r.url, res) } };
    await edgeCached(new Request("https://x.test/a"), async () => new Response("no", { status: 502, headers: { "Cache-Control": "s-maxage=60" } }));
    await edgeCached(new Request("https://x.test/b"), async () => new Response("{}"));
    expect(store.size).toBe(0);
  });
});
