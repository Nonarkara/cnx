// Shared edge cache for read routes. A Worker's own responses are NOT kept
// by Cloudflare's CDN — `s-maxage` on a Worker response does nothing unless
// the Worker stores it with the Cache API. Without this, every request ran
// the route again and every cold isolate re-hit upstream quotas (FIRMS,
// Open-Meteo, GISTDA, Google News).
//
// The cache key is the path plus only the query parameters the route
// actually reads (sorted), so `?anything=1` cannot mint new keys and burn
// upstream calls. The TTL is the route's own `s-maxage`, which routes
// already set shorter for failures than for successes.

type CacheStore = { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> };

function edgeCache(): CacheStore | null {
  const c = (globalThis as unknown as { caches?: { default?: CacheStore } }).caches;
  return c?.default ?? null;
}

export function cacheKey(request: Request, keyParams: readonly string[] = []): Request {
  const url = new URL(request.url);
  const kept = new URLSearchParams();
  for (const name of [...keyParams].sort()) {
    const v = url.searchParams.get(name);
    if (v !== null) kept.set(name, v.slice(0, 200));
  }
  // The server build owns contract isolation. Accepting a caller's release
  // parameter would let arbitrary requests bypass the quota-saving cache.
  const release = process.env.NEXT_PUBLIC_GIT_SHA;
  if (release && /^[a-f0-9]{7,40}$/.test(release)) kept.set("__cnx_build", release);
  const qs = kept.toString();
  return new Request(`${url.origin}${url.pathname}${qs ? `?${qs}` : ""}`, { method: "GET" });
}

/** Cache API storage is shared; browser storage must never freeze live feeds. */
function forBrowser(response: Response): Response {
  const res = new Response(response.body, response);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export function sMaxAge(res: Response): number {
  const m = /s-maxage=(\d+)/.exec(res.headers.get("Cache-Control") ?? "");
  return m ? Number(m[1]) : 0;
}

async function waitUntil(p: Promise<unknown>): Promise<void> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(p);
  } catch {
    await p.catch(() => {});
  }
}

/** Serve from the edge cache, or run `produce` and store its response for its s-maxage. */
export async function edgeCached(request: Request, produce: () => Promise<Response>, keyParams: readonly string[] = []): Promise<Response> {
  const store = edgeCache();
  if (!store || request.method !== "GET") return forBrowser(await produce());
  const key = cacheKey(request, keyParams);
  const hit = await store.match(key).catch(() => undefined);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set("x-cnx-cache", "HIT");
    return forBrowser(res);
  }
  const res = await produce();
  const ttl = sMaxAge(res);
  if (res.status === 200 && ttl > 0) {
    const copy = res.clone();
    const stored = new Response(copy.body, copy);
    stored.headers.set("Cache-Control", `public, max-age=${ttl}`);
    await waitUntil(store.put(key, stored));
  }
  res.headers.set("x-cnx-cache", "MISS");
  return forBrowser(res);
}
