import { NextResponse } from "next/server";
import { fetchSmokeTrajectory } from "../../../../lib/cnx/smoke-feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * CNX /api/cnx/smoke-trajectory — where is the smoke going?
 *
 * Reads a live VIIRS pass inside a 350 km window (Chiang Mai, Shan State,
 * northern Laos), pulls surface wind from Open-Meteo, and returns a
 * straight-line plume for each hotspot at t=1h, 3h, 6h.
 *
 * Illustrated province hotspots are not advected. When FIRMS does not
 * answer, provenance is "unavailable" and segments are empty.
 *
 * Straight-line advection only — the methodology string says so.
 * Cache: 10 min in-process.
 */
export async function GET(): Promise<Response> {
  const trajectory = await fetchSmokeTrajectory();
  return NextResponse.json(trajectory, {
    headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" },
  });
}
