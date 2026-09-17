// CNX visitor analytics — turns the OpenSky state vectors into
// "X visitors today, Y from China/Japan/Korea, Z outbound" numbers
// that the governor can read on the wall.
//
// The pipeline:
//
//   1. Pull live flights within the CNX bbox via /api/cnx/flights.
//   2. For each flight, classify:
//        - Airline (from 3-letter callsign prefix)
//        - Country of operator (proxy for visitor origin)
//        - Aircraft size bucket (from operator's typical fleet —
//          OpenSky anonymous tier does NOT expose the airframe
//          typecode, so we use the airline's well-known fleet mix
//          as the seat estimator)
//   3. Aggregate per hour + per country.
//   4. Persist hourly snapshots to disk for trend aggregation.
//
// The "today's visitors" number is the rolling 24-h sum of estimated
// seats for flights classified as inbound (heading toward VTCC) — see
// classifyInboundOutbound().
//
// For accuracy, the callsign/airline lookup is the part most likely
// to drift. When a new airline starts flying to CNX, add an entry to
// AIRLINE_BY_CALLSIGN_PREFIX. The country it maps to is the visitor
// origin, NOT the airline's hub country (most CNX visitors fly point-
// to-point from their country, and the airline tends to be registered
// either at the origin or the destination).

import type { FlightState } from "./opensky";
import { fetchCnxSocialMultilingual } from "./social";

/** Airline fleet-size mix. CNX is mostly narrow-body / regional. */
export type FleetSize = "regional" | "narrow" | "wide" | "heavy";
export const FLEET_SEATS: Record<FleetSize, number> = {
  // Conservative averages so the dashboard never oversells the gate.
  regional: 78,   // ATR 72, Q400
  narrow: 165,    // A320 family, B737 family
  wide: 305,      // A330, B777-200, B787-8
  heavy: 410,     // A350, B777-300, B747
};

/**
 * Airline registry — 3-letter ICAO callsign prefix → airline, country,
 * fleet mix. The country field is the proxy for visitor origin (the
 * airline's registration country is usually the home market for the
 * route). Add new entries here when a new carrier starts flying to CNX.
 */
export const AIRLINE_BY_CALLSIGN_PREFIX: Record<
  string,
  { name: string; country: string; fleet: FleetSize }
> = {
  // ─── Thai carriers (domestic + regional hub at BKK / CNX) ───
  TG: { name: "Thai Airways", country: "Thailand", fleet: "wide" },
  WE: { name: "Thai Smile", country: "Thailand", fleet: "narrow" },
  PG: { name: "Bangkok Airways", country: "Thailand", fleet: "narrow" },
  DD: { name: "Nok Air", country: "Thailand", fleet: "narrow" },
  FD: { name: "Thai AirAsia", country: "Thailand", fleet: "narrow" },
  SL: { name: "Thai Lion Air", country: "Thailand", fleet: "narrow" },

  // ─── China ───
  CA: { name: "Air China", country: "China", fleet: "wide" },
  MU: { name: "China Eastern", country: "China", fleet: "wide" },
  CZ: { name: "China Southern", country: "China", fleet: "wide" },
  HU: { name: "Hainan Airlines", country: "China", fleet: "narrow" },
  ZH: { name: "Shenzhen Airlines", country: "China", fleet: "narrow" },
  MF: { name: "Xiamen Airlines", country: "China", fleet: "narrow" },
  "9C": { name: "Spring Airlines", country: "China", fleet: "narrow" },
  HO: { name: "Juneyao Airlines", country: "China", fleet: "narrow" },

  // ─── Japan / Korea ───
  JL: { name: "Japan Airlines", country: "Japan", fleet: "wide" },
  NH: { name: "All Nippon Airways", country: "Japan", fleet: "wide" },
  KE: { name: "Korean Air", country: "South Korea", fleet: "wide" },
  OZ: { name: "Asiana", country: "South Korea", fleet: "wide" },
  LJ: { name: "Jin Air", country: "South Korea", fleet: "narrow" },
  TW: { name: "T'way Air", country: "South Korea", fleet: "narrow" },
  "7C": { name: "Jeju Air", country: "South Korea", fleet: "narrow" },

  // ─── Southeast Asia ───
  SQ: { name: "Singapore Airlines", country: "Singapore", fleet: "wide" },
  MI: { name: "SilkAir", country: "Singapore", fleet: "narrow" },
  TR: { name: "Scoot", country: "Singapore", fleet: "narrow" },
  MH: { name: "Malaysia Airlines", country: "Malaysia", fleet: "wide" },
  AK: { name: "AirAsia", country: "Malaysia", fleet: "narrow" },
  PR: { name: "Philippine Airlines", country: "Philippines", fleet: "wide" },
  "5J": { name: "Cebu Pacific", country: "Philippines", fleet: "narrow" },
  VN: { name: "Vietnam Airlines", country: "Vietnam", fleet: "narrow" },
  VJ: { name: "VietJet Air", country: "Vietnam", fleet: "narrow" },
  QV: { name: "Lao Airlines", country: "Laos", fleet: "narrow" },
  "8M": { name: "Myanmar Airways", country: "Myanmar", fleet: "narrow" },

  // ─── South Asia ───
  AI: { name: "Air India", country: "India", fleet: "wide" },
  "6E": { name: "IndiGo", country: "India", fleet: "narrow" },

  // ─── Middle East / Europe ───
  EK: { name: "Emirates", country: "UAE", fleet: "heavy" },
  QR: { name: "Qatar Airways", country: "Qatar", fleet: "wide" },
  TK: { name: "Turkish Airlines", country: "Turkey", fleet: "wide" },
  LH: { name: "Lufthansa", country: "Germany", fleet: "heavy" },

  // ─── Hong Kong / Taiwan ───
  CX: { name: "Cathay Pacific", country: "Hong Kong", fleet: "wide" },
  BR: { name: "EVA Air", country: "Taiwan", fleet: "wide" },
  CI: { name: "China Airlines", country: "Taiwan", fleet: "wide" },
};

/** Country → ISO 639-1 codes we have RSS feeds for. */
const COUNTRY_TO_LANGS: Record<string, string[]> = {
  China: ["zh"],
  Japan: ["ja"],
  "South Korea": ["ko"],
  Singapore: ["en"],
  Malaysia: ["en"],
  India: ["en"],
  Taiwan: ["zh"],
  "Hong Kong": ["zh", "en"],
  Thailand: ["th"],
  Vietnam: ["en"],
  Myanmar: ["en"],
  Laos: ["en"],
  Philippines: ["en"],
  Indonesia: ["en"],
  UAE: ["en"],
  Qatar: ["en"],
  Turkey: ["en"],
  Germany: ["de"],
  "United Kingdom": ["en"],
  France: ["fr"],
  Russia: ["ru"],
  Australia: ["en"],
  "United States": ["en"],
};

interface ClassifiedFlight {
  icao24: string;
  callsign: string;
  airline: string | null;
  country: string;
  fleet: FleetSize;
  estimatedSeats: number;
  /** True if the heading is into CNX (toward VTCC). */
  inbound: boolean;
  /** ms epoch of the snapshot. */
  ts: number;
  /** Compass direction the flight is heading. */
  headingDeg: number | null;
}

function classifyAirline(callsign: string): { name: string; country: string; fleet: FleetSize } | null {
  const cleaned = callsign.trim().toUpperCase();
  if (cleaned.length < 3) return null;
  // Try 3-letter, then 2-letter (some smaller carriers use 2).
  for (const len of [3, 2]) {
    const prefix = cleaned.slice(0, len);
    const airline = AIRLINE_BY_CALLSIGN_PREFIX[prefix];
    if (airline) return airline;
  }
  return null;
}

function classifyInboundOutbound(state: FlightState): { inbound: boolean; headingDeg: number | null } {
  // CNX airport sits at (98.9853, 18.7883). A flight is "inbound" if
  // it's heading roughly toward VTCC — i.e. the bearing from its current
  // position to the airport is within ±60° of the flight's true_track.
  if (state.onGround || state.longitude === null || state.latitude === null || state.trueTrack === null) {
    return { inbound: false, headingDeg: state.trueTrack ?? null };
  }
  // Quick great-circle bearing to VTCC.
  const dLon = (98.9853 - state.longitude) * Math.cos((state.latitude * Math.PI) / 180) * 111.32;
  const dLat = (18.7883 - state.latitude) * 111.32;
  const bearingToAirport = (Math.atan2(dLon, dLat) * 180) / Math.PI;
  const normBearing = ((bearingToAirport + 360) % 360);
  const normTrack = ((state.trueTrack + 360) % 360);
  const diff = Math.min(Math.abs(normBearing - normTrack), 360 - Math.abs(normBearing - normTrack));
  return {
    inbound: diff < 60,
    headingDeg: state.trueTrack,
  };
}

function classifyFlight(state: FlightState, ts: number): ClassifiedFlight | null {
  const callsign = state.callsign?.trim();
  if (!callsign) return null;
  const airline = classifyAirline(callsign);
  const { inbound, headingDeg } = classifyInboundOutbound(state);
  const fleet = airline?.fleet ?? "narrow";
  return {
    icao24: state.icao24,
    callsign,
    airline: airline?.name ?? null,
    country: airline?.country ?? state.originCountry ?? "Unknown",
    fleet,
    estimatedSeats: FLEET_SEATS[fleet],
    inbound,
    ts,
    headingDeg,
  };
}

export interface VisitorOrigin {
  country: string;
  /** Estimated inbound visitors today from this country. */
  visitors: number;
  flights: number;
  airlines: string[];
  /** ISO 639-1 codes we should subscribe to in the social rail. */
  languages: string[];
}

export interface VisitorAnalytics {
  generatedAt: string;
  /** Rolling 24-h inbound visitor estimate. */
  visitorsToday: number;
  /** Distinct inbound flights in the current snapshot. */
  inboundFlights: number;
  /** Aircraft currently on the ground at CNX (rough "departures staging"). */
  groundOps: number;
  topOrigins: VisitorOrigin[];
  recommendedLanguages: string[];
  /** Hourly bucket — last 24 h, bucketed by hour-of-day (local time). */
  visitorsByHour: { hour: number; visitors: number; inbound: number; outgoing: number }[];
  airlineMix: { airline: string; country: string; flights: number; visitors: number }[];
  /** "What did we just count?" — short memo for the UI. */
  methodology: string;
}

/**
 * Summarise a list of OpenSky flight states into visitor analytics.
 * Caller passes a list of (state, ts) pairs to keep this pure — the
 * snapshot persistence layer in `/api/cnx/visitors` collects them
 * over time and calls this with the rolling window.
 */
export function summariseVisitors(
  states: FlightState[],
  options: { ts?: number; hourly?: { hour: number; visitors: number; inbound: number; outgoing: number }[] } = {},
): VisitorAnalytics {
  const ts = options.ts ?? Date.now();
  const hourlyIn = new Map<number, { visitors: number; inbound: number; outgoing: number }>();
  for (let h = 0; h < 24; h += 1) hourlyIn.set(h, { visitors: 0, inbound: 0, outgoing: 0 });

  // Optional hourly history passed in by the caller (persisted snapshots).
  // These are the truth — the current poll adds to whatever bucket the
  // current local hour falls into.
  if (options.hourly) {
    for (const row of options.hourly) hourlyIn.set(row.hour, { ...row });
  }

  const currentHour = new Date(ts).getHours();
  const byCountry = new Map<string, { visitors: number; flights: number; airlines: Set<string> }>();
  const byAirline = new Map<string, { country: string; flights: number; visitors: number }>();
  let inboundFlights = 0;
  let groundOps = 0;
  let visitorsToday = 0;
  const currentBucket = hourlyIn.get(currentHour)!;

  for (const s of states) {
    const classified = classifyFlight(s, ts);
    if (!classified) continue;
    if (s.onGround) {
      groundOps += 1;
      continue;
    }
    if (classified.inbound) {
      inboundFlights += 1;
      visitorsToday += classified.estimatedSeats;
      currentBucket.inbound += 1;
      currentBucket.visitors += classified.estimatedSeats;
      const bucket = byCountry.get(classified.country) ?? { visitors: 0, flights: 0, airlines: new Set<string>() };
      bucket.visitors += classified.estimatedSeats;
      bucket.flights += 1;
      if (classified.airline) bucket.airlines.add(classified.airline);
      byCountry.set(classified.country, bucket);

      if (classified.airline) {
        const ab = byAirline.get(classified.airline) ?? { country: classified.country, flights: 0, visitors: 0 };
        ab.flights += 1;
        ab.visitors += classified.estimatedSeats;
        byAirline.set(classified.airline, ab);
      }
    } else {
      currentBucket.outgoing += 1;
    }
  }

  // Build the top origins list — sort by visitors desc, take top 8,
  // attach language fan-out for the social rail.
  const topOrigins: VisitorOrigin[] = [...byCountry.entries()]
    .sort((a, b) => b[1].visitors - a[1].visitors)
    .slice(0, 8)
    .map(([country, b]) => ({
      country,
      visitors: b.visitors,
      flights: b.flights,
      airlines: [...b.airlines].sort(),
      languages: COUNTRY_TO_LANGS[country] ?? ["en"],
    }));

  // Compute the union of recommended languages for the social rail.
  // This drives fetchCnxSocialMultilingual — the top-N origin countries
  // automatically expand the language fan-out.
  const recommendedLanguages = [...new Set(topOrigins.flatMap((o) => o.languages))].sort();
  // Always include English as a baseline.
  if (!recommendedLanguages.includes("en")) recommendedLanguages.push("en");

  const airlineMix = [...byAirline.entries()]
    .sort((a, b) => b[1].visitors - a[1].visitors)
    .slice(0, 10)
    .map(([airline, b]) => ({ airline, country: b.country, flights: b.flights, visitors: b.visitors }));

  return {
    generatedAt: new Date(ts).toISOString(),
    visitorsToday,
    inboundFlights,
    groundOps,
    topOrigins,
    recommendedLanguages,
    visitorsByHour: [...hourlyIn.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hour, b]) => ({ hour, ...b })),
    airlineMix,
    methodology:
      "Seats estimated from airline's typical fleet (regional 78 / narrow 165 / wide 305 / heavy 410). " +
      "Inbound = heading within 60° of VTCC. Hourly buckets are local time.",
  };
}

/**
 * Convenience — call the social multilingual subscription with the
 * top origin countries. Returns a Set of country names so the API
 * route can also surface it to the front end.
 */
export function recommendedCountriesForSocial(analytics: VisitorAnalytics): string[] {
  return analytics.topOrigins.slice(0, 5).map((o) => o.country);
}

/**
 * Sanity check at module load — if we have ZERO entries in the
 * airline table, something has gone wrong with the build (a wildcard
 * import resolving to {}).
 */
if (Object.keys(AIRLINE_BY_CALLSIGN_PREFIX).length < 30) {
  console.warn(`[visitors] airline registry thin (${Object.keys(AIRLINE_BY_CALLSIGN_PREFIX).length} entries)`);
}

// re-export so callers can compose fetchCnxSocialMultilingual(topCountries) without an extra import.
export { fetchCnxSocialMultilingual };
