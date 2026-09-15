import { NextResponse } from "next/server";
import { fetchCnxSnapshot } from "../../../../lib/cnx/opensky";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Live flights over the CNX area.
 *
 * OpenSky Network is queried server-side: this keeps the upstream token
 * off the client, gives the same fetch path on the wall and on a phone,
 * and centralises the in-process cache so all clients on the wall hit
 * OpenSky once per minute, not per viewer. The Cloudflare edge caches
 * the response for ~10s with stale-while-revalidate, which is shorter
 * than the upstream polling cadence but long enough to keep the cost
 * flat when twelve viewers on the same wall ask the same question.
 */
export async function GET(): Promise<Response> {
  const snapshot = await fetchCnxSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "s-maxage=10, stale-while-revalidate=30",
    },
  });
}
