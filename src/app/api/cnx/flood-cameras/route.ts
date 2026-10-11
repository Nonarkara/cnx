import { NextResponse } from "next/server";
import { fetchCnxFloodCameras } from "../../../../lib/cnx/flood-cameras";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * CNX /api/cnx/flood-cameras — public cameras in the Chiang Mai
 * operating area, from the Maholan flood CCTV wall.
 *
 * This returns CATALOGUE METADATA ONLY: position, owning agency, stream
 * type and the aggregator's liveness flag. It deliberately does not
 * proxy, embed, or relay any video. The upstream catalogue is ~906 KB
 * with no filter parameters, so the module polls it once per 15 minutes
 * and filters down to this province; the edge cache below is what keeps
 * the origin load near zero between those reads.
 *
 * `cataloguedAt` is the observation time the panel must age. `live` is
 * the aggregator's flag passed through unchanged — never inferred here.
 */
async function handle(): Promise<Response> {
  const data = await fetchCnxFloodCameras();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=1800" },
  });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle());
}
