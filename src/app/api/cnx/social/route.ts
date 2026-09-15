import { NextResponse } from "next/server";
import { fetchCnxSocial, fetchCnxSocialMultilingual } from "../../../../lib/cnx/social";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const multilingual = url.searchParams.get("multilingual") === "1";
  const countries = (url.searchParams.get("countries") ?? "").split(",").filter(Boolean);
  const data = multilingual
    ? await fetchCnxSocialMultilingual(countries)
    : await fetchCnxSocial();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=180" },
  });
}