import { NextResponse } from "next/server";
import { fetchRiverLevel } from "../../../../lib/cnx/river-level";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function handle(): Promise<Response> {
  const data = await fetchRiverLevel();
  return NextResponse.json(data, {
    // Matches the module's own 10-minute TTL. The gauge observations
    // inside carry their own `observedAt`, which is what the panel ages
    // — this header only governs how long the envelope may be reused.
    headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" },
  });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle());
}
