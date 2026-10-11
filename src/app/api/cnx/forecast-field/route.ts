import { NextResponse } from "next/server";
import { fetchForecastField } from "../../../../lib/cnx/wind-field";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 48-hour model field (wind 10 m / 850 hPa, rain, PM2.5) plus district outlook. */
export async function GET(): Promise<Response> {
  const data = await fetchForecastField();
  return NextResponse.json(data, { headers: { "Cache-Control": data.field ? "s-maxage=900" : "s-maxage=120" } });
}
