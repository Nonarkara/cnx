// TEMPORARY probe — delete once the FloodHub client is written.
//
// This route exists for one reason: CNX_FLOODHUB_KEY is a Worker secret and
// cannot be read from a dev machine, so the only place a FloodHub request can
// be signed is inside the Worker itself. It answers the one question that
// decides whether the integration is worth building at all:
//
//     are there real FloodHub gauges on the Ping near Chiang Mai?
//
// Google states plainly that API output must not be the sole source in an
// emergency, and that coverage is per-basin rather than per-country, so
// "Thailand is covered" says nothing about the Ping.
//
// Guarded by the existing x-relay-secret, NOT public. FloodHub terms limit
// API use to non-commercial; a civic dashboard qualifies, a paid
// commission would not. This route is deleted at the end of the exercise so
// no dependency on the key is left behind.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const API = "https://floodforecasting.googleapis.com/v1";

// Upper-north box, generously bounded: the Ping runs from Chiang Mai down
// through Lamphun, so a city-only box would understate coverage.
const BOX = { south: 17.2, north: 20.2, west: 97.0, east: 100.6 };

// The API's JSON is `loop: { vertices: [...] }` at top level — `search_by`
// in the reference is the proto union's name, not a JSON key. Vertices go
// counter-clockwise (S2 convention: interior on the left); clockwise would
// select the whole globe minus this box.
const LOOP = {
  vertices: [
    { latitude: BOX.north, longitude: BOX.west },
    { latitude: BOX.south, longitude: BOX.west },
    { latitude: BOX.south, longitude: BOX.east },
    { latitude: BOX.north, longitude: BOX.east },
  ],
};

interface Gauge {
  gaugeId?: string;
  location?: { latitude?: number; longitude?: number };
  siteName?: string;
  river?: string;
  source?: string;
  countryCode?: string;
  qualityVerified?: boolean;
  hasModel?: boolean;
}

const inBox = (g: Gauge) => {
  const lat = g.location?.latitude;
  const lon = g.location?.longitude;
  return typeof lat === "number" && typeof lon === "number" && lat >= BOX.south && lat <= BOX.north && lon >= BOX.west && lon <= BOX.east;
};

const CITY = { latitude: 18.79, longitude: 98.99 }; // Chiang Mai, Nawarat bridge on the Ping

function km(a: { latitude: number; longitude: number }, lat: number, lon: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x = Math.sin(rad(lat - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(lat)) * Math.sin(rad(lon - a.longitude) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

const tally = (xs: (string | boolean | undefined)[]) =>
  xs.reduce<Record<string, number>>((m, x) => ({ ...m, [String(x)]: (m[String(x)] ?? 0) + 1 }), {});

const summarise = (g: Gauge) => ({
  id: g.gaugeId,
  lat: g.location?.latitude,
  lon: g.location?.longitude,
  site: g.siteName,
  river: g.river,
  source: g.source,
  qualityVerified: g.qualityVerified,
  hasModel: g.hasModel,
});

async function search(key: string, by: Record<string, unknown>) {
  try {
    const res = await fetch(`${API}/gauges:searchGaugesByArea`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": key },
      // Include everything: a gauge without a Google hydro model is still a
      // real river reading and is exactly what we want to know about.
      body: JSON.stringify({ ...by, includeNonQualityVerified: true, includeGaugesWithoutHydroModel: true }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json()) as { gauges?: Gauge[]; error?: { message?: string } };
    if (body.error) return { status: res.status, error: body.error.message ?? "unknown error" };
    const gauges = body.gauges ?? [];
    const upperNorth = gauges.filter(inBox);
    const nearest = [...upperNorth]
      .map((g) => ({ ...summarise(g), kmFromCity: Math.round(km(CITY, g.location?.latitude ?? 0, g.location?.longitude ?? 0) * 10) / 10 }))
      .sort((a, b) => a.kmFromCity - b.kmFromCity)
      .slice(0, 12);
    return {
      status: res.status,
      total: gauges.length,
      upperNorth: upperNorth.length,
      bySource: tally(upperNorth.map((g) => g.source)),
      qualityVerified: tally(upperNorth.map((g) => g.qualityVerified)),
      hasModel: tally(upperNorth.map((g) => g.hasModel)),
      nearest,
    };
  } catch (e) {
    return { error: `threw: ${(e as Error).message}` };
  }
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CNX_FLIGHTS_RELAY_SECRET;
  if (!secret) return NextResponse.json({ error: "relay secret not configured" }, { status: 503 });
  if (request.headers.get("x-relay-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const key = process.env.CNX_FLOODHUB_KEY;
  if (!key) return NextResponse.json({ error: "CNX_FLOODHUB_KEY not set" }, { status: 503 });

  // Thailand by region code (one page, every gauge), filtered to the box.
  // The polygon search is kept as a cross-check; it also returns gauges in
  // the Myanmar/Lao part of the box and pages at 500, so its count differs.
  const [byRegion, byLoop] = await Promise.all([search(key, { regionCode: "TH" }), search(key, { loop: LOOP })]);

  // Latest flood status for the gauges nearest the city.
  let nearestStatus: unknown = null;
  const ids = ("nearest" in byRegion ? (byRegion.nearest ?? []) : []).map((g) => g.id).filter(Boolean);
  if (ids.length) {
    try {
      const q = ids.map((id) => `gaugeIds=${encodeURIComponent(String(id))}`).join("&");
      const res = await fetch(`${API}/floodStatus:queryLatestFloodStatusByGaugeIds?${q}`, {
        headers: { "X-goog-api-key": key },
        signal: AbortSignal.timeout(30_000),
      });
      nearestStatus = { status: res.status, body: await res.json() };
    } catch (e) {
      nearestStatus = { error: `threw: ${(e as Error).message}` };
    }
  }
  const loopSummary = "total" in byLoop ? { status: byLoop.status, total: byLoop.total, bySource: byLoop.bySource } : byLoop;
  return NextResponse.json({ keyPresent: true, byRegion, byLoop: loopSummary, nearestStatus });
}
