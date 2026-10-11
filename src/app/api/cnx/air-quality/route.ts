import { NextResponse } from "next/server";
import { fetchCnxAirQuality } from "../../../../lib/cnx/air-quality";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function handle(): Promise<Response> {
  const data = await fetchCnxAirQuality();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=240, stale-while-revalidate=600" },
  });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle());
}
