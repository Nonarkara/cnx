import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { fetchCnxSnapshot } from "../../../../lib/cnx/opensky";
import { summariseOutbound } from "../../../../lib/cnx/outbound";
import { appendSnapshot } from "../../../../lib/cnx/snapshot-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Throttles the trend-history WRITE (appendSnapshot → KV), not the answer.
// It used to 429 the whole request with one global key, so a second viewer
// within a minute — or a refresh — got an empty outbound panel.
const RATE_LIMIT_KEY = "outbound_rate_limit";
const MIN_INTERVAL_MS = 60_000;

async function shouldRecordSnapshot(): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  if (!env?.CNX_FLIGHTS_KV) return true;
  const last = Number(await env.CNX_FLIGHTS_KV.get(RATE_LIMIT_KEY));
  if (Number.isFinite(last) && Date.now() - last < MIN_INTERVAL_MS) return false;
  await env.CNX_FLIGHTS_KV.put(RATE_LIMIT_KEY, String(Date.now()), { expirationTtl: 120 });
  return true;
}

export async function GET() {
  const snap = await fetchCnxSnapshot();
  const analysis = summariseOutbound(snap.airborne.concat(snap.ground));

  const all = [...snap.airborne, ...snap.ground];
  const byQuadrant = analysis.byQuadrant.map((q) => ({ quadrant: q.quadrant, count: q.count }));
  const topOrigins = new Map<string, number>();
  for (const s of all) {
    const c = s.originCountry ?? "";
    if (!c) continue;
    topOrigins.set(c, (topOrigins.get(c) ?? 0) + 1);
  }
  const topOriginsArr = [...topOrigins.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([country, count]) => ({ country, count }));
  if (await shouldRecordSnapshot()) await appendSnapshot({
    ts: Date.now(),
    fetchedAt: snap.fetchedAt,
    airborne: analysis.totalAirborne,
    ground: analysis.totalGround,
    byQuadrant,
    topOrigins: topOriginsArr,
  });

  return NextResponse.json(analysis, {
    headers: { "Cache-Control": "s-maxage=15, stale-while-revalidate=30" },
  });
}