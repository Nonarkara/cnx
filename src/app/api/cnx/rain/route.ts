import { NextResponse } from "next/server";
import { fetchCnxRain } from "../../../../lib/cnx/rain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Measured 24-hour rainfall at Chiang Mai rain gauges (ThaiWater, via the relay). */
export async function GET(): Promise<Response> {
  return NextResponse.json(await fetchCnxRain(), { headers: { "Cache-Control": "s-maxage=300" } });
}
