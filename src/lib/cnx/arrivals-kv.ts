import type { ArrivalsResponse, ArrivalsWindow, OpenSkyArrival } from "./arrivals";

export const ARRIVALS_KV_KEY = "arrivals-latest";

/** The relay refreshes arrivals hourly; anything older than this is
 *  treated as a dead relay and ignored rather than shown as current. */
export const ARRIVALS_KV_STALE_MS = 6 * 60 * 60_000;

/** What scripts/relay-flights.mjs POSTs to /api/cnx/arrivals/ingest. */
export interface ArrivalsIngestPayload {
  windows: ArrivalsWindow[];
  /** icao24 → ICAO aircraft type designator (e.g. "A320"). */
  typecodes: Record<string, string>;
}

const MAX_WINDOWS = 7;
const MAX_ARRIVALS_PER_WINDOW = 1_000;
const MAX_TYPECODES = 5_000;

function isArrival(v: unknown): v is OpenSkyArrival {
  if (typeof v !== "object" || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.icao24 === "string" &&
    typeof a.firstSeen === "number" &&
    typeof a.lastSeen === "number" &&
    (a.estDepartureAirport === null || typeof a.estDepartureAirport === "string")
  );
}

/** Validates untrusted JSON from the relay before it is trusted. */
export function isArrivalsIngestPayload(v: unknown): v is ArrivalsIngestPayload {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  if (!Array.isArray(p.windows) || p.windows.length === 0 || p.windows.length > MAX_WINDOWS) return false;
  for (const w of p.windows) {
    if (typeof w !== "object" || w === null) return false;
    const win = w as Record<string, unknown>;
    if (typeof win.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(win.date)) return false;
    if (!Array.isArray(win.arrivals) || win.arrivals.length > MAX_ARRIVALS_PER_WINDOW) return false;
    if (!win.arrivals.every(isArrival)) return false;
  }
  if (typeof p.typecodes !== "object" || p.typecodes === null || Array.isArray(p.typecodes)) return false;
  const entries = Object.entries(p.typecodes as Record<string, unknown>);
  return entries.length <= MAX_TYPECODES && entries.every(([k, val]) => typeof k === "string" && typeof val === "string");
}

/** Reads the last relay-built arrivals response. Null when there is no
 *  Cloudflare context (local dev), no KV binding, nothing stored, or the
 *  stored copy is stale. */
export async function readArrivalsFromKv(): Promise<ArrivalsResponse | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    if (!env.CNX_FLIGHTS_KV) return null;
    const raw = await env.CNX_FLIGHTS_KV.get(ARRIVALS_KV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ArrivalsResponse;
    if (!Array.isArray(parsed.days) || typeof parsed.generatedAt !== "string") return null;
    if (Date.now() - Date.parse(parsed.generatedAt) > ARRIVALS_KV_STALE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}
