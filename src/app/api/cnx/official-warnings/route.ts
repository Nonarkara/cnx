import { NextResponse } from "next/server";
import { fetchOfficialWarnings } from "../../../../lib/cnx/tmd-cap";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** TMD CAP 1.2 warnings in force for Chiang Mai (src/lib/cnx/tmd-cap.ts). */
async function handle(): Promise<Response> {
  const body = await fetchOfficialWarnings();
  // Same rule as the in-memory cache: 10 min on success, 30 min on failure.
  const maxAge = body.provenance === "live" ? 600 : 1800;
  return NextResponse.json(body, { headers: { "Cache-Control": `s-maxage=${maxAge}` } });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle());
}
