import { NextResponse } from "next/server";
import { fetchCnxSnapshot } from "../../../../lib/cnx/opensky";
import { summariseOutbound } from "../../../../lib/cnx/outbound";
import { appendSnapshot } from "../../../../lib/cnx/snapshot-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const snap = await fetchCnxSnapshot();
  const analysis = summariseOutbound(snap.airborne.concat(snap.ground));

  // Append to the persistent snapshot store. On Cloudflare Workers this
  // falls back to in-process Map (see snapshot-store.ts).
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