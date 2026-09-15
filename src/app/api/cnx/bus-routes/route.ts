import { NextResponse } from "next/server";
import { fetchCnxBus } from "../../../../lib/cnx/bus-routes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await fetchCnxBus();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=21600" },
  });
}