#!/usr/bin/env node
/**
 * fetch-cnx-waterways.mjs
 *
 * Pull OSM rivers + streams for the wider Chiang Mai region and bake
 * them to public/data/cnx/waterways.geojson — the same pattern as
 * fetch-cnx-buildings.mjs and fetch-cnx-buildings-3d.mjs.
 *
 * This replaces the old approach of hitting Overpass live from the
 * /api/cnx/waterways route on every cold Worker isolate: Overpass is
 * flaky under anonymous/frequent traffic (bare 406s without an
 * Accept/User-Agent header, occasional 504s even with them), and a
 * Cloudflare Worker's in-memory cache doesn't survive across isolates,
 * so a live per-request fetch was silently returning an empty layer
 * more often than not. Waterways don't change week to week, so baking
 * them (like walls/temples/buildings) is both more reliable and
 * cheaper.
 *
 *   node scripts/fetch-cnx-waterways.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = resolve(ROOT, "public/data/cnx/waterways.geojson");

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

// Wider than the buildings bbox — rivers drain from outside the city core.
const BBOX = { south: 17.5, west: 97.5, north: 20.5, east: 100.5 };

function buildQuery(b) {
  return `[out:json][timeout:180];
(
  way["waterway"="river"](${b.south},${b.west},${b.north},${b.east});
  way["waterway"="stream"](${b.south},${b.west},${b.north},${b.east});
);
out geom;`;
}

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
        signal: AbortSignal.timeout(180_000),
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

function buildFeature(el) {
  if (!el.geometry || el.geometry.length < 2) return null;
  const tags = el.tags ?? {};
  const category = tags.waterway === "river" ? "river" : "stream";
  const width = tags.waterway === "river" ? "major" : "minor";
  const coordinates = el.geometry.map((p) => [p.lon, p.lat]);
  return {
    type: "Feature",
    id: el.id,
    properties: {
      id: el.id,
      name: tags.name ?? tags["name:en"] ?? null,
      category,
      width,
    },
    geometry: { type: "LineString", coordinates },
  };
}

async function main() {
  console.log(`bbox: ${BBOX.south},${BBOX.west} → ${BBOX.north},${BBOX.east}`);
  console.log(`out:  ${OUT_FILE}`);

  const query = buildQuery(BBOX);
  const elements = await fetchOverpass(query);
  console.log(`OSM returned ${elements.length} elements`);

  const features = [];
  for (const el of elements) {
    const feat = buildFeature(el);
    if (feat) features.push(feat);
  }
  console.log(`wrote ${features.length} waterways`);

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(
    OUT_FILE,
    JSON.stringify(
      {
        type: "FeatureCollection",
        name: "cnx-waterways",
        meta: {
          source: "OpenStreetMap (ODbL), via Overpass",
          generatedAt: new Date().toISOString(),
          bbox: BBOX,
          scope: "waterways",
        },
        features,
      },
      null,
      0,
    ),
  );
  console.log(`✓ ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
