import { NextResponse } from "next/server";
import { fetchCnxSnapshot } from "../../../../lib/cnx/opensky";
import {
  summariseVisitors,
  recommendedCountriesForSocial,
  type VisitorAnalytics,
} from "../../../../lib/cnx/visitors";
import {
  appendSnapshot,
  readSnapshotForDay,
  type FlightSnapshot,
} from "../../../../lib/cnx/snapshot-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * CNX visitor analytics — turns the live OpenSky state vectors into
 * "X visitors today, Y from China/Japan/Korea, Z outbound" numbers
 * the governor can read on the wall.
 *
 * Combines:
 *   - Live snapshot (current flights over the CNX area)
 *   - Persisted snapshot store (last 24 h hourly buckets for trend)
 *   - The airline / aircraft fleet registry (see lib/cnx/visitors.ts)
 *
 * The result is what the dashboard's VisitorPanel renders, and what
 * the social-rail sidebar reads to decide which language feeds to
 * subscribe to (the recommended languages are surfaced in
 * `recommendedLanguages`).
 *
 * Persistence: each request appends a FlightSnapshot to the store so
 * the dashboard's 24-h trend line is preserved across restarts.
 */
export async function GET(): Promise<Response> {
  const ts = Date.now();
  const snapshot = await fetchCnxSnapshot();
  const today = new Date(ts).toISOString().slice(0, 10);
  const recent = await readSnapshotForDay(today);

  // Aggregate inbound visitors per hour over the past 24 h from
  // persisted snapshots. Each snapshot has airborne/ground counts —
  // we can't recover the per-flight breakdown retroactively, so the
  // hourly buckets are "snapshots-per-hour" → average visitors
  // proxy. The current poll adds to the current hour bucket for live
  // detail.
  const hourlyFromHistory = aggregateHourlyFromSnapshots(recent, ts);

  const analytics: VisitorAnalytics = summariseVisitors(
    [...snapshot.airborne, ...snapshot.ground],
    {
      ts,
      hourly: hourlyFromHistory,
    },
  );

  // Persist this snapshot for trend aggregation. The fields here are
  // the legacy FlightSnapshot shape (airborne/ground/byQuadrant/
  // topOrigins); the visitor analytics adds richer language fan-out.
  const flightSnap: FlightSnapshot = {
    ts,
    fetchedAt: snapshot.fetchedAt,
    airborne: analytics.inboundFlights,
    ground: snapshot.ground.length,
    byQuadrant: analytics.visitorsByHour.map((h) => ({ quadrant: `h${h.hour}`, count: h.inbound })),
    topOrigins: analytics.topOrigins.map((o) => ({ country: o.country, count: o.flights })),
  };
  // Fire-and-forget — appendSnapshot returns a promise but the API
  // response shouldn't wait on disk I/O.
  void appendSnapshot(flightSnap).catch((e) =>
    console.warn(`[visitors] snapshot append failed: ${(e as Error).message}`),
  );

  // Echo the recommended top-origin countries for the social rail.
  const socialCountries = recommendedCountriesForSocial(analytics);

  return NextResponse.json(
    { ...analytics, socialCountries },
    {
      headers: {
        "Cache-Control": "s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}

/**
 * Roll up the day's snapshots into 24 hourly buckets. Each snapshot
 * was captured at a known wall-clock time; we bucket by local-time
 * hour-of-day. The visitor estimate per snapshot is the inbound count
 * multiplied by the average fleet size (165 seats) — a coarse but
 * directionally correct trend.
 */
function aggregateHourlyFromSnapshots(
  snaps: FlightSnapshot[],
  now: number,
): { hour: number; visitors: number; inbound: number; outgoing: number }[] {
  const buckets: { hour: number; visitors: number; inbound: number; outgoing: number }[] = [];
  for (let h = 0; h < 24; h += 1) {
    buckets.push({ hour: h, visitors: 0, inbound: 0, outgoing: 0 });
  }
  // Trim to last 24 h.
  const cutoff = now - 24 * 60 * 60_000;
  for (const s of snaps) {
    if (s.ts < cutoff) continue;
    const hour = new Date(s.ts).getHours();
    const bucket = buckets[hour];
    if (!bucket) continue;
    // Estimate visitors from inbound flights × average fleet size.
    // Conservative: 165 seats (CNX is mostly narrow-body).
    bucket.inbound += s.airborne;
    bucket.visitors += s.airborne * 165;
  }
  return buckets;
}
