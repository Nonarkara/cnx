import { capAtom } from "../../../../lib/cnx/cap";
import { loadCapFeed } from "../../../../lib/cnx/cap-feed";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Atom index of the board's CAP alerts; each entry links its /api/cnx/cap.xml?id= document. */
async function handle(request: Request): Promise<Response> {
  try {
    const feed = await loadCapFeed();
    return new Response(capAtom(feed.messages, new URL(request.url).origin, feed.generatedAt), {
      headers: { "Content-Type": "application/atom+xml; charset=utf-8", "Cache-Control": "public, s-maxage=300" },
    });
  } catch (err) {
    console.error("[cap.atom] build failed", err instanceof Error ? err.message : err);
    return new Response("CAP index unavailable", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=60" },
    });
  }
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle(request));
}
