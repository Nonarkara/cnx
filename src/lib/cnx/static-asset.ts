// Reads one of this app's own public/data/cnx/*.json|geojson files
// from server-side code (API routes), reliably.
//
// The three baked-data readers (bus-routes.ts, waterways.ts,
// open-data-th.ts) all previously read their own static asset via a
// plain `fetch(absoluteUrl)` self-request. That works, but
// intermittently: a Worker fetching its own origin is a real network
// round-trip through Cloudflare's edge, and empirically it fails often
// enough to matter (~30-40% empty responses observed in production —
// /api/cnx/bus-routes alternating between 17 routes and 0 across
// requests seconds apart, same deployed version).
//
// The reliable path on Cloudflare Workers is the `ASSETS` binding
// (wrangler.cnx.jsonc declares it) via `env.ASSETS.fetch()` — it reads
// the static asset in-process, no network hop. `getCloudflareContext`
// throws/returns no ASSETS binding outside an actual Workers request
// (e.g. local `next dev`), so this always falls back to a normal
// fetch there.
export async function fetchStaticAsset(path: string): Promise<Response> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    if (env.ASSETS) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://cnx.nonarkara.org";
      const res = await env.ASSETS.fetch(new Request(`${siteUrl}${path}`));
      if (res.ok) return res;
    }
  } catch {
    // Not running in a Cloudflare Workers request context — fall
    // through to a normal fetch (local dev, tests, etc).
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const url = siteUrl ? `${siteUrl}${path}` : path;
  return fetch(url, { cache: "no-store" });
}
