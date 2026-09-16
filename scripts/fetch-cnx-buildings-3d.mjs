#!/usr/bin/env node
/**
 * fetch-cnx-buildings-3d.mjs
 *
 * Wider Chiang Mai urban-area extraction with TEMPLES + WALLS + buildings.
 * Sister of fetch-cnx-buildings.mjs — same height heuristic, broader
 * query, splits output into:
 *
 *   public/data/cnx/buildings-core.geojson    (Old City + Doi Suthep, deep)
 *   public/data/cnx/buildings-wide.geojson    (urban fringe, sparse)
 *   public/data/cnx/temples.geojson             (place_of_worship polygons)
 *   public/data/cnx/walls.geojson              (historic=city_wall + barriers)
 *
 * Tighter core vs wider whole-city split mirrors the atlas-style zoom
 * pyramid: zoomed in we render every detail, zoomed out we render the
 * "city silhouette" only. MapLibre switches sources by minzoom.
 *
 * Usage:
 *   node scripts/fetch-cnx-buildings-3d.mjs
 *
 * Bbox (urban):
 *   south 18.65  → south of Hang Dong, north of Lamphun border
 *   west  98.85  → west of Mae Rim
 *   north 18.95  → includes Doi Suthep peak (2556 m — handled by terrain)
 *   east  99.20  → past Doi Suthep-Pui NP
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "public/data/cnx");

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const URBAN_BBOX = { south: 18.65, west: 98.85, north: 18.95, east: 99.20 };
const CORE_BBOX = { south: 18.74, west: 98.94, north: 18.83, east: 99.02 };

function parseFloatOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = parseFloat(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function heightFromTags(tags) {
  const explicit = parseFloatOrNull(tags.height);
  if (explicit !== null && explicit > 0) return explicit;
  const levels = parseFloatOrNull(tags["building:levels"]);
  if (levels !== null && levels > 0) return Math.max(3, levels * 3);
  // 9 m fallback for footprints with no height tag.
  return 9;
}

function baseHeightFromTags(tags) {
  const underground = parseFloatOrNull(tags["building:levels:underground"]);
  const minHeight = parseFloatOrNull(tags.min_height);
  return Math.max(0, underground !== null ? underground * 3 : 0, minHeight ?? 0);
}

function classify(tags) {
  if (tags.amenity === "place_of_worship") return { kind: "temple", value: tags.religion ?? "unknown" };
  if (tags.historic === "city_wall" || tags.barrier === "city_wall") return { kind: "wall", value: tags.wall ?? "yes" };
  if (tags.amenity) return { kind: "amenity", value: tags.amenity };
  if (tags.tourism) return { kind: "tourism", value: tags.tourism };
  if (tags.historic) return { kind: "historic", value: tags.historic };
  if (tags.building) return { kind: "building", value: tags.building };
  return { kind: "building", value: "yes" };
}

function buildFeature(osm) {
  const tags = osm.tags ?? {};
  const height = heightFromTags(tags);
  const base = baseHeightFromTags(tags);
  const cat = classify(tags);
  const geom = osm.geometry;
  if (!geom || geom.length < 3) return null;
  const out = new Array(geom.length);
  for (let i = 0; i < geom.length; i += 1) {
    const p = geom[i];
    out[i] = Array.isArray(p) ? [p[0], p[1]] : [p.lon, p.lat];
  }
  return {
    type: "Feature",
    id: osm.id,
    properties: {
      id: osm.id,
      height,
      base_height: base,
      name_th: tags["name:th"] ?? null,
      name_en: tags["name:en"] ?? null,
      name: tags.name ?? null,
      kind: cat.kind,
      kind_value: cat.value,
      levels: parseFloatOrNull(tags["building:levels"]),
      addr: tags["addr:street"]
        ? `${tags["addr:street"]} ${tags["addr:housenumber"] ?? ""}`.trim()
        : null,
    },
    geometry: out,
  };
}

function bboxToOverpass(b) {
  return `${b.south},${b.west},${b.north},${b.east}`;
}

/**
 * Overpass query that returns:
 *   - all buildings (ways + relations with role outer)
 *   - all places of worship (temples)
 *   - all city walls + city-wall barriers
 *
 * Walls and temples are tagged separately so we can render them with
 * distinct palettes without losing the building underneath.
 */
function buildQuery(bbox) {
  const b = bboxToOverpass(bbox);
  return `[out:json][timeout:240];
(
  way["building"](${b});
  relation["building"](${b});
  way["amenity"="place_of_worship"](${b});
  relation["amenity"="place_of_worship"](${b});
  way["historic"="city_wall"](${b});
  way["barrier"="city_wall"](${b});
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
          "User-Agent": "cnx-dashboard/0.2 (https://cnx.nonarkara.org)",
        },
        body: query,
        signal: AbortSignal.timeout(240_000),
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

function withinBBox(geom, bbox) {
  if (!geom || geom.length === 0) return false;
  for (const pt of geom) {
    // Defensive: Overpass returns {lat, lon} objects, but our convert
    // step below produces [lon, lat] arrays. Accept both shapes.
    let lon, lat;
    if (Array.isArray(pt)) {
      lon = pt[0];
      lat = pt[1];
    } else if (typeof pt === "object" && pt !== null) {
      lon = pt.lon;
      lat = pt.lat;
    } else {
      continue;
    }
    if (lon >= bbox.west && lon <= bbox.east && lat >= bbox.south && lat <= bbox.north) return true;
  }
  return false;
}

function partition(elements, coreBbox) {
  const buildings = [];
  const temples = [];
  const walls = [];
  for (const el of elements) {
    if (!el.geometry || el.geometry.length < 3) continue;
    const tags = el.tags ?? {};
    const isTemple = tags.amenity === "place_of_worship";
    const isWall = tags.historic === "city_wall" || tags.barrier === "city_wall";
    const feat = buildFeature(el);
    if (!feat) continue;
    if (isTemple) {
      temples.push(feat);
      continue;
    }
    if (isWall) {
      walls.push(feat);
      continue;
    }
    // Skip if not in either bbox — wider query returned a slightly
    // larger area than URBAN_BBOX due to the bbox round-trip, and
    // any feature outside should be dropped.
    if (!withinBBox(feat.geometry, URBAN_BBOX_CHECK)) continue;
    buildings.push(feat);
  }

  const buildingsCore = [];
  const buildingsWide = [];
  for (const b of buildings) {
    if (withinBBox(b.geometry, coreBbox)) {
      buildingsCore.push(b);
    } else {
      buildingsWide.push(b);
    }
  }
  return { buildingsCore, buildingsWide, temples, walls };
}

const URBAN_BBOX_CHECK = URBAN_BBOX;

function writeCollection(filename, features, meta) {
  const path = resolve(OUT_DIR, filename);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        type: "FeatureCollection",
        name: filename.replace(/\.geojson$/, ""),
        meta: { source: "OpenStreetMap (ODbL), via Overpass", generatedAt: new Date().toISOString(), ...meta },
        features,
      },
      null,
      0,
    ),
  );
  console.log(`✓ ${path} (${features.length} features)`);
}

async function main() {
  console.log(`urban bbox: ${bboxToOverpass(URBAN_BBOX)}`);
  const elements = await fetchOverpass(buildQuery(URBAN_BBOX));
  console.log(`OSM returned ${elements.length} elements`);

  const { buildingsCore, buildingsWide, temples, walls } = partition(elements, CORE_BBOX);
  console.log(`split → buildings-core: ${buildingsCore.length}, buildings-wide: ${buildingsWide.length}, temples: ${temples.length}, walls: ${walls.length}`);

  writeCollection("buildings-core.geojson", buildingsCore, { bbox: CORE_BBOX, scope: "core" });
  writeCollection("buildings-wide.geojson", buildingsWide, { bbox: URBAN_BBOX, scope: "wide" });
  writeCollection("temples.geojson", temples, { bbox: URBAN_BBOX, scope: "temples" });
  writeCollection("walls.geojson", walls, { bbox: URBAN_BBOX, scope: "walls" });
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});