import { NextResponse } from "next/server";
import { fetchCnxHazeVision } from "../../../../lib/cnx/haze-vision";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Webcam haze verdicts scored by the off-Cloudflare relay (Workers can't decode images). */
async function handle(): Promise<Response> {
  return NextResponse.json(await fetchCnxHazeVision(), { headers: { "Cache-Control": "s-maxage=120" } });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle());
}
