import { NextResponse } from "next/server";
import { fetchCnxHeritage } from "../../../../lib/cnx/heritage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await fetchCnxHeritage();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=21600" },
  });
}