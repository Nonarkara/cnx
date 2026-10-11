import { NextResponse } from "next/server";
import { fetchCnxAeronet } from "../../../../lib/cnx/aeronet";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** NASA AERONET ground AOD at Chiang Mai (daily averages, last 30 days). */
async function handle(): Promise<Response> {
  return NextResponse.json(await fetchCnxAeronet(), { headers: { "Cache-Control": "s-maxage=3600" } });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle());
}
