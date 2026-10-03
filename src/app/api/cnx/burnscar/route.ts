import { burnscarUpstream } from "../../../../lib/cnx/burnscar";

export const dynamic = "force-dynamic";

/** Same-origin proxy for HII's burn-scar TMS (no CORS upstream). Season
 *  layers are static, so tiles are cached hard at the edge and in browsers. */
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const upstream = burnscarUpstream(q.get("l"), q.get("z"), q.get("x"), q.get("y"));
  if (!upstream) return new Response(null, { status: 400 });
  try {
    const res = await fetch(upstream, {
      signal: AbortSignal.timeout(15_000),
      cf: { cacheEverything: true, cacheTtl: 7 * 86_400 },
    } as RequestInit);
    const type = res.headers.get("content-type") ?? "";
    // Outside the burned north HII answers 404 with an HTML page; send an
    // empty 204 so MapLibre treats it as a blank tile, not an error.
    if (!res.ok || !type.startsWith("image/")) return new Response(null, { status: 204, headers: { "Cache-Control": "public, max-age=86400" } });
    return new Response(res.body, {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=604800, s-maxage=604800" },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
