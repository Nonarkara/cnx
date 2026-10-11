import { NextResponse } from "next/server";
import { fetchWeatherLayerUrls } from "../../../../lib/cnx/weather-layers";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Ready-to-use raster tile URL templates for the map's weather overlays
 * (rain radar, Himawari infrared, MODIS aerosol). See lib/cnx/weather-layers.ts
 * for why these need server-side time-slot resolution rather than a
 * fixed URL.
 */
async function handle(): Promise<Response> {
  const urls = await fetchWeatherLayerUrls();
  return NextResponse.json(urls, {
    headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=300" },
  });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle());
}
