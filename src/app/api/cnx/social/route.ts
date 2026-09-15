import { NextResponse } from "next/server";
import { fetchCnxSocial } from "../../../../lib/cnx/social";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await fetchCnxSocial();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=180" },
  });
}