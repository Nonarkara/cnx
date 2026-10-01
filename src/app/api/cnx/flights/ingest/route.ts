import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { FLIGHTS_KV_KEY, isFetchResult } from "../../../../../lib/cnx/flights-kv";
import { relaySecretMatches } from "../../../../../lib/cnx/relay-kv";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Receives a flight snapshot from the off-Cloudflare relay poller
 * (scripts/relay-flights.mjs, run outside this network — see that
 * file for why) and stores it in KV for fetchCnxSnapshot() to read.
 *
 * OpenSky and adsb.lol are both unreachable from Cloudflare's own
 * network (confirmed: OpenSky returns Cloudflare error 522 — the edge
 * can't even open a TCP connection to OpenSky's origin; adsb.lol
 * rate-limits the shared Workers egress IPs at the nginx layer). No
 * amount of authentication fixes a connectivity block, so the Worker
 * can no longer fetch flight data itself — a process on a normal
 * (non-Cloudflare) IP has to fetch it and push it in.
 */
const MAX_BODY_BYTES = 1_048_576; // 1 MB ceiling for flight snapshots

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CNX_FLIGHTS_RELAY_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "relay ingest not configured" }, { status: 503 });
  }
  if (!relaySecretMatches(request.headers.get("x-relay-secret"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload exceeds 1 MB" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!isFetchResult(body)) {
    return NextResponse.json({ error: "payload does not match FetchResult shape" }, { status: 422 });
  }

  const { env } = await getCloudflareContext({ async: true });
  if (!env.CNX_FLIGHTS_KV) {
    return NextResponse.json({ error: "CNX_FLIGHTS_KV binding missing" }, { status: 500 });
  }
  await env.CNX_FLIGHTS_KV.put(FLIGHTS_KV_KEY, JSON.stringify(body), { expirationTtl: 300 });

  return NextResponse.json({ ok: true, airborne: body.airborne.length, ground: body.ground.length });
}
