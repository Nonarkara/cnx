import { NextResponse } from "next/server";
import { fetchCnxSnapshot } from "../../../../lib/cnx/opensky";
import {
  summariseVisitors,
  recommendedCountriesForSocial,
  type VisitorAnalytics,
} from "../../../../lib/cnx/visitors";
import {
  appendVisitorSnapshot,
  readVisitorSnapshotsForDay,
} from "../../../../lib/cnx/visitors-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * CNX visitor analytics — turns the live OpenSky state vectors into
 * "X visitors today, Y from China/Japan/Korea, Z outbound" numbers
 * the governor can read on the wall.
 *
 * Combines:
 *   - Live snapshot (current flights over the CNX area)
 *   - Persisted visitor-snapshot store (last 24 h hourly buckets for
 *     trend) — its own archive (visitors-store.ts), deliberately not
 *     the shared flight-snapshots one outbound.ts writes to: that
 *     store's `airborne` field means "total airborne in the bbox"
 *     there, but would mean "inbound-to-VTCC only" here — writing
 *     both under the same field silently corrupts the shared archive.
 *   - The airline / aircraft fleet registry (see lib/cnx/visitors.ts)
 *
 * The result is what the dashboard's VisitorPanel renders, and what
 * the social-rail sidebar reads to decide which language feeds to
 * subscribe to (the recommended languages are surfaced in
 * `recommendedLanguages`).
 */
export async function GET(): Promise<Response> {
  const ts = Date.now();
  const snapshot = await fetchCnxSnapshot();
  const today = new Date(ts).toISOString().slice(0, 10);
  const recent = await readVisitorSnapshotsForDay(today);

  const hourlyFromHistory = aggregateHourlyFromHistory(recent, ts);

  const analytics: VisitorAnalytics = summariseVisitors(
    [...snapshot.airborne, ...snapshot.ground],
    {
      ts,
      hourly: hourlyFromHistory,
    },
  );

  // Fire-and-forget — persistence shouldn't block the response.
  void appendVisitorSnapshot(analytics).catch((e) =>
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
 * Roll up a day's persisted polls into 24 hourly buckets. Each poll's
 * own `visitorsByHour` entry for ITS OWN recorded hour is the real
 * point-in-time observation (the other 23 entries in that poll's array
 * are zeroed padding from summariseVisitors' fixed 24-slot shape) — so
 * for each historical poll we pull just that one real hour, and take
 * the latest observation per hour across the day's polls.
 */
function aggregateHourlyFromHistory(
  rows: { recordedAt: number; analytics: VisitorAnalytics }[],
  now: number,
): { hour: number; visitors: number; inbound: number; outgoing: number }[] {
  const buckets = new Map<number, { visitors: number; inbound: number; outgoing: number; recordedAt: number }>();
  for (let h = 0; h < 24; h += 1) buckets.set(h, { visitors: 0, inbound: 0, outgoing: 0, recordedAt: 0 });

  const cutoff = now - 24 * 60 * 60_000;
  for (const row of rows) {
    if (row.recordedAt < cutoff) continue;
    const hour = new Date(row.recordedAt).getHours();
    const own = row.analytics.visitorsByHour.find((b) => b.hour === hour);
    if (!own) continue;
    const existing = buckets.get(hour);
    if (existing && row.recordedAt >= existing.recordedAt) {
      buckets.set(hour, { visitors: own.visitors, inbound: own.inbound, outgoing: own.outgoing, recordedAt: row.recordedAt });
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, b]) => ({ hour, visitors: b.visitors, inbound: b.inbound, outgoing: b.outgoing }));
}
