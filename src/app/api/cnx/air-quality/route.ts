import { NextResponse } from "next/server";
import { fetchCnxAirQuality } from "../../../../lib/cnx/air-quality";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await fetchCnxAirQuality();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=240, stale-while-revalidate=600" },
  });
}