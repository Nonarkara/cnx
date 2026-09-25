import { NextResponse } from "next/server";
import { fetchAircraftMetadata } from "../../../../lib/cnx/opensky";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_ICAO_BATCH = 20;

/**
 * Aircraft metadata lookup. Proxies OpenSky's /api/aircraft on the
 * server side: one call per request, multiple icao24s comma-separated.
 * The result is cached forever client-side, so subsequent polls do not
 * re-fetch a known aircraft.
 *
 * Anonymous-tier cost: 1 OpenSky credit per request, regardless of
 * batch size — keep the batch ≤ 20 to stay within budget on a wall
 * with many viewers. Authenticated automatically when
 * OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET are configured.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const icao24 = url.searchParams.get("icao24");
  if (!icao24) {
    return NextResponse.json({ error: "icao24 is required" }, { status: 400 });
  }
  const codes = icao24.split(",").map((s) => s.trim()).filter(Boolean);
  if (codes.length === 0) {
    return NextResponse.json({ error: "icao24 must contain at least one ICAO code" }, { status: 400 });
  }
  if (codes.length > MAX_ICAO_BATCH) {
    return NextResponse.json({ error: `icao24 batch exceeds ${MAX_ICAO_BATCH}` }, { status: 400 });
  }
  try {
    const aircraft = await fetchAircraftMetadata(codes);
    return NextResponse.json(
      { aircraft },
      { headers: { "Cache-Control": "s-maxage=86400" } },
    );
  } catch (e) {
    console.warn(`[aircraft] upstream failed: ${(e as Error).message}`);
    return NextResponse.json({ aircraft: [] }, { status: 200 });
  }
}
