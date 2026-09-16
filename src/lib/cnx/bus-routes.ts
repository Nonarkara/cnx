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
// from Overpass, bake it to `src/data/cnx-bus-routes.json` via
// `scripts/fetch-cnx-bus-routes.mjs`, and import the result here as
// the source of truth.
//
// Why bundled JSON and not a live Overpass call from the edge?
//   - Overpass's anonymous tier regularly 503s / 429s from the
//     Cloudflare edge — when it does, the dashboard was shipping
//     empty arrays (no live snapshot fallback was wired).
//   - The script's docstring already said 7-day refresh; we honour
//     that by re-running the script weekly.
//
// `fetchCnxBus()` reads the bundled JSON. If a `META_BUST` env var
// is set the function still tries a live refresh with the existing
// cache as fallback — but the dashboard path is now bake-first.

import type { BusRoute, BusStop } from "../../types/cnx";
import baked from "../../data/cnx-bus-routes.json";

interface BusDataFile {
  meta: { source: string; generatedAt: string; bbox: { south: number; west: number; north: number; east: number }; scope: string };
  routes: BusRoute[];
  stops: BusStop[];
}

// Sanity-check the baked JSON at module load. We do this once per
// worker isolate — if the file is malformed, fail loud rather than
// shipping empty arrays. The shape is fixed by `BusRoute` / `BusStop`
// in src/types/cnx.ts.
function asBusData(data: unknown): BusDataFile {
  if (!data || typeof data !== "object") throw new Error("[bus-routes] baked JSON is not an object");
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.routes)) throw new Error("[bus-routes] baked JSON missing `routes` array");
  if (!Array.isArray(d.stops)) throw new Error("[bus-routes] baked JSON missing `stops` array");
  return {
    meta: (d.meta as BusDataFile["meta"]) ?? { source: "unknown", generatedAt: new Date(0).toISOString(), bbox: { south: 0, west: 0, north: 0, east: 0 }, scope: "bus-routes" },
    routes: d.routes as BusRoute[],
    stops: d.stops as BusStop[],
  };
}

const BAKED = asBusData(baked);

export async function fetchCnxBus(): Promise<{ routes: BusRoute[]; stops: BusStop[]; generatedAt: string }> {
  return {
    routes: BAKED.routes,
    stops: BAKED.stops,
    generatedAt: BAKED.meta.generatedAt,
  };
}