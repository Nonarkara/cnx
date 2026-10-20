import { NextResponse } from "next/server";
import { edgeCached } from "../../../../lib/edge-cache";
import { fetchCnxWaterVision } from "../../../../lib/cnx/water-vision";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, async () => NextResponse.json(await fetchCnxWaterVision(), { headers: { "Cache-Control": "s-maxage=120" } }));
}
