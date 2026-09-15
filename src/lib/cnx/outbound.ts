// CNX outbound flight analysis.
//
// We can't read flight plans from OpenSky anonymous tier (they require
// /flights/all which is restricted to non-anonymous, or a flight
// database like FlightAware). What we *can* do is bucket the live
// state vectors by:
//   1. Heading quadrant — south = Bangkok, north = Chiang Rai / Laos,
//      west = Myanmar, east = Laos / Vietnam.
//   3. Plane size — heavy / wide / narrow / regional, mapped to
//      "long-haul" / "regional" / "domestic".
//
// The persisted snapshot store (see ./snapshot-store.ts) accumulates
// these over time so the dashboard can show 24-h / 7-d trends — which
// is the "where are they flying back" question the governor asked.
//
// Persistence to /Volumes/Data/CNX/flight-snapshots/ is a *server-only*
// path (the file-system outside `public/`). On Cloudflare Workers,
// /Volumes/Data is not available; the snapshot store falls back to the
// in-process map (last N polls). On the local M3 Mac where the API
// process runs behind launchd, the snapshot store writes NDJSON to
// disk for the trend aggregator.

import { CNX_BBOX } from "./opensky";
import type { FlightState } from "./opensky";

export interface OutboundBucket {
  /** Heading quadrant name. */
  quadrant: "north" | "south" | "east" | "west" | "stationary";
  /** Heading mid in degrees. */
  headingMidDeg: number;
  count: number;
  /** Top origin countries in this quadrant. */
  topOrigins: { country: string; count: number }[];
  /** Plane size mix. */
  bySize: Record<"heavy" | "wide" | "narrow" | "regional", number>;
}

export interface OutboundAnalysis {
  generatedAt: string;
  totalAirborne: number;
  totalGround: number;
  byQuadrant: OutboundBucket[];
  /** Heuristic guess at top destinations: from the heading quadrant
   *  distribution, infer where most traffic is heading. */
  inferredTopDestination: string;
  /** Distinct countries observed in the current snapshot. */
  distinctOriginCountries: number;
}

function quadrantForHeading(deg: number | null | undefined): OutboundBucket["quadrant"] {
  if (deg === null || deg === undefined) return "stationary";
  // Normalise to 0..360.
  const d = ((deg % 360) + 360) % 360;
  // South: 135°–225° (heading south-ish)
  // East:  45°–135°  (heading east)
  // North: 315°–45° (heading north)
  // West:  225°–315° (heading west)
  if (d >= 135 && d < 225) return "south";
  if (d >= 225 && d < 315) return "west";
  if (d >= 315 || d < 45) return "north";
  return "east";
}

const QUADRANT_HEADING_MID: Record<OutboundBucket["quadrant"], number> = {
  north: 0,
  south: 180,
  east: 90,
  west: 270,
  stationary: 0,
};

const QUADRANT_INFERRED_DESTINATION: Record<OutboundBucket["quadrant"], string> = {
  north: "Chiang Rai / Laos",
  south: "Bangkok (BKK) / Gulf",
  east: "Laos / Vietnam",
  west: "Myanmar",
  stationary: "On ground",
};

function topOf<T>(arr: T[], pick: (t: T) => string, max = 3): { country: string; count: number }[] {
  const m = new Map<string, number>();
  for (const x of arr) {
    const k = pick(x);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([country, count]) => ({ country, count }));
}

export function summariseOutbound(states: FlightState[]): OutboundAnalysis {
  const byQuadrant = new Map<OutboundBucket["quadrant"], OutboundBucket>();
  let airborne = 0;
  let ground = 0;
  const allOrigins = new Set<string>();

  for (const s of states) {
    if (s.onGround) { ground += 1; continue; }
    if (s.latitude === null || s.longitude === null) continue;
    airborne += 1;
    if (s.originCountry) allOrigins.add(s.originCountry);
    const q = quadrantForHeading(s.trueTrack);
    const existing = byQuadrant.get(q) ?? {
      quadrant: q,
      headingMidDeg: QUADRANT_HEADING_MID[q],
      count: 0,
      topOrigins: [],
      bySize: { heavy: 0, wide: 0, narrow: 0, regional: 0 },
    };
    existing.count += 1;
    // FlightState.spec is set when the API resolved the typecode via
    // /api/cnx/aircraft. Anonymous-tier OpenSky returns only the
    // callsign + icao24, so the bucket is "narrow" by default until
    // the lookup completes — see lib/cnx/opensky for the resolution
    // path.
    const size: "heavy" | "wide" | "narrow" | "regional" = "narrow";
    existing.bySize[size] += 1;
    byQuadrant.set(q, existing);
  }

  // Top origins per quadrant — second pass so we get accurate top-3.
  for (const q of byQuadrant.values()) {
    const statesInQ = states.filter((s) => !s.onGround && quadrantForHeading(s.trueTrack) === q.quadrant);
    q.topOrigins = topOf(statesInQ, (s) => s.originCountry ?? "", 3);
  }

  const buckets = [...byQuadrant.values()].sort((a, b) => b.count - a.count);
  const inferred = buckets[0]?.quadrant
    ? QUADRANT_INFERRED_DESTINATION[buckets[0].quadrant]
    : "Unknown";

  return {
    generatedAt: new Date().toISOString(),
    totalAirborne: airborne,
    totalGround: ground,
    byQuadrant: buckets,
    inferredTopDestination: inferred,
    distinctOriginCountries: allOrigins.size,
  };
}

export { quadrantForHeading, QUADRANT_INFERRED_DESTINATION };