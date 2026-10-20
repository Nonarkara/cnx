import { NextResponse } from "next/server";
import { fetchSmokeTrajectory } from "../../../../lib/cnx/smoke-feed";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Regional FIRMS paths follow hourly850hPa forecast winds when available,
 * otherwise one surface-wind vector. Screen origin+hourlypositions over a
 * complete six-hour path; this is modeled proximity, never observed arrival. */
async function handle(): Promise<Response> {
  const trajectory = await fetchSmokeTrajectory();
  return NextResponse.json(trajectory, {
    headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" },
  });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  // Version the internal edge key: endpoint-only cached flags must not be
  // presented as the new whole-path screening after this rollout.
  const key = new URL(request.url);
  key.search = "assessment=hourly-path-v1";
  return edgeCached(new Request(key, request), () => handle(), ["assessment"]);
}
