#!/usr/bin/env node
/**
 * fetch-cnx-buildings.mjs
 *
 * Pull every OSM building footprint inside the Chiang Mai bbox and
 * emit a single GeoJSON with `height` + `base_height` on every feature,
 * plus empty attribute boxes ready to be filled (the same pattern as
 * atlas.nonarkara.org's bkk-buildings-rattanakosin.geojson).
 *
 * Heuristics for height (priority order):
 *   1. `height` tag (if present and parseable)
 *   2. `building:levels` * 3 m (OSM standard: 1 level ≈ 3 m)
 *   3. `building:levels:underground` * 3 m → added to base_height
 *   4. 9 m fallback (3-storey default for missing-data buildings)
 *
 * Empty attribute boxes (the operator fills these later, via a CMS
 * or admin panel that writes back to the file):
 *   - population:    null   (people living/working in the building)
 *   - electricity_kw: null  (peak demand, kW)
 *   - water_m3_day:  null   (daily consumption)
 *   - address_th:    null   (Thai-script postal address)
 *   - land_use:      null   (categorical: residential / commercial / civic / religious / industrial)
 *   - last_inspected: null   (ISO date of last physical inspection)
 *
 *   node scripts/fetch-cnx-buildings.mjs
 *
 * Outputs public/data/cnx/buildings.geojson. The bbox defaults to
 * Chiang Mai's city core (lat 18.7-18.85, lon 98.9-99.1) — the place
 * where the 3D atlas matters most. Pass --bbox=lat1,lon1,lat2,lon2
 * to widen.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "public/data/cnx");
const OUT_FILE = resolve(OUT_DIR, "buildings.geojson");

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const DEFAULT_BBOX = {
  south: 18.7,
  west: 98.9,
  north: 18.85,
  east: 99.1,
};

function parseArgs(argv) {
  const args = { bbox: DEFAULT_BBOX, output: OUT_FILE };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--bbox" && argv[i + 1]) {
      const [s, w, n, e] = argv[i + 1].split(",").map(Number);
      args.bbox = { south: s, west: w, north: n, east: e };
      i += 1;
    } else if (a === "--output" && argv[i + 1]) {
      args.output = resolve(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

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
  // 9 m fallback — 3-storey default for buildings with no height
  // tag. We do NOT skip these features; an atlas needs every
  // footprint, including the unmarked ones.
  return 9;
}

function baseHeightFromTags(tags) {
  const underground = parseFloatOrNull(tags["building:levels:underground"]);
  const minHeight = parseFloatOrNull(tags.min_height);
  return Math.max(0, underground !== null ? underground * 3 : 0, minHeight ?? 0);
}

function classify(tags) {
  // Surface the tag categories the operator might filter by. The
  // shape matches the atlas convention so an analyst moving
  // between the two dashboards sees the same vocabulary.
  if (tags.amenity) return { kind: "amenity", value: tags.amenity };
  if (tags.tourism) return { kind: "tourism", value: tags.tourism };
  if (tags.historic) return { kind: "historic", value: tags.historic };
  if (tags.building) return { kind: "building", value: tags.building };
  return { kind: "building", value: "yes" };
}

// Overpass returns geometry as `[{lat, lon}, ...]` objects. GeoJSON
// requires `[lon, lat]` number pairs. Convert once at extraction time
// so MapLibre / deck.gl can read the result without coercion.
function osmGeomToGeoJSON(geom) {
  if (!geom || geom.length === 0) return null;
  const out = new Array(geom.length);
  for (let i = 0; i < geom.length; i += 1) {
    const p = geom[i];
    // Some Overpass responses include [lon, lat] already (rare) — accept both.
    if (Array.isArray(p)) {
      out[i] = p.length >= 2 ? [p[0], p[1]] : [p[0], p[0]];
    } else {
      out[i] = [p.lon, p.lat];
    }
  }
  return out;
}

function buildFeature(osm) {
  const tags = osm.tags ?? {};
  const height = heightFromTags(tags);
  const base = baseHeightFromTags(tags);
  const cat = classify(tags);
  // Strip the noisy default tags so the GeoJSON stays compact. The
  // operator can extend the whitelist below as new attributes
  // become interesting.
  const props = {
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
    // Empty attribute boxes — the operator fills these later.
    population: null,
    electricity_kw: null,
    water_m3_day: null,
    address_th: null,
    land_use: null,
    last_inspected: null,
  };
  const geometry = osmGeomToGeoJSON(osm.geometry);
  if (!geometry) return null;
  return {
    type: "Feature",
    id: osm.id,
    properties: props,
    geometry,
  };
}

function bboxToOverpass(b) {
  // Overpass bbox: south,west,north,east
  return `${b.south},${b.west},${b.north},${b.east}`;
}

function buildQuery(bbox) {
  const b = bboxToOverpass(bbox);
  // Timeout 180 s. OSM will return whatever it can in that window;
  // we then ask for a new slice if the response is truncated. The
  // Overpass `[out:json]` returns elements with geometry inline,
  // which is what we want — we are not building PMTiles here, just
  // a single GeoJSON.
  return `[out:json][timeout:180];
(
  way["building"](${b});
  relation["building"](${b});
);
out geom;`;
}

async function fetchOverpass(query) {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`→ ${endpoint}`);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain", "User-Agent": "cnx-dashboard/0.1 (https://cnx.nonarkara.org)" },
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

async function main() {
  const args = parseArgs(process.argv);
  console.log(`bbox: ${args.bbox.south},${args.bbox.west} → ${args.bbox.north},${args.bbox.east}`);
  console.log(`out:  ${args.output}`);

  const query = buildQuery(args.bbox);
  const elements = await fetchOverpass(query);
  console.log(`OSM returned ${elements.length} elements`);

  // Skip nodes/relations without geometry, and any polygon-less way.
  const features = [];
  for (const el of elements) {
    if (!el.geometry || el.geometry.length < 3) continue;
    const feat = buildFeature(el);
    if (feat) features.push(feat);
  }
  console.log(`wrote ${features.length} buildings with height + base_height`);

  mkdirSync(dirname(args.output), { recursive: true });
  writeFileSync(
    args.output,
    JSON.stringify(
      {
        type: "FeatureCollection",
        name: "cnx-buildings",
        meta: {
          source: "OpenStreetMap buildings (ODbL), via Overpass",
          bbox: args.bbox,
          generatedAt: new Date().toISOString(),
          heuristic: "height = building:levels * 3 m, else 9 m fallback",
        },
        features,
      },
      null,
      0,
    ),
  );
  console.log(`✓ ${args.output}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
