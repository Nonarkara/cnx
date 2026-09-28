#!/usr/bin/env node
// Builds public/data/cnx/gazetteer.json — Chiang Mai place names with
// coordinates, used to pin citizen haze reports to the map
// (src/lib/cnx/citizen-core.ts). Everything comes from OpenStreetMap via
// Overpass: districts (admin_level 6), sub-districts and municipalities
// (7/8/10), named neighbourhoods/towns, and a short list of landmarks
// looked up by their OSM English name. Run: node scripts/build-cnx-gazetteer.mjs

import { writeFileSync } from "node:fs";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const OUT = new URL("../public/data/cnx/gazetteer.json", import.meta.url);

const LANDMARKS = [
  "Doi Suthep",
  "Wat Phra That Doi Suthep",
  "Doi Inthanon",
  "Tha Phae Gate",
  "Chiang Mai International Airport",
  "Chiang Mai University",
  "Warorot Market",
  "Nimmanahaeminda Road",
  "Maya Lifestyle Shopping Center",
  "Central Festival Chiang Mai",
  "Chiang Mai Night Safari",
  "Huay Tung Tao Lake",
  "Doi Pui",
];

/** Landmarks OSM only names in Thai (or spells unpredictably in English). */
const LANDMARKS_TH = ["ประตูท่าแพ", "ถนนนิมมานเหมินท์", "อ่างเก็บน้ำห้วยตึงเฒ่า"];

/** Extra spellings people actually type, keyed by OSM English name. */
const EXTRA_ALIASES = {
  "Nimmanahaeminda Road": ["Nimman", "Nimmanhaemin", "นิมมาน"],
  "Tha Phae Gate": ["Thapae", "Tha Pae", "ประตูท่าแพ"],
  "Chiang Mai International Airport": ["CNX airport", "สนามบินเชียงใหม่"],
  "Chiang Mai University": ["CMU", "มช."],
  "Doi Suthep": ["ดอยสุเทพ"],
  "Doi Inthanon": ["ดอยอินทนนท์"],
  "Huay Tung Tao Lake": ["Huay Tung Tao", "ห้วยตึงเฒ่า"],
  ประตูท่าแพ: ["Tha Phae Gate", "Thapae Gate", "Tha Pae Gate", "ท่าแพ"],
  ถนนนิมมานเหมินท์: ["Nimman", "Nimmanhaemin", "นิมมาน"],
  อ่างเก็บน้ำห้วยตึงเฒ่า: ["Huay Tung Tao", "ห้วยตึงเฒ่า"],
};

const QUERY = `[out:json][timeout:180];
area["ISO3166-2"="TH-50"]->.p;
(
  relation["boundary"="administrative"]["admin_level"~"^(6|7|8|10)$"](area.p);
  node["place"~"^(suburb|quarter|town|neighbourhood)$"](area.p);
  nwr["name:en"~"^(${LANDMARKS.join("|")})$"](area.p);
  nwr["name"~"^(${LANDMARKS_TH.join("|")})$"](area.p);
);
out center tags;`;

const KIND = { 6: "district", 7: "subdistrict", 8: "subdistrict", 10: "neighbourhood" };
const PREFIX_TH = /^(อำเภอ|ตำบล|เทศบาลนคร|เทศบาลเมือง|เทศบาลตำบล|องค์การบริหารส่วนตำบล|แขวง|บ้าน)\s*/;
const SUFFIX_EN = /\s+(District|Subdistrict|Sub-district|Town Municipality|Subdistrict Municipality|City Municipality|Municipality)$/i;
// Too common as plain words to count as a place mention on their own.
const STOPWORDS = new Set(["เมือง", "mueang", "muang", "city", "chiang mai", "เชียงใหม่", "old city"]);

async function main() {
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "User-Agent": "cnx-dashboard gazetteer builder", Accept: "application/json" },
    body: new URLSearchParams({ data: QUERY }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  const { elements } = await res.json();

  const entries = [];
  const seen = new Set();
  for (const el of elements) {
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lon !== "number" || !t.name) continue;
    const landmark = LANDMARKS.includes(t["name:en"]) || LANDMARKS_TH.includes(t.name);
    const kind = landmark ? "landmark" : KIND[t.admin_level] ?? (t.place === "town" ? "subdistrict" : "neighbourhood");
    const nameTh = t["name:th"] ?? t.name;
    const nameEn = t["name:en"] ?? "";
    const aliases = new Set(
      [nameTh.replace(PREFIX_TH, ""), nameEn.replace(SUFFIX_EN, ""), ...(EXTRA_ALIASES[nameEn] ?? EXTRA_ALIASES[t.name] ?? [])]
        .map((a) => a.trim())
        .filter((a) => a.length >= 3 && !STOPWORDS.has(a.toLowerCase())),
    );
    if (aliases.size === 0) continue;
    // One entry per landmark name: roads and lakes come back as several ways.
    const key = landmark ? `landmark:${nameEn || t.name}` : `${kind}:${nameTh}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ nameTh, nameEn, lat: +lat.toFixed(5), lon: +lon.toFixed(5), kind, aliases: [...aliases] });
  }

  const doc = {
    generatedAt: new Date().toISOString(),
    source: "OpenStreetMap contributors (ODbL), via Overpass API",
    entries,
  };
  writeFileSync(OUT, `${JSON.stringify(doc)}\n`);
  const byKind = entries.reduce((m, e) => ({ ...m, [e.kind]: (m[e.kind] ?? 0) + 1 }), {});
  console.log(`[gazetteer] ${entries.length} places`, byKind);
}

main().catch((e) => {
  console.error(`[gazetteer] failed: ${e.message}`);
  process.exit(1);
});
