import { NextResponse } from "next/server";
import { fetchCnxFires } from "../../../../lib/cnx/fires";
import { computeTrajectories, type HotspotPoint, type WindVector } from "../../../../lib/cnx/smoke-trajectory";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * CNX /api/cnx/smoke-trajectory — where is the smoke going?
 *
 * Reads FIRMS hotspots within a 250 km radius of CNX centre, pulls
 * surface wind from Open-Meteo, and returns a straight-line plume
 * prediction for each hotspot at t=1h, 3h, 6h. Operator reads "where
 * is the smoke coming from" — actionable during burning season when
 * PM2.5 in CNX spikes and the basin model says "transboundary feed".
 *
 * Note: straight-line advection, no turbulence/mixing/deposition.
 * The methodology string in the response carries the honest disclaimer.
 *
 * Cache: 10 min in-process.
 */
const RADIUS_KM = 250;

function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function fetchWind(): Promise<WindVector | null> {
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=18.788&longitude=98.985&current=wind_speed_10m,wind_direction_10m&timezone=Asia%2FBangkok";
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      current?: { wind_speed_10m?: number; wind_direction_10m?: number };
    };
    const mps = j.current?.wind_speed_10m;
    const dir = j.current?.wind_direction_10m;
    if (typeof mps !== "number" || typeof dir !== "number") return null;
    return { speedKmh: Math.round(mps * 3.6 * 10) / 10, fromDirectionDeg: Math.round(dir) };
  } catch {
    return null;
  }
}

export async function GET(): Promise<Response> {
  const fires = await fetchCnxFires();
  const wind = await fetchWind();
  const cnxCenter = { latitude: 18.788, longitude: 98.985 };
  // Filter to a 250 km radius — local burning matters less than the
  // transboundary feed during haze season, but we keep the CNX bbox
  // hotspots so the operator can see "is it us or them?".
  const hotspots: HotspotPoint[] = fires.hotspots
    .filter(
      (h) => distKm(cnxCenter.latitude, cnxCenter.longitude, h.latitude, h.longitude) <= RADIUS_KM,
    )
    .map((h) => ({
      id: h.id,
      latitude: h.latitude,
      longitude: h.longitude,
      satellite: h.satellite,
      frp: h.frp,
      detectedAt: h.detectedAt,
    }));
  const trajectory = computeTrajectories(hotspots, wind);
  return NextResponse.json(trajectory, {
    headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" },
  });
}
