import { NextResponse } from "next/server";
import { fetchCnxDam } from "../../../../lib/cnx/dam";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Ping-basin reservoir storage (ThaiWater analyst/dam, via the relay). */
export async function GET(): Promise<Response> {
  return NextResponse.json(await fetchCnxDam(), { headers: { "Cache-Control": "s-maxage=600" } });
}
