#!/usr/bin/env node
/**
 * fetch-cnx-bus-routes.mjs
 *
 * Bake OSM bus-route relations + bus-stop nodes for the wider Chiang
 * Mai region to public/data/cnx/bus-routes.geojson — same pattern as
 * fetch-cnx-waterways.mjs, for the same reason: Overpass is too
 * flaky/rate-limited for a cold Cloudflare Worker isolate to depend
 * on for a live per-request fetch, and this data doesn't change often
 * (the original lib/cnx/bus-routes.ts docstring already said a 7-day
 * refresh was the intent).
 *
 *   node scripts/fetch-cnx-bus-routes.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Single destination: `public/data/cnx/bus-routes.geojson`. The
// worker reads this via its own static asset URL at request time
// (no static JSON import — at 311 KB that path hung the OpenNext
// bundler on Node 26).
const OUT_FILES = [
  resolve(ROOT, "public/data/cnx/bus-routes.geojson"),
];

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const BBOX = { south: 17.5, west: 97.5, north: 20.5, east: 100.5 };

const QUERY = `[out:json][timeout:120];
(
  node["highway"="bus_stop"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way["highway"="bus_stop"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  relation["route"="bus"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  relation["type"="route"]["route"="minibus"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
);
out geom;`;

async function fetchOverpass(query) {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`→ ${endpoint}`);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          Accept: "*/*",
          "User-Agent": "cnx-dashboard/0.1 (https://cnx.nonarkara.org)",
        },
        body: query,
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        console.warn(`  HTTP ${res.status}, trying next endpoint`);
        continue;
      }
      const json = await res.json();
      return json.elements ?? [];
    } catch (e) {
      console.warn(`  failed: ${e.message}, trying next endpoint`);
    }
  }
  throw new Error("All Overpass endpoints failed");
}

async function main() {
  console.log(`bbox: ${BBOX.south},${BBOX.west} → ${BBOX.north},${BBOX.east}`);
  console.log(`out:  ${OUT_FILES.join(", ")}`);

  const elements = await fetchOverpass(QUERY);
  console.log(`OSM returned ${elements.length} elements`);

  const routes = [];
  const stops = [];
  for (const el of elements) {
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
      const geom = [];
      for (const m of el.members ?? []) {
        if (m.type === "way" && m.geometry) {
          for (const p of m.geometry) geom.push([p.lon, p.lat]);
        }
      }
      if (geom.length >= 2) {
        routes.push({
          id: `route-${el.id}`,
          ref: el.tags.ref ?? el.tags.name ?? el.tags["name:th"] ?? `Route ${el.id}`,
          name: el.tags.name ?? el.tags["name:th"] ?? el.tags["name:en"] ?? "",
          operator: el.tags.operator ?? el.tags.network ?? "Unknown",
          colour: el.tags.colour ?? "#1d2951",
          geometry: geom,
        });
      }
    }
  }
  console.log(`wrote ${routes.length} routes, ${stops.length} stops`);

  mkdirSync(dirname(OUT_FILES[0]), { recursive: true });
  const payload = JSON.stringify(
    {
      meta: {
        source: "OpenStreetMap (ODbL), via Overpass",
        generatedAt: new Date().toISOString(),
        bbox: BBOX,
        scope: "bus-routes",
      },
      routes,
      stops,
    },
    null,
    0,
  );
  for (const path of OUT_FILES) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, payload);
    console.log(`✓ ${path}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
