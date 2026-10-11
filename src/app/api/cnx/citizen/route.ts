import { NextResponse } from "next/server";
import { fetchCnxCitizenReports } from "../../../../lib/cnx/citizen-reports";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Haze reports from public posts + local news, place-matched by the relay. */
async function handle(): Promise<Response> {
  return NextResponse.json(await fetchCnxCitizenReports(), { headers: { "Cache-Control": "s-maxage=300" } });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle());
}
