import { NextResponse } from "next/server";
import { fetchCnxFires } from "../../../../lib/cnx/fires";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function handle(): Promise<Response> {
  const data = await fetchCnxFires();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=900" },
  });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle());
}
