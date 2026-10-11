import { NextResponse } from "next/server";
import { fetchCnxDustboy } from "../../../../lib/cnx/dustboy";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * CNX /api/cnx/dustboy — CMU Climate Change Data Center ground PM2.5.
 *
 * Dense Chiang Mai + upper-northern sensor network (hundreds of stations).
 * Public keyless feed; returns live readings + basin aggregate, or an
 * empty basin + provenance="scenario" + a note — never fabricated values.
 *
 * Cache: 10 min in-process.
 */
async function handle(): Promise<Response> {
  const data = await fetchCnxDustboy();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" },
  });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle());
}
