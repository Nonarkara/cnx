import { NextResponse } from "next/server";
import { fetchCnxFloodHub } from "../../../../lib/cnx/floodhub";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Google Flood Hub model forecasts at the virtual gauges nearest the Ping at Chiang Mai. */
async function handle(): Promise<Response> {
  return NextResponse.json(await fetchCnxFloodHub(), { headers: { "Cache-Control": "s-maxage=900" } });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle());
}
