#!/usr/bin/env node
// Builds public/data/cnx/shelters.json — the official Chiang Mai temporary
// flood-shelter list (ศูนย์พักพิงชั่วคราวจังหวัดเชียงใหม่, สำนักงานจังหวัด
// เชียงใหม่ via chiangmai.gdcatalog.go.th) with coordinates from
// OpenStreetMap Nominatim, so the map and warnings can point people at the
// nearest shelter. The published CSV has no coordinates.
//
// Honesty rules (see src/lib/cnx/shelters.ts for the consumer side):
//   - "place":  an OSM feature whose name EXACTLY equals one of the
//               shelter-name variants (after normalisation), inside the
//               province ring, whose address names the shelter's อำเภอ.
//   - "tambon": no place match; a named OSM settlement/boundary for the
//               shelter's ตำบล in the right อำเภอ.
//   - "amphoe": the district office (ที่ว่าการอำเภอ) or, failing that, the
//               อำเภอ boundary centroid.
//   - "none":   nothing verified — lat/lon null. Coordinates are NEVER guessed.
//
// Nominatim usage policy: one request at a time, >= 1 s apart, a
// descriptive User-Agent, and every response cached on disk so re-runs do
// not re-hit the API.
//
// Run: node scripts/build-cnx-shelters.mjs [--refresh-csv] [--cache <file>]

import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const DATASET_ID = "4a375627-d76f-44d7-ac3f-d95651f0baee";
const CSV_PATH = new URL(`public/data/cnx/open-data/${DATASET_ID}.csv`, ROOT);
const INDEX_PATH = new URL("public/data/cnx/open-data/index.json", ROOT);
const RING_PATH = new URL("src/lib/cnx/province-boundary.ts", ROOT);
const OUT_PATH = new URL("public/data/cnx/shelters.json", ROOT);
const DEFAULT_CACHE =
  "/private/tmp/claude-501/-Volumes-Data-Projects-CNX/6268105c-ae5e-4932-809e-800e3c242ca4/scratchpad/nominatim-cache.json";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "cnx-dashboard/1.0 (+https://cnx.nonarkara.org)";
const MIN_INTERVAL_MS = 1100;
const VIEWBOX = "97.95,20.2,99.65,17.2"; // lon1,lat1,lon2,lat2 around the province
const RESULT_LIMIT = 10;
const MAX_RETRIES = 4;
const COORD_DECIMALS = 6;

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const CACHE_PATH = argValue("--cache") ?? DEFAULT_CACHE;
const REFRESH_CSV = args.includes("--refresh-csv");

// ---------------------------------------------------------------- province

/** Load CNX_PROVINCE_RING from the TS module without a TS toolchain. */
function loadProvinceRing() {
  const src = readFileSync(RING_PATH, "utf8");
  const m = src.match(/CNX_PROVINCE_RING[^=]*=\s*(\[\[[\s\S]*?\]\])\s*as const/);
  if (!m) throw new Error("could not find CNX_PROVINCE_RING in province-boundary.ts");
  return JSON.parse(m[1]);
}
const RING = loadProvinceRing();

/** Same ray-casting test as inChiangMaiProvince() in province-boundary.ts. */
function inProvince(lon, lat) {
  let inside = false;
  for (let i = 0, j = RING.length - 1; i < RING.length; j = i++) {
    const [xi, yi] = RING[i];
    const [xj, yj] = RING[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// --------------------------------------------------------------------- CSV

/** RFC-4180-ish CSV parser (quoted fields may contain commas). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const clean = (s) => (s ?? "").normalize("NFC").replace(/[​﻿]/g, "").replace(/\s+/g, " ").trim();

function toCount(s) {
  const t = clean(s).replace(/,/g, "");
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

function toHas(s) {
  const t = clean(s);
  if (t === "มี") return true;
  if (t === "ไม่มี") return false;
  return null;
}

const HEADER = ["รายการสถิติทางการ", "อำเภอ", "ตำบล", "สถานที่", "รองรับผู้พัก", "ไฟฟ้า", "ประปา", "ห้องสุขา"];

async function loadCsvText() {
  const index = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
  const indexEntry = (index.datasets ?? []).find((d) => d.id === DATASET_ID);
  if (!indexEntry?.url) throw new Error(`dataset ${DATASET_ID} not found in open-data/index.json`);
  let text = readFileSync(CSV_PATH, "utf8");
  let fetchedAt = indexEntry.fetchedAt ?? null;
  if (REFRESH_CSV) {
    const res = await fetch(indexEntry.url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`catalogue download failed: HTTP ${res.status}`);
    const fresh = await res.text();
    fetchedAt = new Date().toISOString();
    if (fresh !== text) {
      console.log("! catalogue CSV differs from the local copy — using the downloaded version");
      text = fresh;
    } else console.log("catalogue CSV identical to the local copy");
  }
  return { text, fetchedAt, resourceUrl: indexEntry.url };
}

function readShelterRows(text) {
  const rows = parseCsv(text);
  const header = rows[0].map(clean);
  if (HEADER.some((h, i) => header[i] !== h)) {
    throw new Error(`unexpected CSV header: ${header.join(",")}`);
  }
  const out = [];
  const skipped = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2; // 1-based, header is line 1
    const [, amphoe, tambon, place, cap, elec, water, toilets] = r.map(clean);
    // A data row whose อำเภอ cell is just the column title is a stray header.
    if (!amphoe || amphoe === "อำเภอ" || !place) {
      skipped.push({ line, cells: r.map(clean) });
      return;
    }
    out.push({
      line,
      nameTh: place,
      amphoeTh: amphoe,
      tambonTh: tambon || null,
      capacity: toCount(cap),
      electricity: toHas(elec),
      water: toHas(water),
      toilets: toCount(toilets),
    });
  });
  return { rows: out, skipped };
}

// --------------------------------------------------------- name variants

// Publisher typos seen in this CSV — corrected only in SEARCH variants;
// nameTh keeps the published spelling.
const TYPO_FIXES = [
  [/องค์กรบริหารส่วนตำบล/g, "องค์การบริหารส่วนตำบล"],
  [/ตำลบ/g, "ตำบล"],
  [/^วันบ้าน/, "วัดบ้าน"],
  [/รัฐราษฏร์/g, "รัฐราษฎร์"],
];

const ABBREVIATIONS = [
  [/รร\.\s*/g, "โรงเรียน"],
  [/อบต\.\s*/g, "องค์การบริหารส่วนตำบล"],
  [/ท\.?ต\.\s*/g, "เทศบาลตำบล"],
  [/ตชด\.?\s*/g, "ตชด"],
  [/อ\.\s*(?=\S)/g, "อำเภอ"],
];

// Building prefixes: the shelter is a hall/building AT an institution, so
// "หอประชุมโรงเรียนจอมทอง" should find the school "โรงเรียนจอมทอง".
// Longest first so "หอประชุมใหญ่" wins over "หอประชุม".
const BUILDING_PREFIXES = [
  "โถงนิทรรศการ 1-3",
  "อาคารอเนกประสงค์",
  "อาคารเอนกประสงค์",
  "อาคารประชุม",
  "หอประชุมใหญ่",
  "หอประชุม",
  "โรงยิมเนเซียม",
  "โรงยิมส์",
  "โรงยิม",
  "สนามกีฬา",
  "ศาลา",
  "อาคาร",
];

// Names OSM only carries in another form (checked by hand on openstreetmap.org).
// Acceptance still requires an exact OSM name match plus the อำเภอ check.
const SEARCH_ALIASES = {
  "ศูนย์ประชุมและแสดงสินค้า นานาชาติเฉลิมพระเกียรติ 7 รอบ พระชนมพรรษา จังหวัดเชียงใหม่": [
    "Chiang Mai International Exhibition and Convention Centre",
  ],
  // OSM spells the office "กัลญาณิวัฒนา".
  ที่ว่าการอำเภอกัลยาณิวัฒนา: ["ที่ว่าการอำเภอกัลญาณิวัฒนา"],
};

// Office-name prefixes OSM often adds ("ที่ทำการองค์การบริหารส่วนตำบล…").
// Stripped symmetrically from both sides before comparing names.
const OFFICE_PREFIXES = ["ที่ทำการ", "สำนักงาน"];

/** Too generic to identify one place on its own. */
const GENERIC = new Set(["โบสถ์", "หมู่บ้าน", "ที่ว่าการอำเภอ", "อำเภอ", "โรงเรียน", "วัด", "ตำบล", "เทศบาล"]);

const MIN_VARIANT_CHARS = 5;

/** A key that cannot identify one place: too short, generic, or an area name. */
function isGeneric(key) {
  return key.length < MIN_VARIANT_CHARS || GENERIC.has(key) || /^(หมู่บ้าน|อำเภอ|ตำบล|จังหวัด|[0-9])/.test(key);
}

function applyAll(s, rules) {
  return rules.reduce((acc, [re, to]) => acc.replace(re, to), s);
}

/** Canonical comparison key: no spaces/punctuation, abbreviations expanded. */
function nameKey(s) {
  let t = clean(s);
  t = applyAll(t, TYPO_FIXES);
  t = applyAll(t, ABBREVIATIONS);
  t = t.replace(/[\s.,\-–_'"“”]/g, "");
  t = t.replace(/[\u0e50-\u0e59]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
  // Fold tone marks: OSM has "ทีว่าการอำเภอหางดง" (missing ่).
  t = t.replace(/[\u0e48-\u0e4b]/g, "");
  for (const p of OFFICE_PREFIXES) if (t.startsWith(p) && t.length > p.length + 3) t = t.slice(p.length);
  return t;
}

const stripParens = (s) => s.replace(/\s*[(（][^)）]*[)）]\s*/g, " ").trim();
const stripDistrictSuffix = (s) => s.replace(/\s+อ(\.|ำเภอ)\s*\S+$/, "").trim();

function stripBuildingPrefix(s) {
  for (const p of BUILDING_PREFIXES) {
    if (s.startsWith(p) && s.length > p.length) return s.slice(p.length).trim();
  }
  return null;
}

/**
 * Search variants for one shelter, most specific first. Each is a search
 * string; acceptance compares nameKey() of OSM names against nameKey() of
 * the variant, so variants must stay real names.
 */
function nameVariants(row) {
  const out = [];
  const add = (s) => {
    if (!s) return;
    const v = clean(s);
    const k = nameKey(v);
    if (isGeneric(k)) return;
    if (!out.includes(v)) out.push(v);
    // Nominatim tokenises "700ปี" and "700 ปี" differently — try both.
    const spaced = v.replace(/(\d)(?=[\u0e01-\u0e4f])/g, "$1 ").replace(/([\u0e01-\u0e4f])(?=\d)/g, "$1 ");
    if (spaced !== v && !out.includes(spaced)) out.push(spaced);
  };
  // "หอประชุมที่ว่าการอำเภอ" with no district name → name the district.
  let base = row.nameTh.replace(/ที่ว่าการอำเภอ$/, `ที่ว่าการอำเภอ${row.amphoeTh}`);
  base = applyAll(base, TYPO_FIXES);
  // Two schools in one cell ("โรงเรียนบ้านสินชัย,โรงเรียนสันติวนา") — try each.
  const parts = base.split(/\s*,\s*/).filter(Boolean);
  for (const part of parts) {
    // "หอประชุมหมู่บ้าน ม.8" names no particular place — no place search.
    const core = stripBuildingPrefix(applyAll(part, ABBREVIATIONS));
    // "หอประชุมอำเภอสารภี" → the district office.
    if (core !== null && /^อำเภอ/.test(core)) add(`ที่ว่าการ${core}`);
    if (core !== null && isGeneric(nameKey(core))) continue;
    const forms = [part, stripParens(part), stripDistrictSuffix(part), stripDistrictSuffix(stripParens(part))];
    // Border-patrol-police schools: OSM spells "ตชด" out or drops it.
    if (/ตชด/.test(part)) {
      const bare = stripParens(part);
      forms.push(bare.replace(/\s*ตชด\.?\s*/, "ตำรวจตระเวนชายแดน"), bare.replace(/\s*ตชด\.?\s*/, ""));
    }
    for (const f of forms) {
      const expanded = applyAll(f, ABBREVIATIONS).replace(/\s+/g, " ").trim();
      add(expanded);
      // "หอประชุมใหญ่มหาวิทยาลัยเชียงใหม่" is mapped as "หอประชุมมหาวิทยาลัยเชียงใหม่".
      if (expanded.startsWith("หอประชุมใหญ่")) add(expanded.replace(/^หอประชุมใหญ่/, "หอประชุม"));
      const stripped = stripBuildingPrefix(expanded);
      if (stripped) {
        for (const alias of SEARCH_ALIASES[stripped] ?? []) add(alias);
        add(stripped);
        // "เทศบาลแสนไห" → also try the formal "เทศบาลตำบล…".
        if (/^เทศบาล(?!ตำบล|เมือง|นคร)/.test(stripped)) add(stripped.replace(/^เทศบาล/, "เทศบาลตำบล"));
      }
      if (/^เทศบาล(?!ตำบล|เมือง|นคร)/.test(expanded)) add(expanded.replace(/^เทศบาล/, "เทศบาลตำบล"));
    }
  }
  return out;
}

// ---------------------------------------------------------------- Nominatim

let cache = {};
if (existsSync(CACHE_PATH)) cache = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
let lastRequestAt = 0;
let networkRequests = 0;

function saveCache() {
  const tmp = `${CACHE_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache));
  renameSync(tmp, CACHE_PATH);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function nominatim(q, extra = {}) {
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    namedetails: "1",
    countrycodes: "th",
    "accept-language": "th",
    viewbox: VIEWBOX,
    bounded: "1",
    limit: String(RESULT_LIMIT),
    ...extra,
  });
  const url = `${NOMINATIM}?${params}`;
  if (cache[url]) return cache[url];
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    networkRequests++;
    let res;
    try {
      res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "th" } });
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (res.ok) {
      const body = await res.json();
      cache[url] = body;
      saveCache();
      return body;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      console.warn(`  HTTP ${res.status} — backing off`);
      await sleep(30_000 * (attempt + 1));
      continue;
    }
    throw new Error(`Nominatim HTTP ${res.status} for ${q}`);
  }
}

// ---------------------------------------------------------- verification

const PLACE_REJECT_CATEGORIES = new Set(["boundary", "place", "highway", "natural", "waterway", "railway"]);

function addressParts(r) {
  return new Set(String(r.display_name ?? "").split(",").map((s) => clean(s)));
}

function inAmphoe(r, amphoe) {
  const county = clean(r.address?.county ?? "");
  return county === `อำเภอ${amphoe}` || county === amphoe || addressParts(r).has(`อำเภอ${amphoe}`);
}

function mentionsTambon(r, tambon) {
  if (!tambon) return false;
  const parts = addressParts(r);
  return parts.has(tambon) || parts.has(`ตำบล${tambon}`) || parts.has(`เทศบาลตำบล${tambon}`);
}

function osmNames(r) {
  const nd = r.namedetails ?? {};
  const names = [r.name, nd.name, nd["name:th"], nd.alt_name, nd.official_name, nd.old_name, nd.short_name, nd.loc_name]
    .filter(Boolean)
    .flatMap((n) => String(n).split(";"));
  return [...new Set(names.map(clean).filter(Boolean))];
}

/** "ที่ว่าการอำเภอX" and a non-area feature named "อำเภอX" are the same office. */
const officeKey = (k) => k.replace(/^ทีวาการ(?=อำเภอ)/, "");

function namesMatch(r, variant) {
  const want = officeKey(nameKey(variant));
  return osmNames(r).some((n) => {
    if (officeKey(nameKey(n)) === want) return true;
    if (officeKey(nameKey(stripParens(n))) === want) return true;
    // OSM may tag the building itself ("หอประชุมโรงเรียนX", "หอประชุมอำเภอX").
    const kb = stripBuildingPrefix(clean(stripParens(n)));
    return kb !== null && officeKey(nameKey(kb)) === want;
  });
}

function coordsOk(r) {
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) && inProvince(lon, lat);
}

/** Prefer candidates that also name the ตำบล; otherwise Nominatim's order. */
function pickBest(candidates, tambon) {
  if (candidates.length === 0) return null;
  return candidates.find((r) => mentionsTambon(r, tambon)) ?? candidates[0];
}

const COMMEMORATIVE = /^(อาคาร)?เฉลิมพระเกียรติ|\d+\s*พรรษา/;

async function findPlace(row) {
  for (const v of nameVariants(row)) {
    const queries = [v, `${v} อำเภอ${row.amphoeTh}`];
    for (const q of queries) {
      const results = await nominatim(q);
      const ok = results.filter(
        (r) => !PLACE_REJECT_CATEGORIES.has(r.category) && coordsOk(r) && inAmphoe(r, row.amphoeTh) && namesMatch(r, v),
      );
      // Commemorative building names recur across the province; only trust
      // them when the OSM address also names the shelter's ตำบล.
      const needsTambon = COMMEMORATIVE.test(v);
      const best = needsTambon ? ok.find((r) => mentionsTambon(r, row.tambonTh)) : pickBest(ok, row.tambonTh);
      if (best) return { hit: best, variant: v };
    }
  }
  return null;
}

const DISTRICT_OR_ABOVE = new Set(["county", "state", "province", "country", "region"]);

/** name / name:th / official_name — not alt_ or old_ names, which in Thai OSM
 * often carry a neighbouring or former unit's name. */
function primaryNames(r) {
  const nd = r.namedetails ?? {};
  return [...new Set([r.name, nd.name, nd["name:th"], nd.official_name].filter(Boolean).map(clean))];
}

const SETTLEMENT_TYPES = new Set(["municipality", "town", "city", "suburb", "quarter", "village", "administrative"]);
const AREA_PREFIX = /^(ตำบล|เทศบาลตำบล|เทศบาลเมือง|เทศบาลนคร|องค์การบริหารส่วนตำบล|บ้าน)/;

async function findTambon(row) {
  const tambon = row.tambonTh;
  if (!tambon) return null;
  const queries = [
    [`ตำบล${tambon}`, { featureType: "settlement" }],
    [tambon, { featureType: "settlement" }],
    [`ตำบล${tambon} อำเภอ${row.amphoeTh}`, {}],
  ];
  for (const [q, extra] of queries) {
    const results = await nominatim(q, extra);
    const ok = results.filter(
      (r) =>
        (r.category === "place" || r.category === "boundary") &&
        SETTLEMENT_TYPES.has(r.type) &&
        coordsOk(r) &&
        inAmphoe(r, row.amphoeTh) &&
        !DISTRICT_OR_ABOVE.has(r.addresstype) &&
        primaryNames(r).some((n) => clean(n).replace(AREA_PREFIX, "").replace(/\s+/g, "") === tambon.replace(/\s+/g, "")),
    );
    // Prefer a ตำบล-level feature over a same-named village.
    const best = ok.find((r) => r.type !== "village") ?? ok[0];
    if (best) return { hit: best };
  }
  return null;
}

async function findAmphoe(row) {
  const amphoe = row.amphoeTh;
  const officeName = `ที่ว่าการอำเภอ${amphoe}`;
  for (const name of [officeName, ...(SEARCH_ALIASES[officeName] ?? [])]) {
    const office = await nominatim(name);
    const o = office.find(
      (r) => !PLACE_REJECT_CATEGORIES.has(r.category) && coordsOk(r) && inAmphoe(r, amphoe) && namesMatch(r, name),
    );
    if (o) return { hit: o };
  }
  // The district seat: a settlement named after the อำเภอ (e.g. the town
  // "แม่แจ่ม") is far closer to the office than the boundary centroid.
  const seat = await nominatim(amphoe, { featureType: "settlement" });
  const t = seat.find(
    (r) =>
      r.category === "place" &&
      SETTLEMENT_TYPES.has(r.type) &&
      coordsOk(r) &&
      inAmphoe(r, amphoe) &&
      !DISTRICT_OR_ABOVE.has(r.addresstype) &&
      primaryNames(r).some((n) => clean(n).replace(AREA_PREFIX, "").replace(/\s+/g, "") === amphoe),
  );
  if (t) return { hit: t };
  const area = await nominatim(`อำเภอ${amphoe}`);
  const a = area.find(
    (r) => r.category === "boundary" && r.type === "administrative" && coordsOk(r) && osmNames(r).some((n) => clean(n) === `อำเภอ${amphoe}`),
  );
  return a ? { hit: a } : null;
}

// --------------------------------------------------------------------- run

const round = (n) => Number(Number(n).toFixed(COORD_DECIMALS));

function located(row, id, precision, found) {
  const base = {
    id,
    nameTh: row.nameTh,
    amphoeTh: row.amphoeTh,
    tambonTh: row.tambonTh,
    capacity: row.capacity,
    electricity: row.electricity,
    water: row.water,
    toilets: row.toilets,
  };
  if (!found) return { ...base, lat: null, lon: null, precision: "none", matchedName: null, osm: null };
  const r = found.hit;
  return {
    ...base,
    lat: round(r.lat),
    lon: round(r.lon),
    precision,
    matchedName: r.display_name ?? null,
    osm: r.osm_type && r.osm_id ? `${r.osm_type}/${r.osm_id}` : null,
  };
}

async function main() {
  const { text, fetchedAt, resourceUrl } = await loadCsvText();
  const { rows, skipped } = readShelterRows(text);
  console.log(`CSV: ${rows.length} shelter rows${skipped.length ? `, ${skipped.length} skipped` : ""}`);
  for (const s of skipped) console.log(`  skipped line ${s.line}: ${s.cells.join(" | ")}`);
  if (args.includes("--variants")) {
    for (const row of rows) console.log(`${row.line}\t${row.nameTh}\t→ ${nameVariants(row).join(" | ")}`);
    return;
  }

  const seen = new Map();
  const shelters = [];
  let tambonConfirmed = 0;
  for (const row of rows) {
    const id = `cm-shelter-${String(row.line - 1).padStart(3, "0")}`;
    const place = await findPlace(row);
    let s;
    if (place) {
      s = located(row, id, "place", place);
      if (mentionsTambon(place.hit, row.tambonTh)) tambonConfirmed++;
    } else {
      const tambon = await findTambon(row);
      if (tambon) s = located(row, id, "tambon", tambon);
      else s = located(row, id, "amphoe", await findAmphoe(row));
      if (s.lat === null) s = { ...s, precision: "none" };
    }
    // Exact repeats in the published list are kept (it is the official
    // list) but flagged so capacity is not double counted.
    const dupKey = `${row.amphoeTh}|${row.tambonTh}|${row.nameTh}`;
    if (seen.has(dupKey)) s = { ...s, duplicateOf: seen.get(dupKey) };
    else seen.set(dupKey, id);
    shelters.push(s);
    const tag = s.precision.padEnd(6);
    console.log(`${tag} ${id} ${row.amphoeTh}/${row.tambonTh} ${row.nameTh}${s.matchedName ? `  →  ${s.matchedName.slice(0, 90)}` : ""}`);
  }

  const counts = { total: shelters.length, place: 0, tambon: 0, amphoe: 0, none: 0 };
  for (const s of shelters) counts[s.precision]++;

  const out = {
    generatedAt: new Date().toISOString(),
    source: {
      publisher: "สำนักงานจังหวัดเชียงใหม่",
      datasetUrl: `https://chiangmai.gdcatalog.go.th/dataset/${DATASET_ID}`,
      resourceUrl,
      fetchedAt,
    },
    geocoder: "OpenStreetMap Nominatim (ODbL)",
    counts,
    shelters,
  };
  writeFileSync(OUT_PATH, `${JSON.stringify(out)}\n`);

  const dups = shelters.filter((s) => s.duplicateOf).length;
  console.log("\nSummary");
  console.log(`  total ${counts.total}: place ${counts.place}, tambon ${counts.tambon}, amphoe ${counts.amphoe}, none ${counts.none}`);
  console.log(`  place matches whose OSM address also names the ตำบล: ${tambonConfirmed}/${counts.place}`);
  console.log(`  exact duplicate rows flagged: ${dups}`);
  console.log(`  Nominatim network requests this run: ${networkRequests} (cache: ${CACHE_PATH})`);
  console.log(`  wrote ${OUT_PATH.pathname}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
