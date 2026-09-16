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
// `route=bus` relations + `public_transport=*`. The curated extract
// is baked to `public/data/cnx/bus-routes.geojson` via
// `scripts/fetch-cnx-bus-routes.mjs` (weekly refresh).
//
// Three-tier loader (in order):
//
//   1. In-isolate module cache (1-hour TTL, served without I/O).
//   2. The baked JSON via the worker's own static asset URL
//      (`/data/cnx/bus-routes.geojson`). Resolved by Next.js in dev,
//      by the `ASSETS` binding in production. ~311 KB; loads in one
//      fetch.
//   3. A live Overpass call as last resort. Anonymous tier is
//      rate-limited from the Cloudflare edge, so this often fails —
//      that's why tier 2 exists.
//
// Why not bundle the JSON statically? At 311 KB the static import
// pushes the worker bundle to a size where the OpenNext bundler
// hangs on Node 26 (process.nextTick stalls during esbuild). Pulling
// it through the asset URL keeps the bundle small AND reliable.

import type { BusRoute, BusStop } from "../../types/cnx";

const OVERPASS = "https://overpass-api.de/api/interpreter";

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
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

interface BusDataFile {
  meta: { source: string; generatedAt: string; bbox: { south: number; west: number; north: number; east: number }; scope: string };
  routes: BusRoute[];
  stops: BusStop[];
}

let cache: { at: number; data: BusDataFile } | null = null;
const TTL_MS = 60 * 60_000;

export async function fetchCnxBus(): Promise<{ routes: BusRoute[]; stops: BusStop[]; generatedAt: string }> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { routes: cache.data.routes, stops: cache.data.stops, generatedAt: cache.data.meta.generatedAt };
  }
  try {
    const data = await loadBaked();
    cache = { at: Date.now(), data };
    return { routes: data.routes, stops: data.stops, generatedAt: data.meta.generatedAt };
  } catch (e) {
    console.warn(`[bus-routes] baked asset failed (${(e as Error).message}); trying live Overpass`);
  }
  try {
    const data = await loadOverpass();
    cache = { at: Date.now(), data };
    return { routes: data.routes, stops: data.stops, generatedAt: data.meta.generatedAt };
  } catch (e) {
    console.warn(`[bus-routes] live Overpass failed: ${(e as Error).message}`);
    if (cache) return { routes: cache.data.routes, stops: cache.data.stops, generatedAt: cache.data.meta.generatedAt };
    return { routes: [], stops: [], generatedAt: new Date().toISOString() };
  }
}

async function loadBaked(): Promise<BusDataFile> {
  // Skip the disk-read in tests so mocked network fetches are the only
  // path under test. Production never sets this var.
  if (process.env.CNX_SKIP_DISK_LOAD !== "1") {
    if (typeof process !== "undefined" && process.cwd) {
      try {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const filePath = path.join(process.cwd(), "public/data/cnx/bus-routes.geojson");
        const raw = await fs.readFile(filePath, "utf8");
        const data = JSON.parse(raw) as BusDataFile;
        if (Array.isArray(data.routes) && Array.isArray(data.stops)) {
          return data;
        }
      } catch {
        // fall through to network fetch
      }
    }
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const url = siteUrl ? `${siteUrl}/data/cnx/bus-routes.geojson` : "/data/cnx/bus-routes.geojson";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as BusDataFile;
  if (!Array.isArray(data.routes) || !Array.isArray(data.stops)) {
    throw new Error("missing routes / stops arrays");
  }
  return data;
}

async function loadOverpass(): Promise<BusDataFile> {
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      Accept: "*/*",
      "User-Agent": "cnx-dashboard/1.0 (+https://cnx.nonarkara.org)",
    },
    body: QUERY,
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
      // Each way member is its own segment — see BusRoute.geometry's
      // doc comment for why these aren't concatenated into one path.
      const segments: [number, number][][] = [];
      for (const m of el.members ?? []) {
        if (m.type === "way" && m.geometry && m.geometry.length >= 2) {
          segments.push(m.geometry.map((p) => [p.lon, p.lat]));
        }
      }
      if (segments.length > 0) {
        routes.push({
          id: `route-${el.id}`,
          ref: el.tags.ref ?? el.tags.name ?? el.tags["name:th"] ?? `Route ${el.id}`,
          name: el.tags.name ?? el.tags["name:th"] ?? el.tags["name:en"] ?? "",
          operator: el.tags.operator ?? el.tags.network ?? "Unknown",
          colour: el.tags.colour ?? "#1d2951",
          geometry: segments,
        });
      }
    }
  }
  return {
    meta: { source: "OpenStreetMap (ODbL), via Overpass", generatedAt: new Date().toISOString(), bbox: { south: 17.5, west: 97.5, north: 20.5, east: 100.5 }, scope: "bus-routes" },
    routes,
    stops,
  };
}