import { capAlertDocument, capListDocument, isCapIdentifier } from "../../../../lib/cnx/cap";
import { loadCapFeed, type CapFeed } from "../../../../lib/cnx/cap-feed";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OK_CACHE = "public, s-maxage=300";
const MISS_CACHE = "public, s-maxage=60";

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": MISS_CACHE } });

/**
 * CAP 1.2 export of the board's own active warnings (docs/DIGITAL-TWIN-STANDARDS.md item 2).
 *
 * `?id=<identifier>` → one CAP 1.2 <alert> document (application/cap+xml),
 * which is what /api/cnx/cap.atom links to. Without `id` → every active
 * alert in one <alerts> list (application/xml). scope=Restricted throughout:
 * this is decision support, not an official public warning.
 */
async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id !== null && !isCapIdentifier(id)) return text("invalid id", 400);
  let feed: CapFeed;
  try {
    feed = await loadCapFeed();
  } catch (err) {
    console.error("[cap.xml] build failed", err instanceof Error ? err.message : err);
    return text("CAP export unavailable", 503);
  }
  const web = `${url.origin}/`;
  if (id === null) {
    return new Response(capListDocument(feed.messages, web, feed.generatedAt), {
      headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": OK_CACHE },
    });
  }
  const message = feed.messages.find((m) => m.identifier === id);
  if (!message) return text("no active alert with this identifier", 404);
  return new Response(capAlertDocument(message, web), {
    headers: { "Content-Type": "application/cap+xml; charset=utf-8", "Cache-Control": OK_CACHE },
  });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle(request), ["id"]);
}
