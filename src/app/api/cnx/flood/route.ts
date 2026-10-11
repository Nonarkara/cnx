import { NextResponse } from "next/server";
import { fetchCnxFlood } from "../../../../lib/cnx/flood";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * No figures by default — the flood desk reads its live parts from their own
 * routes. `?scenario=<id>` returns a drill, labelled as one (see flood.ts).
 */
export async function GET(request: Request) {
  const scenarioId = new URL(request.url).searchParams.get("scenario");
  const data = await fetchCnxFlood(scenarioId);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" },
  });
}
