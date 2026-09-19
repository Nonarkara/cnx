// CNX visitor-arrivals estimate — real scheduled/ADS-B arrival
// records at Chiang Mai International (ICAO: VTCC), turned into an
// estimated overseas-visitor headcount for today / yesterday / the
// day before.
//
// The flight records themselves are real: OpenSky's
// /api/flights/arrival?airport=VTCC endpoint returns actual observed
// arrivals (icao24, callsign, origin airport, first/last-seen times) —
// not a simulation. What's estimated is the PASSENGER COUNT per
// flight, because no public source publishes real load factors or
// manifests for Thai domestic carriers. We multiply each flight's
// aircraft-type seat capacity (lib/cnx/aircraft.ts) by a fixed load
// factor documented below. Treat "estimatedVisitors" as an order-of-
// magnitude planning number, not a precise count — the flight count
// and the country breakdown are the trustworthy parts.
//
// Persisted daily (see arrivals-store.ts) so a year of accumulated
// arrivals data exists for later custom analysis, per the governor's
// office request — the live 3-day view here is a read of the same
// pipeline, not a separate one-off computation.

import { OPENSKY_BASE, getAccessToken, fetchAircraftMetadata } from "./opensky";
import { lookupAircraft } from "./aircraft";
import { isThaiAirport, lookupAirport } from "./airports";
import { readArrivalsFromKv } from "./arrivals-kv";

const AIRPORT_ICAO = "VTCC"; // Chiang Mai International

// Industry-average international short/medium-haul load factor
// (IATA Asia-Pacific figures typically run 78-85%). Documented,
// single source of truth — change here, not per call site.
export const ASSUMED_LOAD_FACTOR = 0.82;

export interface OpenSkyArrival {
  icao24: string;
  firstSeen: number;
  estDepartureAirport: string | null;
  lastSeen: number;
  estArrivalAirport: string | null;
  callsign: string | null;
}

export interface CountryArrivals {
  country: string;
  flights: number;
  estimatedVisitors: number;
}

export interface DayArrivals {
  /** YYYY-MM-DD, Asia/Bangkok. */
  date: string;
  totalFlights: number;
  internationalFlights: number;
  domesticFlights: number;
  estimatedVisitors: number;
  byCountry: CountryArrivals[];
}

export interface ArrivalsResponse {
  generatedAt: string;
  methodology: string;
  days: DayArrivals[]; // [today, yesterday, day-before-yesterday]
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60_000;

/** [start, end) unix seconds for a given Asia/Bangkok calendar day,
 *  `daysAgo` days before today. */
function bangkokDayRange(daysAgo: number): { date: string; startSec: number; endSec: number } {
  const nowBangkok = new Date(Date.now() + BANGKOK_OFFSET_MS);
  const y = nowBangkok.getUTCFullYear();
  const m = nowBangkok.getUTCMonth();
  const d = nowBangkok.getUTCDate() - daysAgo;
  const startUtcMs = Date.UTC(y, m, d) - BANGKOK_OFFSET_MS;
  const endUtcMs = startUtcMs + 24 * 60 * 60_000;
  const date = new Date(startUtcMs + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
  return { date, startSec: Math.floor(startUtcMs / 1000), endSec: Math.floor(endUtcMs / 1000) };
}

async function fetchArrivalsWindow(startSec: number, endSec: number): Promise<OpenSkyArrival[]> {
  const token = await getAccessToken();
  const url = new URL(`${OPENSKY_BASE}/flights/arrival`);
  url.searchParams.set("airport", AIRPORT_ICAO);
  url.searchParams.set("begin", String(startSec));
  url.searchParams.set("end", String(endSec));
  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "cnx-dashboard/0.1 (https://cnx.nonarkara.org)",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) return []; // OpenSky returns 404 for "no flights in range"
  if (!res.ok) throw new Error(`opensky flights/arrival ${res.status}`);
  const json = (await res.json()) as OpenSkyArrival[] | null;
  return json ?? [];
}

/** Pure: turns one day's raw arrival records into the per-day summary. */
export function summariseArrivalRecords(
  date: string,
  arrivals: OpenSkyArrival[],
  typecodeByIcao: Map<string, string | undefined>,
): DayArrivals {
  const byCountry = new Map<string, { flights: number; estimatedVisitors: number }>();
  let internationalFlights = 0;
  let domesticFlights = 0;
  let estimatedVisitors = 0;

  for (const a of arrivals) {
    const origin = a.estDepartureAirport;
    const seats = lookupAircraft(typecodeByIcao.get(a.icao24)).seats;
    const visitors = Math.round(seats * ASSUMED_LOAD_FACTOR);
    if (isThaiAirport(origin)) {
      domesticFlights += 1;
      continue; // domestic arrivals aren't "overseas visitors"
    }
    internationalFlights += 1;
    estimatedVisitors += visitors;
    const { country } = lookupAirport(origin);
    const entry = byCountry.get(country) ?? { flights: 0, estimatedVisitors: 0 };
    entry.flights += 1;
    entry.estimatedVisitors += visitors;
    byCountry.set(country, entry);
  }

  return {
    date,
    totalFlights: arrivals.length,
    internationalFlights,
    domesticFlights,
    estimatedVisitors,
    byCountry: [...byCountry.entries()]
      .map(([country, v]) => ({ country, ...v }))
      .sort((a, b) => b.estimatedVisitors - a.estimatedVisitors),
  };
}

export interface ArrivalsWindow {
  /** YYYY-MM-DD, Asia/Bangkok. */
  date: string;
  arrivals: OpenSkyArrival[];
}

/** Pure: raw per-day arrival records + aircraft types → the API response.
 *  Shared by the direct OpenSky path and the relay-ingest path so both
 *  produce identical numbers. */
export function buildArrivalsResponse(
  windows: ArrivalsWindow[],
  typecodeByIcao: Map<string, string | undefined>,
  generatedAt = new Date().toISOString(),
): ArrivalsResponse {
  return {
    generatedAt,
    methodology: `International arrivals at VTCC (Chiang Mai Intl). Visitor counts are estimated as seat capacity × ${Math.round(ASSUMED_LOAD_FACTOR * 100)}% assumed load factor — flight counts and origin countries are real observed data; passenger counts are not.`,
    days: windows.map((w) => summariseArrivalRecords(w.date, w.arrivals, typecodeByIcao)),
  };
}

export async function fetchCnxArrivals(): Promise<ArrivalsResponse> {
  // Production path: OpenSky is unreachable from Cloudflare's network
  // (see flights/ingest/route.ts), so the off-Cloudflare relay computes
  // nothing itself — it pushes raw arrival records, the ingest route
  // builds the response with buildArrivalsResponse() and stores it in KV.
  const fromKv = await readArrivalsFromKv();
  if (fromKv) return fromKv;

  // Local dev / non-Cloudflare deploy: ask OpenSky directly.
  const windows = [0, 1, 2].map((d) => bangkokDayRange(d));
  const rawByWindow = await Promise.all(
    windows.map((w) => fetchArrivalsWindow(w.startSec, w.endSec).catch(() => [] as OpenSkyArrival[])),
  );
  const icao24s = [...new Set(rawByWindow.flat().map((a) => a.icao24))];
  const typecodeByIcao = new Map<string, string | undefined>();
  try {
    // OpenSky's /aircraft accepts a comma-separated batch; keep well
    // under any practical URL-length limit.
    for (let i = 0; i < icao24s.length; i += 50) {
      const batch = icao24s.slice(i, i + 50);
      const meta = await fetchAircraftMetadata(batch);
      for (const m of meta) typecodeByIcao.set(m.icao24, m.typecode);
    }
  } catch (e) {
    console.warn(`[arrivals] aircraft metadata batch failed: ${(e as Error).message}`);
  }

  return buildArrivalsResponse(
    windows.map((w, i) => ({ date: w.date, arrivals: rawByWindow[i] })),
    typecodeByIcao,
  );
}
