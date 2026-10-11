import { NextResponse } from "next/server";
import { fetchForecastField } from "../../../../lib/cnx/wind-field";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 48-hour model field (wind 10 m / 850 hPa, rain, PM2.5) plus district outlook. */
async function handle(): Promise<Response> {
  const data = await fetchForecastField();
  return NextResponse.json(data, { headers: { "Cache-Control": data.field ? "s-maxage=900" : "s-maxage=120" } });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle());
}
