import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { fetchCnxSnapshot } from "../../../../lib/cnx/opensky";
import { summariseOutbound } from "../../../../lib/cnx/outbound";
import { appendSnapshot } from "../../../../lib/cnx/snapshot-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RATE_LIMIT_KEY = "outbound_rate_limit";
const MIN_INTERVAL_MS = 60_000;

export async function GET() {
  const { env } = await getCloudflareContext({ async: true });
  if (env?.CNX_FLIGHTS_KV) {
    const lastStr = await env.CNX_FLIGHTS_KV.get(RATE_LIMIT_KEY);
    const last = Number(lastStr);
    if (Number.isFinite(last) && Date.now() - last < MIN_INTERVAL_MS) {
      return NextResponse.json({ error: "rate limited" }, { status: 429 });
    }
    await env.CNX_FLIGHTS_KV.put(RATE_LIMIT_KEY, String(Date.now()), { expirationTtl: 120 });
  }

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
  await appendSnapshot({
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