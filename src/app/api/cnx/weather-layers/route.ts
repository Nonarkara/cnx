import { NextResponse } from "next/server";
import { fetchWeatherLayerUrls } from "../../../../lib/cnx/weather-layers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Ready-to-use raster tile URL templates for the map's weather overlays
 * (rain radar, Himawari infrared, MODIS aerosol). See lib/cnx/weather-layers.ts
 * for why these need server-side time-slot resolution rather than a
 * fixed URL.
 */
export async function GET(): Promise<Response> {
  const urls = await fetchWeatherLayerUrls();
  return NextResponse.json(urls, {
    headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=300" },
  });
}
