import { NextResponse } from "next/server";
import { fetchCnxHazeVision } from "../../../../lib/cnx/haze-vision";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Webcam haze verdicts scored by the off-Cloudflare relay (Workers can't decode images). */
export async function GET(): Promise<Response> {
  return NextResponse.json(await fetchCnxHazeVision(), { headers: { "Cache-Control": "s-maxage=120" } });
}
