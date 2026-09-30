import { NextResponse } from "next/server";
import { fetchCnxFloodHub } from "../../../../lib/cnx/floodhub";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Google Flood Hub model forecasts at the virtual gauges nearest the Ping at Chiang Mai. */
export async function GET(): Promise<Response> {
  return NextResponse.json(await fetchCnxFloodHub(), { headers: { "Cache-Control": "s-maxage=900" } });
}
