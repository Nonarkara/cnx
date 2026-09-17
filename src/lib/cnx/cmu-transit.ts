// CMU internal shuttle bus system — Chiang Mai University's Smart
// Campus Management Center (SCMC) runs a live GPS-tracked shuttle
// fleet, publicly broadcast over MQTT (the same broker
// transit.scmc.cmu.ac.th's own page connects to client-side — this
// isn't a scrape, it's the public feed their own site uses).
//
// Broker: wss://cmutransit-ws.bda.co.th:8883, topic pass_cmutransit/#,
// no auth. Client-side only (the browser holds the MQTT connection,
// same as the reference page) — a Cloudflare Worker isn't a good fit
// for a long-lived MQTT subscription, and there's nothing to
// authenticate or rate-limit here.
//
// Static station + route-polyline geometry is baked from the
// reference page's own window.stations / window.polylines globals
// (public/data/cnx/cmu-transit-{stations,routes}.json) — campus
// geometry changes rarely, so no need to depend on that page staying
// up just to draw the route lines.

export const CMU_TRANSIT_WS_URL = "wss://cmutransit-ws.bda.co.th:8883";
export const CMU_TRANSIT_TOPIC = "pass_cmutransit/#";

export interface CmuBusPosition {
  bus: string;
  route: string;
  lat: number;
  lng: number;
  speed: number;
  passenger: number;
  /** ms since epoch — when we last heard from this bus. */
  updatedAt: number;
}

interface RawCmuMessage {
  bus?: string | number;
  route?: string | number;
  lat?: number;
  lng?: number;
  speed?: number;
  passenger?: number;
}

/** Parse one MQTT message payload — tolerant of the two schema
 *  variants observed on the feed (older "van" firmware vs newer bus
 *  firmware with extra battery/temperature telemetry we don't need). */
export function parseCmuTransitMessage(raw: string): CmuBusPosition | null {
  try {
    const json = JSON.parse(raw) as RawCmuMessage;
    if (json.lat == null || json.lng == null || json.bus == null || json.route == null) return null;
    if (!Number.isFinite(json.lat) || !Number.isFinite(json.lng)) return null;
    return {
      bus: String(json.bus),
      route: String(json.route),
      lat: json.lat,
      lng: json.lng,
      speed: typeof json.speed === "number" ? json.speed : 0,
      passenger: typeof json.passenger === "number" ? json.passenger : 0,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export interface CmuStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  routes: number[];
}

export interface CmuRoute {
  color: string;
  path: [number, number][];
}

/** A bus is considered stale (driver logged off / GPS lost) after
 *  this long without an update — dropped from the rendered layer
 *  rather than left frozen on the map. */
export const CMU_BUS_STALE_MS = 5 * 60_000;
