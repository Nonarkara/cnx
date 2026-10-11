import { NextResponse } from "next/server";
import { fetchCnxGistdaPm25, fetchCnxCnAqi } from "../../../../lib/cnx/gistda-pm25";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function handle(): Promise<Response> {
  const [pm25, cn] = await Promise.all([fetchCnxGistdaPm25(), fetchCnxCnAqi()]);
  return NextResponse.json(
    { pm25, cnAqi: cn },
    {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=1200" },
    },
  );
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle());
}
