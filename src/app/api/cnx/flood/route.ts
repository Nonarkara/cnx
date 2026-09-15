import { NextResponse } from "next/server";
import { fetchCnxFlood } from "../../../../lib/cnx/flood";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await fetchCnxFlood();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" },
  });
}