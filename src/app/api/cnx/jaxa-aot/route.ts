import { NextResponse } from "next/server";
import { fetchLatestAotItem } from "../../../../lib/cnx/jaxa-aot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The newest JAXA GCOM-C SGLI scene, walking back from today.
 *
 * Wired 2026-10-02 by operator decision — the licence gate in
 * docs/SOURCES.md §8 applied only to this wiring, and the gate is now
 * called. The catalogue is hit at most once per 30 min (server TTL) and
 * once per s-maxage at the edge; access is what generates JAXA's text
 * access log, so the route is deliberately a quiet tenant.
 *
 * What this deliberately is NOT: an AOT number. The value lives inside
 * the COG, and decoding a GeoTIFF is work the Workers runtime cannot do
 * (see lib/cnx/relay-kv.ts). This endpoint resolves WHICH scene exists,
 * its observation window, and the licence that travels with it — a panel
 * that drew a value from this response would be minting one.
 */
export async function GET() {
  // Chiang Mai, the same longitude the resolver's tests pin (98.98°E).
  const data = await fetchLatestAotItem(98.98);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" },
  });
}
