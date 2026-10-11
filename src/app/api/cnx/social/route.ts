import { NextResponse } from "next/server";
import { fetchCnxSocial, fetchCnxSocialMultilingual } from "../../../../lib/cnx/social";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const multilingual = url.searchParams.get("multilingual") === "1";
  const countries = (url.searchParams.get("countries") ?? "").split(",").filter(Boolean).slice(0, 20);
  const data = multilingual
    ? await fetchCnxSocialMultilingual(countries)
    : await fetchCnxSocial();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=180" },
  });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle(request), ["multilingual", "countries"]);
}
