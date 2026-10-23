#!/usr/bin/env node
/**
 * build-cnx-temple-compounds.mjs
 *
 * Bakes `public/data/cnx/temple-compounds.geojson` — every mapped temple
 * in Chiang Mai, composed into the parts a temple compound actually has.
 *
 * WHY
 *
 * The 3D city layer extruded each `amenity=place_of_worship` polygon as
 * ONE gold block. Wat Chedi Luang's mapped boundary is 49,525 m² and
 * holds 41 separately-mapped OSM buildings inside it — its stupa, the
 * Pra Wihan Luang, the monastic cells. Extruded as one slab, all of that
 * collapsed into a single gold rectangle that said nothing about the
 * compound's order.
 *
 * This script composes the compound instead. The grammar lives in
 * `src/lib/cnx/temple-compound.ts` (one implementation, unit-tested);
 * this file is the I/O around it.
 *
 * WHAT IS MEASURED AND WHAT IS MODELLED
 *
 *   measured — the mapped boundary, and any OSM building footprint that
 *              falls inside it (with the height the extract carries).
 *   model    — the wall's thickness and height, the gatehouse, the roof
 *              overhangs, the modelled chedi, and the placement of a
 *              hall where OSM maps none.
 *
 * Every feature carries `origin` and the compound carries `evidence`.
 * The map styles them differently and the click card says which is
 * which, because a modelled chedi must never read as a surveyed one.
 *
 * Usage:
 *   node scripts/build-cnx-temple-compounds.mjs
 *
 * Inputs (all committed):
 *   public/data/cnx/temples.geojson
 *   public/data/cnx/buildings-core.geojson
 *   public/data/cnx/buildings-wide.geojson
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  composeCompound,
  COMPOUND_MIN_AREA_M2,
} from "../src/lib/cnx/temple-compound.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = resolve(ROOT, "public/data/cnx");
const OUT = resolve(DATA_DIR, "temple-compounds.geojson");

function readJson(name) {
  return JSON.parse(readFileSync(resolve(DATA_DIR, name), "utf8"));
}

const temples = readJson("temples.geojson").features;
const buildings = [
  ...readJson("buildings-core.geojson").features,
  ...readJson("buildings-wide.geojson").features,
];

/** Metres per degree at Chiang Mai's latitude. */
const M_LAT = 110574;
const M_LON = 111320 * Math.cos((18.7883 * Math.PI) / 180);

function ringOf(feature) {
  return feature.geometry.coordinates[0];
}

function centroidOf(ring) {
  let x = 0;
  let y = 0;
  for (const p of ring) {
    x += p[0];
    y += p[1];
  }
  return [x / ring.length, y / ring.length];
}

function areaM2Of(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return (Math.abs(a) / 2) * M_LAT * M_LON;
}

function pointInRing(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ── A coarse grid so the temple × building join is not 474 × 40,000.
const CELL = 0.002;
const grid = new Map();
const cellKey = (x, y) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;

/**
 * Was this footprint's height mapped, or did the extractor supply its
 * 9 m default? The extract writes `levels` when the `building:levels`
 * tag was present and a height of exactly 9 when it was not, so those
 * two together are the honest signal. A mapped height of exactly 9 m is
 * reported as a default — conservative in the direction that matters,
 * because it under-credits the data rather than over-claiming it.
 */
function heightSourceOf(props) {
  if (props?.levels != null) return "osm";
  if (props?.height != null && Number(props.height) !== 9) return "osm";
  return "fallback";
}

for (const b of buildings) {
  const ring = ringOf(b);
  if (!ring || ring.length < 3) continue;
  const c = centroidOf(ring);
  const key = cellKey(c[0], c[1]);
  if (!grid.has(key)) grid.set(key, []);
  grid.get(key).push(b);
}

function interiorsOf(boundaryRing) {
  const out = [];
  const c = centroidOf(boundaryRing);
  const gx = Math.floor(c[0] / CELL);
  const gy = Math.floor(c[1] / CELL);
  const seen = new Set();
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (const b of grid.get(`${gx + dx}:${gy + dy}`) ?? []) {
        if (seen.has(b.id)) continue;
        seen.add(b.id);
        const ring = ringOf(b);
        const bc = centroidOf(ring);
        if (pointInRing(bc[0], bc[1], boundaryRing)) {
          out.push({
            ring,
            height: Number(b.properties?.height) || 9,
            heightSource: heightSourceOf(b.properties),
            name: b.properties?.name_en || b.properties?.name_th || b.properties?.name || null,
          });
        }
      }
    }
  }
  return out;
}

/**
 * A building whose footprint is the boundary itself, mapped twice: once
 * as the place_of_worship way and once as a building. Counting it as an
 * "interior" building would make the grammar treat the compound's own
 * main hall as a building sitting inside it.
 */
function isBoundaryDuplicate(buildingRing, boundaryRing) {
  const a = areaM2Of(buildingRing);
  const b = areaM2Of(boundaryRing);
  if (b < 1) return false;
  if (Math.abs(a - b) / b > 0.12) return false;
  const ac = centroidOf(buildingRing);
  const bc = centroidOf(boundaryRing);
  const dx = (ac[0] - bc[0]) * M_LON;
  const dy = (ac[1] - bc[1]) * M_LAT;
  return Math.hypot(dx, dy) < Math.max(12, Math.sqrt(b) * 0.4);
}

const features = [];
const stats = {
  temples: temples.length,
  compounds: 0,
  singleFootprints: 0,
  withFootprints: 0,
  boundaryOnly: 0,
  measuredParts: 0,
  modelParts: 0,
  partsByKind: {},
};

temples.forEach((t, index) => {
  const props = t.properties ?? {};
  const boundaryRing = ringOf(t);
  if (!boundaryRing || boundaryRing.length < 3) return;

  const compoundId = props.id ?? `temple-${index}`;
  const religion = props.kind_value || "unknown";
  const nameTh = props.name_th || props.name || null;
  const nameEn = props.name_en || props.name || null;

  const interiors = interiorsOf(boundaryRing).filter(
    (i) => !isBoundaryDuplicate(i.ring, boundaryRing),
  );

  const result = composeCompound({ boundary: boundaryRing, interiors, religion });
  const areaM2 = result.areaM2 || areaM2Of(boundaryRing);

  let parts = result.parts;
  let evidence = result.evidence;

  if (parts.length === 0) {
    // The polygon is a building, not a compound. Render it as the
    // mapped building it is — measured — with a modelled roof cap.
    evidence = "single-footprint";
    stats.singleFootprints += 1;
    const height = Number(props.height) || 9;
    parts = [
      {
        kind: "hall",
        origin: "measured",
        tier: "body",
        ring: boundaryRing,
        height,
        base_height: 0,
        heightSource: heightSourceOf(props),
      },
    ];
  } else {
    stats.compounds += 1;
    if (evidence === "osm-footprints") stats.withFootprints += 1;
    else stats.boundaryOnly += 1;
  }

  parts.forEach((part, partIndex) => {
    const ring = part.ring;
    if (!ring || ring.length < 3) return;
    stats.partsByKind[part.kind] = (stats.partsByKind[part.kind] ?? 0) + 1;
    if (part.origin === "measured") stats.measuredParts += 1;
    else stats.modelParts += 1;

    features.push({
      type: "Feature",
      id: `${compoundId}-${part.kind}-${partIndex}`,
      properties: {
        id: `${compoundId}-${part.kind}-${partIndex}`,
        compound_id: compoundId,
        part: part.kind,
        tier: part.tier,
        origin: part.origin,
        evidence,
        religion,
        name_th: nameTh,
        name_en: nameEn,
        name: props.name ?? null,
        height: part.height,
        base_height: part.base_height,
        height_source: part.heightSource ?? "grammar",
        compound_area_m2: Math.round(areaM2),
        compound_min_area_m2: COMPOUND_MIN_AREA_M2,
        kind: "temple",
      },
      geometry: {
        type: "Polygon",
        coordinates: [ring, ...(part.holes ?? [])],
      },
    });
  });
});

const collection = {
  type: "FeatureCollection",
  name: "temple-compounds",
  meta: {
    source: "OpenStreetMap (ODbL), via Overpass — temple boundaries and building footprints",
    generatedAt: new Date().toISOString(),
    scope: "temple compounds",
    grammar: "src/lib/cnx/temple-compound.ts",
    note:
      "Compound parts are composed from the mapped boundary using a walled-axial grammar " +
      "(gate on the south end of the axis, courtyard, main hall at the north end, flanking " +
      "side halls, a tower on the axis). Parts marked origin=measured are OpenStreetMap " +
      "footprints; parts marked origin=model are the grammar's placement and dimensions.",
    stats,
  },
  features,
};

writeFileSync(OUT, JSON.stringify(collection));
console.log(`✓ ${OUT}`);
console.log(
  `  ${stats.temples} temples → ${stats.compounds} compounds (${stats.withFootprints} with OSM footprints, ` +
    `${stats.boundaryOnly} boundary-only) + ${stats.singleFootprints} single buildings`,
);
console.log(
  `  ${features.length} parts — ${stats.measuredParts} measured, ${stats.modelParts} modelled`,
);
console.log(`  by kind: ${JSON.stringify(stats.partsByKind)}`);
