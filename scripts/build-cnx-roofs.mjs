#!/usr/bin/env node
/**
 * Deterministic local bake of schematic roofs from the existing OSM-derived
 * building/temple files. Run after the building fetch and compound bake.
 * Roof forms are assumptions, not survey results. Existing heights may be
 * explicit tags, levels × 3 metres, or a 9-metre extractor fallback.
 * Writes roofs-city.json / roofs-temple.json and the building roof_rise fields.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cityRoof } from "../src/lib/cnx/roof.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = resolve(ROOT, "public/data/cnx");

const SOURCES = [
  { file: "buildings-core.geojson", group: "core" },
  { file: "buildings-wide.geojson", group: "wide" },
];

const KINDS = ["gable", "flat"];
const GROUPS = ["core", "wide", "temple"];
const CATEGORIES = ["city-gable", "city-flat", "hall", "side_hall", "gate"];

const kindIndex = (k) => KINDS.indexOf(k);
const groupIndex = (g) => GROUPS.indexOf(g);
const categoryIndex = (c) => CATEGORIES.indexOf(c);

const rows = [];
const stats = {
  buildings: 0,
  gable: 0,
  flat: 0,
  noRoof: 0,
  byReason: new Map(),
};

function note(reason) {
  stats.byReason.set(reason, (stats.byReason.get(reason) || 0) + 1);
}

// ─── The city ───────────────────────────────────────────────────────────
for (const source of SOURCES) {
  const path = resolve(DATA, source.file);
  const fc = JSON.parse(readFileSync(path, "utf8"));
  let changed = 0;

  for (const feature of fc.features) {
    const props = feature.properties || {};
    const ring = feature.geometry?.coordinates?.[0];
    if (!Array.isArray(ring) || ring.length < 3) continue;

    const height = typeof props.height === "number" && Number.isFinite(props.height) ? props.height : 0;
    const result = cityRoof({
      ring,
      height,
      type: props.kind_value ?? props.kind ?? null,
      levels: typeof props.levels === "number" ? props.levels : null,
    });
    if (!result) {
      stats.noRoof += 1;
      continue;
    }
    const { roof } = result;
    stats.buildings += 1;
    stats[roof.kind] += 1;
    note(result.reason);

    // The wall stops where the roof starts.
    props.roof_rise = Number(roof.rise.toFixed(3));
    props.roof_kind = roof.kind === "gable" ? 1 : 0;
    props.total_height = Number(roof.total.toFixed(2));
    changed += 1;

    rows.push([
      Number(roof.centre[0].toFixed(6)),
      Number(roof.centre[1].toFixed(6)),
      Number(roof.length.toFixed(2)),
      Number(roof.width.toFixed(2)),
      Number(roof.rotation.toFixed(4)),
      Number(roof.eaves.toFixed(2)),
      Number(roof.rise.toFixed(2)),
      kindIndex(roof.kind),
      groupIndex(source.group),
      categoryIndex(roof.category),
    ]);
  }

  writeFileSync(path, JSON.stringify(fc));
  console.log(
    `${source.file}: ${fc.features.length} features, ${changed} given a roof, ${(
      JSON.stringify(fc).length / 1048576
    ).toFixed(1)} MB`,
  );
}

// ─── The temple compounds ───────────────────────────────────────────────
//
// The compound bake already composes each compound's pitched roofs —
// the hall, the side halls, the gate. They come across in the compound
// file's meta block.
const compoundPath = resolve(DATA, "temple-compounds.geojson");
const compound = JSON.parse(readFileSync(compoundPath, "utf8"));
const templeRoofs = compound.meta?.roofs?.rows ?? [];
for (const row of templeRoofs) {
  const [lon, lat, length, width, rotation, eaves, rise, kind, , category] = row;
  rows.push([lon, lat, length, width, rotation, eaves, rise, kind, groupIndex("temple"), category]);
  stats.buildings += 1;
  stats[kind === 0 ? "gable" : "flat"] += 1;
}
console.log(`temple-compounds.geojson: ${templeRoofs.length} compound roofs`);

// ─── The tables ─────────────────────────────────────────────────────────
//
// Two files, because they are fetched at different times: the temple
// roofs come with the compound layer, which is on by default, and the
// city roofs come with the 3D city, which is not.
const header = (note) => ({
  version: 1,
  note,
  columns: ["lon", "lat", "length", "width", "rotation", "eaves", "rise", "kind", "group", "category"],
  kinds: KINDS,
  groups: GROUPS,
  categories: CATEGORIES,
});

const cityRows = rows.filter((r) => r[8] !== groupIndex("temple"));
const templeRows = rows.filter((r) => r[8] === groupIndex("temple"));

const tableNote =
  "Schematic roof model for Chiang Mai, derived locally from OSM footprints (ODbL). " +
  "Roof forms and rectangular fits are assumptions, not measured roof geometry. " +
  "Building heights reuse the input totals, which may come from explicit OSM height tags, " +
  "levels times three metres, or a nine-metre extractor fallback; a total is not proof of measurement. " +
  "Temple layouts and unmapped dimensions also use the declared compound grammar. " +
  "Columns: lon, lat, length, width, rotation, eaves, rise, kind, group, category; " +
  "kind/group/category index the arrays below.";

const cityTable = { ...header(tableNote), rows: cityRows };
const templeTable = { ...header(tableNote), rows: templeRows };

writeFileSync(resolve(DATA, "roofs-city.json"), JSON.stringify(cityTable));
writeFileSync(resolve(DATA, "roofs-temple.json"), JSON.stringify(templeTable));
console.log(
  `roofs-city.json: ${cityRows.length} roofs, ${(JSON.stringify(cityTable).length / 1048576).toFixed(2)} MB`,
);
console.log(
  `roofs-temple.json: ${templeRows.length} roofs, ${(JSON.stringify(templeTable).length / 1024).toFixed(0)} KB`,
);

console.log("\n=== roofs ===");
console.log(`  buildings with a roof : ${stats.buildings}`);
console.log(`  gable                 : ${stats.gable} (${((stats.gable / stats.buildings) * 100).toFixed(1)}%)`);
console.log(`  flat                  : ${stats.flat} (${((stats.flat / stats.buildings) * 100).toFixed(1)}%)`);
console.log(`  no roof (bad ring)    : ${stats.noRoof}`);
console.log("\n=== why ===");
for (const [reason, n] of [...stats.byReason.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(7)}  ${reason}`);
}
