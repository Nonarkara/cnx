import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { buildArrivalsResponse } from "../../../../../lib/cnx/arrivals";
import { ARRIVALS_KV_KEY, isArrivalsIngestPayload } from "../../../../../lib/cnx/arrivals-kv";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Receives raw OpenSky arrival records for Chiang Mai (VTCC) plus
 * aircraft types from the off-Cloudflare relay (scripts/relay-flights.mjs)
 * — OpenSky can't be reached from Cloudflare's network, see
 * flights/ingest/route.ts. The estimate maths runs here, in the same
 * pure functions the direct path uses, so a relay can't push numbers
 * that bypass the documented load-factor methodology.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CNX_FLIGHTS_RELAY_SECRET;
  if (!secret) return NextResponse.json({ error: "relay ingest not configured" }, { status: 503 });
  if (request.headers.get("x-relay-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!isArrivalsIngestPayload(body)) {
    return NextResponse.json({ error: "payload does not match ArrivalsIngestPayload" }, { status: 422 });
  }

  const { env } = await getCloudflareContext({ async: true });
  if (!env.CNX_FLIGHTS_KV) return NextResponse.json({ error: "CNX_FLIGHTS_KV binding missing" }, { status: 500 });

  const response = buildArrivalsResponse(body.windows, new Map(Object.entries(body.typecodes)));
  await env.CNX_FLIGHTS_KV.put(ARRIVALS_KV_KEY, JSON.stringify(response), { expirationTtl: 24 * 60 * 60 });

  return NextResponse.json({
    ok: true,
    days: response.days.map((d) => ({ date: d.date, flights: d.totalFlights, international: d.internationalFlights })),
  });
}
