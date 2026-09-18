import type { FetchResult, FlightState } from "./opensky";

export const FLIGHTS_KV_KEY = "latest-snapshot";

/** Snapshots older than this are treated as stale — the relay poller
 *  (scripts/relay-flights.mjs) is expected to write every 20-30s. */
export const FLIGHTS_KV_STALE_MS = 3 * 60_000;

function isFlightState(v: unknown): v is FlightState {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.icao24 === "string" &&
    typeof s.callsign === "string" &&
    typeof s.originCountry === "string" &&
    typeof s.onGround === "boolean" &&
    typeof s.lastContact === "number"
  );
}

/** Validates untrusted JSON from the relay ingest endpoint before it's
 *  trusted as a FetchResult and stored in KV. */
export function isFetchResult(v: unknown): v is FetchResult {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.fetchedAt === "number" &&
    typeof r.observedAt === "number" &&
    typeof r.degraded === "boolean" &&
    Array.isArray(r.airborne) &&
    Array.isArray(r.ground) &&
    r.airborne.every(isFlightState) &&
    r.ground.every(isFlightState)
  );
}
