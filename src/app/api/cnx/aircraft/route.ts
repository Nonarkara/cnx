import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface AircraftMeta {
  icao24: string;
  typecode?: string;
  registration?: string;
  manufacturerName?: string;
  model?: string;
}

interface OpenSkyAircraftResponse {
  [icao24: string]: AircraftMeta | null;
}

/**
 * Aircraft metadata lookup. Proxies OpenSky's /api/aircraft on the
 * server side: one call per request, multiple icao24s comma-separated.
 * The result is cached forever client-side, so subsequent polls do not
 * re-fetch a known aircraft.
 *
 * Anonymous-tier cost: 1 OpenSky credit per request, regardless of
 * batch size — keep the batch ≤ 20 to stay within budget on a wall
 * with many viewers.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const icao24 = url.searchParams.get("icao24");
  if (!icao24) {
    return NextResponse.json({ error: "icao24 is required" }, { status: 400 });
  }
  const upstream = new URL("https://opensky-network.org/api/aircraft");
  upstream.searchParams.set("icao24", icao24);
  try {
    const res = await fetch(upstream.toString(), {
      headers: { "User-Agent": "cnx-dashboard/0.1 (https://cnx.nonarkara.org)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      // Anonymous rate limit hit or upstream issue. Return empty rather
      // than breaking the page; the cache will retry on the next poll.
      return NextResponse.json({ aircraft: [] }, { status: 200 });
    }
    const json = (await res.json()) as OpenSkyAircraftResponse;
    const aircraft: AircraftMeta[] = [];
    for (const id of icao24s(icao24)) {
      const v = json[id];
      if (v) aircraft.push({ icao24: id, typecode: v.typecode, registration: v.registration, manufacturerName: v.manufacturerName, model: v.model });
    }
    return NextResponse.json(
      { aircraft },
      { headers: { "Cache-Control": "s-maxage=86400" } },
    );
  } catch (e) {
    console.warn(`[aircraft] upstream failed: ${(e as Error).message}`);
    return NextResponse.json({ aircraft: [] }, { status: 200 });
  }
}

function* icao24s(joined: string): Generator<string> {
  for (const part of joined.split(",")) {
    const t = part.trim();
    if (t) yield t;
  }
}
