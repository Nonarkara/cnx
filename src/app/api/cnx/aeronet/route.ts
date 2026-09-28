import { NextResponse } from "next/server";
import { fetchCnxAeronet } from "../../../../lib/cnx/aeronet";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** NASA AERONET ground AOD at Chiang Mai (daily averages, last 30 days). */
export async function GET(): Promise<Response> {
  return NextResponse.json(await fetchCnxAeronet(), { headers: { "Cache-Control": "s-maxage=3600" } });
}
