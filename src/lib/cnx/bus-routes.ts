// CNX bus routes overlay — Chiang Mai public transport.
//
// Chiang Mai doesn't have a single open GTFS feed. Operators:
//   - **Rot Tu** (รถตู้) — minivans Chiang Mai ↔ other provinces
//   - **SML** (yellow city buses) — municipal Chiang Mai
//   - **Songthaew** (สองแถว) — shared red trucks on inner routes
//   - **Arcade Bus Terminal** — long-distance hub
//   - **Grab** — ride-hail (no public transit layer, but a "tourist"
//     pinch point)
//
// The OSM Overpass API exposes all of these as `highway=bus_stop` +
// `route=bus` relations + `public_transport=*`. We pull a curated set
// from Overpass and project to a per-route LineString the deck.gl
// PathLayer can render.
//
// Refresh: 7 days. The OSM data doesn't change often; one fresh pull
// per week keeps it current without burning budget.

import type { BusRoute, BusStop } from "../../types/cnx";

const OVERPASS = "https://overpass-api.de/api/interpreter";

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; ref: number; role?: string; geometry?: { lat: number; lon: number }[] }[];
}

const QUERY = `
[out:json][timeout:60];
(
  node["highway"="bus_stop"](17.5,97.5,20.5,100.5);
  way["highway"="bus_stop"](17.5,97.5,20.5,100.5);
  relation["route"="bus"](17.5,97.5,20.5,100.5);
  relation["type"="route"]["route"="minibus"](17.5,97.5,20.5,100.5);
);
out geom;
`;

let cache: { at: number; routes: BusRoute[]; stops: BusStop[] } | null = null;
const TTL_MS = 7 * 24 * 60 * 60_000;

export async function fetchCnxBus(): Promise<{ routes: BusRoute[]; stops: BusStop[]; generatedAt: string }> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { routes: cache.routes, stops: cache.stops, generatedAt: new Date(cache.at).toISOString() };
  }
  try {
    const res = await fetch(OVERPASS, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // overpass-api.de's Apache front-end returns a bare 406 for
        // requests with no Accept / User-Agent header.
        Accept: "*/*",
        "User-Agent": "cnx-dashboard/1.0 (+https://cnx.nonarkara.org)",
      },
      body: "data=" + encodeURIComponent(QUERY),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    const json = (await res.json()) as { elements: OverpassElement[] };
    const routes: BusRoute[] = [];
    const stops: BusStop[] = [];
    for (const el of json.elements) {
      if (el.type === "node" && el.tags?.highway === "bus_stop" && el.lat !== undefined && el.lon !== undefined) {
        stops.push({
          id: `stop-${el.id}`,
          name: el.tags.name ?? el.tags["name:th"] ?? `Stop ${el.id}`,
          longitude: el.lon,
          latitude: el.lat,
          operator: el.tags.operator ?? el.tags.network ?? "Unknown",
          routeRef: el.tags.ref ?? "",
        });
      } else if (el.type === "relation" && (el.tags?.route === "bus" || el.tags?.route === "minibus")) {
        const geom: { lat: number; lon: number }[] = [];
        for (const m of el.members ?? []) {
          if (m.type === "way" && m.geometry) {
            for (const p of m.geometry) geom.push({ lat: p.lat, lon: p.lon });
          }
        }
        if (geom.length >= 2) {
          routes.push({
            id: `route-${el.id}`,
            ref: el.tags.ref ?? el.tags.name ?? el.tags["name:th"] ?? `Route ${el.id}`,
            name: el.tags.name ?? el.tags["name:th"] ?? el.tags["name:en"] ?? "",
            operator: el.tags.operator ?? el.tags.network ?? "Unknown",
            colour: el.tags.colour ?? "#1d2951",
            geometry: geom.map((p) => [p.lon, p.lat]),
          });
        }
      }
    }
    cache = { at: Date.now(), routes, stops };
    return { routes, stops, generatedAt: new Date().toISOString() };
  } catch (e) {
    console.warn(`[bus-routes] fetch failed: ${(e as Error).message}`);
    if (cache) return { routes: cache.routes, stops: cache.stops, generatedAt: new Date(cache.at).toISOString() };
    return { routes: [], stops: [], generatedAt: new Date().toISOString() };
  }
}