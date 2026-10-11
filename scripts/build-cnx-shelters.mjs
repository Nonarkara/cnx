#!/usr/bin/env node
// Builds public/data/cnx/shelters.json — the official Chiang Mai temporary
// flood-shelter list (ศูนย์พักพิงชั่วคราวจังหวัดเชียงใหม่, สำนักงานจังหวัด
// เชียงใหม่ via chiangmai.gdcatalog.go.th) with coordinates, so the map and
// warnings can point people at the nearest shelter. The published CSV has no
// coordinates. Also writes public/data/cnx/shelters-to-verify.csv, the
// worksheet the provincial office can use to confirm approximate points.
//
// Location sources, strongest first (see docs/SHELTERS.md):
//   - "official": a row in data/shelter-locations.csv (coordinates confirmed
//                 by a government office). Always wins over any geocode, but
//                 must lie inside the province and inside the shelter's อำเภอ
//                 (OSM district polygon) or the build fails.
//   - "place":    an OSM feature whose name EXACTLY equals one of the
//                 shelter-name variants (after normalisation), found either
//                 by Nominatim (address names the อำเภอ) or by a province-wide
//                 Overpass pass. Every place point must lie inside the OSM
//                 อำเภอ polygon. Overpass matches must also be inside the
//                 OSM ตำบล polygon where one exists, or else be the only
//                 object with that name in the district.
//   - "tambon":   no building match; a subdistrict-level point — the OSM
//                 ตำบล polygon's interior point, the subdistrict's own
//                 อบต./เทศบาล office, or a Nominatim settlement named after the
//                 ตำบล (a village of that name only when its address names
//                 the ตำบล too).
//   - "amphoe":   the district office (ที่ว่าการอำเภอ), the district seat, or
//                 an interior point of the อำเภอ polygon.
//   - "none":     nothing verified — lat/lon null. Coordinates are NEVER guessed.
//
// Network etiquette: Nominatim one request at a time, >= 1 s apart; Overpass
// three province-wide queries in total. Both send a descriptive User-Agent
// and cache every response on disk so re-runs do not re-hit the APIs.
//
// Run: node scripts/build-cnx-shelters.mjs [--refresh-csv] [--refresh-overpass]
//        [--cache <nominatim-cache.json>] [--variants]

import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const DATASET_ID = "4a375627-d76f-44d7-ac3f-d95651f0baee";
const CSV_PATH = new URL(`public/data/cnx/open-data/${DATASET_ID}.csv`, ROOT);
const INDEX_PATH = new URL("public/data/cnx/open-data/index.json", ROOT);
const RING_PATH = new URL("src/lib/cnx/province-boundary.ts", ROOT);
const OUT_PATH = new URL("public/data/cnx/shelters.json", ROOT);
const VERIFY_PATH = new URL("public/data/cnx/shelters-to-verify.csv", ROOT);
const OFFICIAL_PATH = new URL("data/shelter-locations.csv", ROOT);
const DEFAULT_CACHE =
  "/private/tmp/claude-501/-Volumes-Data-Projects-CNX/6268105c-ae5e-4932-809e-800e3c242ca4/scratchpad/nominatim-cache.json";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "cnx-dashboard/1.0 (+https://cnx.nonarkara.org)";
const MIN_INTERVAL_MS = 1100;
const VIEWBOX = "97.95,20.2,99.65,17.2"; // lon1,lat1,lon2,lat2 around the province
const RESULT_LIMIT = 10;
const MAX_RETRIES = 4;
const OVERPASS_RETRIES = 5;
const COORD_DECIMALS = 6;
/** OSM objects with the same name closer than this are one place (a school node + its campus way). */
const SAME_PLACE_M = 300;
/** How close a facility named after the ตำบล must be to vouch for a namesake village. */
const NAMESAKE_M = 3000;

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const CACHE_PATH = argValue("--cache") ?? DEFAULT_CACHE;
const REFRESH_CSV = args.includes("--refresh-csv");
const REFRESH_OVERPASS = args.includes("--refresh-overpass");

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
export function inProvince(lon, lat) {
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

const clean = (s) => (s ?? "").normalize("NFC").replace(/[\u200B\uFEFF]/g, "").replace(/\s+/g, " ").trim();

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
  let text = existsSync(CSV_PATH) ? readFileSync(CSV_PATH, "utf8") : null;
  let fetchedAt = indexEntry.fetchedAt ?? null;
  if (REFRESH_CSV || text === null) {
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
  // Reviewed 2026-10-11 against OSM (Overpass), see docs/SHELTERS.md:
  // Mae Jo was upgraded from เทศบาลตำบล to เทศบาลเมือง; OSM has the
  // relation "เทศบาลเมืองแม่โจ้" and its office node (addr:subdistrict หนองหาร).
  เทศบาลตำบลแม่โจ้: ["เทศบาลเมืองแม่โจ้"],
  // Namesake schools mapped with/without "บ้าน": the only school of that name
  // in the อำเภอ, next to the namesake village/temple.
  โรงเรียนบ้านแม่ทะลบ: ["โรงเรียนแม่ทะลบ"],
  โรงเรียนแม่สาว: ["โรงเรียนบ้านแม่สาว"],
  // The list truncates the name; the only "รวมศูนย์" school in อำเภอแม่ออน
  // is in the stated ตำบลห้วยแก้ว.
  โรงเรียนรวมศูนย์: ["โรงเรียนรวมศูนย์วัดห้วยแก้ว"],
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
  // "ตําบล" typed as nikhahit + sara aa (U+0E4D U+0E32) instead of sara am.
  let t = clean(s).replace(/ํา/g, "ำ");
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
      for (const alias of SEARCH_ALIASES[expanded] ?? []) add(alias);
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

/** "ที่ว่าการอำเภอX" and a non-area feature named "อำเภอX" are the same office. */
const officeKey = (k) => k.replace(/^ทีวาการ(?=อำเภอ)/, "");

/** Area-name key for อำเภอ/ตำบล comparisons ("ตำบลแม่ทะลบ" → "แม่ทะลบ"). */
const areaKey = (s) => clean(s).replace(/^(อำเภอ|ตำบล|อ\.|ต\.)/, "").replace(/\s+/g, "");

// ---------------------------------------------------------------- Nominatim

let cache = {};
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

// ----------------------------------------------------------------- Overpass

// Relation 1908771 is จังหวัดเชียงใหม่ (ISO3166-2 TH-50); Overpass area ids add 3.6e9.
const CM_AREA = 3600000000 + 1908771;
const HAS_NAME = `[~"^(name|name:th|alt_name|official_name|old_name)$"~"."]`;
export const OVERPASS_QUERIES = {
  // Facilities that host shelters, by tag.
  "poi-tags": `[out:json][timeout:300];
area(id:${CM_AREA})->.cm;
(
  nwr${HAS_NAME}["amenity"~"^(school|kindergarten|childcare|college|university|townhall|community_centre|social_centre|social_facility|place_of_worship|monastery|hospital|clinic|library|conference_centre|exhibition_centre|public_building)$"](area.cm);
  nwr${HAS_NAME}["building"~"^(school|kindergarten|college|university|temple|monastery|church|religious|public|civic|government)$"](area.cm);
  nwr${HAS_NAME}["office"="government"](area.cm);
  nwr${HAS_NAME}["leisure"~"^(sports_centre|stadium|sports_hall)$"](area.cm);
);
out center tags;
`,
  // The same kinds of places when they are only tagged building=yes etc.
  "poi-names": `[out:json][timeout:300];
area(id:${CM_AREA})->.cm;
(
  nwr["name"~"^(วัด|วันบ้าน|โรงเรียน|รร\\\\.|ศาลา|หอประชุม|อาคาร|โรงยิม|สนามกีฬา|องค์การบริหาร|องค์กรบริหาร|อบต|เทศบาล|ทต\\\\.|ที่ว่าการ|ทีว่าการ|ที่ทำการ|สำนักงาน|ศูนย์|สถาน|บ้านพัก|ชมรม|โบสถ์|อาราม|สวนธรรม|สวน|มหาวิทยาลัย|โถง)"](area.cm);
  nwr["name:th"~"^(วัด|โรงเรียน|องค์การบริหาร|เทศบาล|ที่ว่าการ|ศูนย์)"](area.cm);
);
out center tags;
`,
  // อำเภอ (6), เทศบาล (7) and ตำบล (8) boundaries with geometry.
  admin: `[out:json][timeout:300];
area(id:${CM_AREA})->.cm;
rel["boundary"="administrative"]["admin_level"~"^(6|7|8)$"](area.cm);
out geom;
`,
};

const overpassCachePath = (name) => join(dirname(CACHE_PATH), `overpass-${name}.json`);

/** One Overpass query, cached as {query, fetchedAt, data}; refetched only if the query text changed. */
async function overpass(name) {
  const query = OVERPASS_QUERIES[name];
  const file = overpassCachePath(name);
  if (!REFRESH_OVERPASS && existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, "utf8"));
    if (cached.query === query) return cached;
  }
  for (let attempt = 0; ; attempt++) {
    let status = 0;
    let body = null;
    try {
      const res = await fetch(OVERPASS, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
      });
      status = res.status;
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith("{")) body = JSON.parse(text);
    } catch (err) {
      if (attempt >= OVERPASS_RETRIES) throw err;
    }
    // A JSON body with a runtime-error remark is a truncated answer, not data.
    if (body && !/error|timed out/i.test(body.remark ?? "")) {
      const entry = { query, fetchedAt: new Date().toISOString(), data: body };
      writeFileSync(file, JSON.stringify(entry));
      return entry;
    }
    if (attempt >= OVERPASS_RETRIES) throw new Error(`Overpass ${name} failed (HTTP ${status}${body?.remark ? `: ${body.remark}` : ""})`);
    console.warn(`  Overpass ${name}: busy (HTTP ${status}) — retrying in ${60 * (attempt + 1)} s`);
    await sleep(60_000 * (attempt + 1));
  }
}

// ----------------------------------------------------------------- geometry

const toRad = (d) => (d * Math.PI) / 180;

function metresBetween(lon1, lat1, lon2, lat2) {
  const dy = (lat2 - lat1) * 111_320;
  const dx = (lon2 - lon1) * 111_320 * Math.cos(toRad((lat1 + lat2) / 2));
  return Math.hypot(dx, dy);
}

/**
 * Edge soup of a boundary relation from `out geom`. Even-odd ray casting
 * over all outer+inner member ways needs no ring assembly; the relation is
 * rejected (null) when its ways do not close (every way end must pair up).
 */
function relationShape(rel) {
  const segs = [];
  const ends = new Map();
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const m of rel.members ?? []) {
    if (m.type !== "way" || !Array.isArray(m.geometry) || !["outer", "inner", ""].includes(m.role ?? "")) continue;
    const pts = m.geometry.filter(Boolean).map((p) => [p.lon, p.lat]);
    if (pts.length < 2) continue;
    for (const p of [pts[0], pts.at(-1)]) ends.set(p.join(","), (ends.get(p.join(",")) ?? 0) + 1);
    for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]);
    for (const [x, y] of pts) {
      bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y);
      bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y);
    }
  }
  const closed = segs.length > 0 && [...ends.values()].every((n) => n % 2 === 0);
  return closed ? { segs, bbox } : null;
}

function inShape(shape, lon, lat) {
  const [minX, minY, maxX, maxY] = shape.bbox;
  if (lon < minX || lon > maxX || lat < minY || lat > maxY) return false;
  let inside = false;
  for (const [x1, y1, x2, y2] of shape.segs) {
    if (y1 > lat !== y2 > lat && lon < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

function distanceToEdge(shape, lon, lat, kx) {
  let best = Infinity;
  for (const [x1, y1, x2, y2] of shape.segs) {
    const ax = (x1 - lon) * kx, ay = y1 - lat, dx = (x2 - x1) * kx, dy = y2 - y1;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    const px = ax + t * dx, py = ay + t * dy;
    best = Math.min(best, px * px + py * py);
  }
  return Math.sqrt(best);
}

/** Pole-of-inaccessibility style interior point: coarse grid, then three refinements. */
function interiorPoint(shape) {
  const [minX, minY, maxX, maxY] = shape.bbox;
  const kx = Math.cos(toRad((minY + maxY) / 2));
  let [cx, cy, hw, hh] = [(minX + maxX) / 2, (minY + maxY) / 2, (maxX - minX) / 2, (maxY - minY) / 2];
  let best = null;
  for (let round = 0; round < 4; round++) {
    const n = round === 0 ? 24 : 8;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const x = cx - hw + (2 * hw * i) / n;
        const y = cy - hh + (2 * hh * j) / n;
        if (!inShape(shape, x, y)) continue;
        const d = distanceToEdge(shape, x, y, kx);
        if (!best || d > best.d) best = { x, y, d };
      }
    }
    if (!best) return null;
    [cx, cy, hw, hh] = [best.x, best.y, (3 * hw) / n, (3 * hh) / n];
  }
  return { lon: best.x, lat: best.y };
}

/** อำเภอ shapes by area key and ตำบล shapes assigned to their อำเภอ. */
function buildAdmin(admin) {
  const districts = new Map();
  const tambons = [];
  for (const e of admin.elements ?? []) {
    if (e.type !== "relation") continue;
    const name = clean(e.tags?.["name:th"] ?? e.tags?.name ?? "");
    const level = e.tags?.admin_level;
    const isDistrict = level === "6" && name.startsWith("อำเภอ");
    const isTambon = level === "8" && name.startsWith("ตำบล");
    if (!isDistrict && !isTambon) continue;
    const shape = relationShape(e);
    if (!shape) {
      console.warn(`  ! ${name} (relation/${e.id}) does not close — ignored`);
      continue;
    }
    const entry = { osm: `relation/${e.id}`, name, key: areaKey(name), shape };
    if (isDistrict) districts.set(entry.key, entry);
    else tambons.push(entry);
  }
  for (const t of tambons) {
    t.point = interiorPoint(t.shape);
    t.district = t.point ? [...districts.values()].find((d) => inShape(d.shape, t.point.lon, t.point.lat))?.key : undefined;
  }
  const tambonFor = (amphoe, tambon) =>
    tambon ? tambons.find((t) => t.district === areaKey(amphoe) && t.key === areaKey(tambon)) ?? null : null;
  const districtPointCache = new Map();
  const districtPoint = (amphoe) => {
    const d = districts.get(areaKey(amphoe));
    if (!d) return null;
    if (!districtPointCache.has(d.key)) districtPointCache.set(d.key, interiorPoint(d.shape));
    return districtPointCache.get(d.key);
  };
  const inDistrict = (amphoe, lon, lat) => {
    const d = districts.get(areaKey(amphoe));
    return d ? inShape(d.shape, lon, lat) : false;
  };
  return { districts, tambons, tambonFor, districtPoint, inDistrict };
}

// ---------------------------------------------------------- OSM name index

const NAME_TAGS = ["name", "name:th", "alt_name", "official_name", "old_name"];
const NOT_A_PLACE = ["highway", "waterway", "natural", "boundary", "place", "route", "railway", "power"];
const LANDUSE_OK = new Set(["religious", "education", "institutional", "civic"]);

function featureNames(tags) {
  const names = NAME_TAGS.flatMap((k) => String(tags[k] ?? "").split(";")).map(clean).filter(Boolean);
  return [...new Set(names)];
}

/** Keys an OSM name answers to: as written, without (…), and without a building prefix. */
function osmNameKeys(name) {
  const keys = new Map(); // key → direct?
  const add = (s, direct) => {
    if (!s) return;
    const k = nameKey(s);
    // "อำเภอX" on a building is the district office (officeKey), not an area.
    if (isGeneric(k) && !/^(ทีวาการ)?อำเภอ.{3,}/.test(k)) return;
    const ok = officeKey(k);
    if (!keys.has(ok) || direct) keys.set(ok, direct || keys.get(ok));
  };
  add(name, true);
  add(stripParens(name), true);
  add(stripBuildingPrefix(clean(stripParens(name))), false);
  return keys;
}

/** name key → [{f, direct}] over every named POI from both Overpass queries. */
function buildIndex(...responses) {
  const seen = new Set();
  const index = new Map();
  let count = 0;
  for (const res of responses) {
    for (const e of res.elements ?? []) {
      const osm = `${e.type}/${e.id}`;
      const tags = e.tags ?? {};
      if (seen.has(osm)) continue;
      seen.add(osm);
      if (NOT_A_PLACE.some((k) => tags[k]) || (tags.landuse && !LANDUSE_OK.has(tags.landuse))) continue;
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inProvince(lon, lat)) continue;
      const f = { osm, lat, lon, tags, names: featureNames(tags) };
      count++;
      for (const n of f.names) {
        for (const [k, direct] of osmNameKeys(n)) {
          const list = index.get(k) ?? [];
          if (!list.some((h) => h.f === f)) index.set(k, [...list, { f, direct }]);
        }
      }
    }
  }
  return { index, count };
}

/** Group hits that are the same place (closer than SAME_PLACE_M to a group's first hit). */
function clusterHits(hits) {
  const groups = [];
  for (const h of hits) {
    const g = groups.find((gr) => metresBetween(gr[0].f.lon, gr[0].f.lat, h.f.lon, h.f.lat) < SAME_PLACE_M);
    if (g) g.push(h);
    else groups.push([h]);
  }
  return groups;
}

const INSTITUTION_TAGS = ["amenity", "office", "leisure"];
/** Prefer an object named exactly like the variant, then the institution over a bare building. */
function representative(group) {
  const score = (h) => (h.direct ? 2 : 0) + (INSTITUTION_TAGS.some((k) => h.f.tags[k]) ? 1 : 0);
  return [...group].sort((a, b) => score(b) - score(a))[0];
}

const ADDR_TAMBON_TAGS = ["addr:subdistrict", "addr:tambon", "is_in:subdistrict"];
function addressNamesTambon(tags, tambon) {
  if (!tambon) return false;
  return ADDR_TAMBON_TAGS.some((k) => tags[k] && areaKey(tags[k]) === areaKey(tambon));
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

/** Province ring AND the shelter's OSM อำเภอ polygon. */
function coordsOk(r, amphoe, ctx) {
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) && inProvince(lon, lat) && ctx.admin.inDistrict(amphoe, lon, lat);
}

/** Prefer candidates that also name the ตำบล; otherwise Nominatim's order. */
function pickBest(candidates, tambon) {
  if (candidates.length === 0) return null;
  return candidates.find((r) => mentionsTambon(r, tambon)) ?? candidates[0];
}

const COMMEMORATIVE = /^(อาคาร)?เฉลิมพระเกียรติ|\d+\s*พรรษา/;

/** Where a place point sits relative to the stated ตำบล. */
function tambonCheckFor(row, lon, lat, ctx, addressSaysTambon) {
  const t = ctx.admin.tambonFor(row.amphoeTh, row.tambonTh);
  if (t) return inShape(t.shape, lon, lat) ? "boundary" : "outside";
  return addressSaysTambon ? "address" : "unverified";
}

async function findPlaceNominatim(row, ctx) {
  for (const v of nameVariants(row)) {
    const queries = [v, `${v} อำเภอ${row.amphoeTh}`];
    for (const q of queries) {
      const results = await nominatim(q);
      const ok = results.filter(
        (r) => !PLACE_REJECT_CATEGORIES.has(r.category) && coordsOk(r, row.amphoeTh, ctx) && inAmphoe(r, row.amphoeTh) && namesMatch(r, v),
      );
      // Commemorative building names recur across the province; only trust
      // them when the OSM address also names the shelter's ตำบล.
      const needsTambon = COMMEMORATIVE.test(v);
      const best = needsTambon ? ok.find((r) => mentionsTambon(r, row.tambonTh)) : pickBest(ok, row.tambonTh);
      if (!best) continue;
      // Nominatim's own ตำบล in display_name comes from the nearest place node,
      // so only the OSM object's addr:subdistrict counts as address evidence.
      const f = ctx.byOsm.get(`${best.osm_type}/${best.osm_id}`);
      const check = tambonCheckFor(row, Number(best.lon), Number(best.lat), ctx, Boolean(f && addressNamesTambon(f.tags, row.tambonTh)));
      // An OSM ตำบล polygon that excludes the point beats a same-named building.
      if (check === "outside") continue;
      return fromNominatim(best, "osm-building", check);
    }
  }
  return null;
}

/**
 * Overpass pass: exact normalised-name match among every named POI in the
 * province. Accepted when the object lies inside the stated ตำบล polygon,
 * or — with no polygon — when it is the only object of that name in the
 * อำเภอ (or the only one whose own addr:subdistrict names the ตำบล).
 */
function findPlaceOverpass(row, ctx) {
  const tambon = ctx.admin.tambonFor(row.amphoeTh, row.tambonTh);
  for (const v of nameVariants(row)) {
    const hits = (ctx.index.get(officeKey(nameKey(v))) ?? []).filter((h) => ctx.admin.inDistrict(row.amphoeTh, h.f.lon, h.f.lat));
    if (hits.length === 0) continue;
    let groups;
    let check;
    if (tambon) {
      groups = clusterHits(hits.filter((h) => inShape(tambon.shape, h.f.lon, h.f.lat)));
      check = "boundary";
    } else {
      groups = clusterHits(hits);
      check = "unverified";
      if (groups.length > 1) {
        groups = groups.filter((g) => g.some((h) => addressNamesTambon(h.f.tags, row.tambonTh)));
        check = "address";
      }
    }
    if (groups.length !== 1) {
      if (groups.length > 1) ctx.ambiguous.push(`${row.nameTh} (${v}): ${groups.length} objects in อำเภอ${row.amphoeTh}`);
      continue;
    }
    const best = representative(groups[0]);
    if (check === "unverified" && groups[0].some((h) => addressNamesTambon(h.f.tags, row.tambonTh))) check = "address";
    if (COMMEMORATIVE.test(v) && check === "unverified") continue;
    return fromFeature(best.f, "osm-building", check);
  }
  return null;
}

// Nominatim gives อำเภอ boundaries addresstype "county" or "district".
const DISTRICT_OR_ABOVE = new Set(["district", "county", "state", "province", "country", "region"]);

/** name / name:th / official_name — not alt_ or old_ names, which in Thai OSM
 * often carry a neighbouring or former unit's name. */
function primaryNames(r) {
  const nd = r.namedetails ?? {};
  return [...new Set([r.name, nd.name, nd["name:th"], nd.official_name].filter(Boolean).map(clean))];
}

const SETTLEMENT_TYPES = new Set(["municipality", "town", "city", "suburb", "quarter", "village", "administrative"]);
const AREA_PREFIX = /^(ตำบล|เทศบาลตำบล|เทศบาลเมือง|เทศบาลนคร|องค์การบริหารส่วนตำบล|บ้าน)/;

/** The ตำบล's own local-government office (อบต./เทศบาล), unique in the อำเภอ. */
function findTambonOffice(row, ctx) {
  const names = ["องค์การบริหารส่วนตำบล", "เทศบาลตำบล", "เทศบาลเมือง"].map((p) => `${p}${row.tambonTh}`);
  for (const n of names) {
    // Direct names only: "สนามกีฬาเทศบาลตำบลX" is not the office.
    const hits = (ctx.index.get(officeKey(nameKey(n))) ?? []).filter(
      (h) => h.direct && ctx.admin.inDistrict(row.amphoeTh, h.f.lon, h.f.lat),
    );
    const groups = clusterHits(hits);
    if (groups.length === 1) return fromFeature(representative(groups[0]).f, "osm-subdistrict-office");
  }
  return null;
}

const isVillage = (r) => r.type === "village" || r.type === "hamlet" || primaryNames(r).some((n) => n.startsWith("บ้าน"));

/** An OSM facility whose name contains the ตำบล name (โรงเรียนแม่ทะลบ, วัดเปียงหลวง…) within NAMESAKE_M, in the อำเภอ. */
function namesakeNearby(r, row, ctx) {
  const k = nameKey(row.tambonTh);
  const lon = Number(r.lon);
  const lat = Number(r.lat);
  const hit = ctx.features.find(
    (f) =>
      metresBetween(lon, lat, f.lon, f.lat) < NAMESAKE_M &&
      f.names.some((n) => nameKey(n).includes(k)) &&
      ctx.admin.inDistrict(row.amphoeTh, f.lon, f.lat),
  );
  if (hit) ctx.corroborated.push(`${row.tambonTh}: ${primaryNames(r)[0]} ← ${hit.names[0]} (${hit.osm}, ${Math.round(metresBetween(lon, lat, hit.lon, hit.lat))} m)`);
  return Boolean(hit);
}

async function findTambon(row, ctx) {
  const tambon = row.tambonTh;
  if (!tambon) return null;
  const poly = ctx.admin.tambonFor(row.amphoeTh, tambon);
  if (poly?.point) {
    return { lat: poly.point.lat, lon: poly.point.lon, matchedName: `${poly.name} (OSM boundary, interior point)`, osm: poly.osm, basis: "osm-subdistrict-boundary" };
  }
  const office = findTambonOffice(row, ctx);
  if (office) return office;
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
        coordsOk(r, row.amphoeTh, ctx) &&
        inAmphoe(r, row.amphoeTh) &&
        !DISTRICT_OR_ABOVE.has(r.addresstype) &&
        primaryNames(r).some((n) => clean(n).replace(AREA_PREFIX, "").replace(/\s+/g, "") === tambon.replace(/\s+/g, "")) &&
        // A village named after the ตำบล may sit in a neighbouring one. With
        // no ตำบล polygon in OSM, trust it only when its address names the
        // ตำบล or a mapped facility named after the ตำบล is nearby.
        (!isVillage(r) || mentionsTambon(r, tambon) || namesakeNearby(r, row, ctx)),
    );
    // Prefer a ตำบล-level feature over a same-named village.
    const best = ok.find((r) => r.type !== "village") ?? ok[0];
    if (best) return fromNominatim(best, "osm-settlement");
  }
  return null;
}

/** The ที่ว่าการอำเภอ from Overpass; with two candidates, the one tagged amenity=townhall. */
function findDistrictOfficeOverpass(row, ctx) {
  const names = [`ที่ว่าการอำเภอ${row.amphoeTh}`, ...(SEARCH_ALIASES[`ที่ว่าการอำเภอ${row.amphoeTh}`] ?? [])];
  for (const n of names) {
    const hits = (ctx.index.get(officeKey(nameKey(n))) ?? []).filter((h) => ctx.admin.inDistrict(row.amphoeTh, h.f.lon, h.f.lat));
    let groups = clusterHits(hits);
    if (groups.length > 1) groups = groups.filter((g) => g.some((h) => h.f.tags.amenity === "townhall"));
    if (groups.length === 1) return fromFeature(representative(groups[0]).f, "osm-district-office");
  }
  return null;
}

async function findAmphoe(row, ctx) {
  const viaOverpass = findDistrictOfficeOverpass(row, ctx);
  if (viaOverpass) return viaOverpass;
  const amphoe = row.amphoeTh;
  const officeName = `ที่ว่าการอำเภอ${amphoe}`;
  for (const name of [officeName, ...(SEARCH_ALIASES[officeName] ?? [])]) {
    const office = await nominatim(name);
    const o = office.find(
      (r) => !PLACE_REJECT_CATEGORIES.has(r.category) && coordsOk(r, amphoe, ctx) && inAmphoe(r, amphoe) && namesMatch(r, name),
    );
    if (o) return fromNominatim(o, "osm-district-office");
  }
  // The district seat: a settlement named after the อำเภอ (e.g. the town
  // "แม่แจ่ม") is far closer to the office than the polygon's middle.
  const seat = await nominatim(amphoe, { featureType: "settlement" });
  // A municipality boundary counts too (เทศบาลตำบลไชยปราการ), and so does a
  // municipality whose alt_name is the อำเภอ (ท่าเดื่อ–มืดกา, alt_name ดอยเต่า).
  const seatNames = (r) => [...primaryNames(r), ...String(r.namedetails?.alt_name ?? "").split(";").map(clean)];
  const t = seat.find(
    (r) =>
      (r.category === "place" || r.category === "boundary") &&
      SETTLEMENT_TYPES.has(r.type) &&
      coordsOk(r, amphoe, ctx) &&
      inAmphoe(r, amphoe) &&
      !DISTRICT_OR_ABOVE.has(r.addresstype) &&
      seatNames(r).some((n) => n.replace(AREA_PREFIX, "").replace(/\s+/g, "") === amphoe),
  );
  if (t) return fromNominatim(t, "osm-district-seat");
  const p = ctx.admin.districtPoint(amphoe);
  const d = ctx.admin.districts.get(areaKey(amphoe));
  return p ? { lat: p.lat, lon: p.lon, matchedName: `${d.name} (OSM boundary, interior point)`, osm: d.osm, basis: "osm-district-boundary" } : null;
}

// ------------------------------------------------------------ hit shapes

const round = (n) => Number(Number(n).toFixed(COORD_DECIMALS));

function fromNominatim(r, basis, tambonCheck) {
  return {
    lat: Number(r.lat),
    lon: Number(r.lon),
    matchedName: r.display_name ?? null,
    osm: r.osm_type && r.osm_id ? `${r.osm_type}/${r.osm_id}` : null,
    basis,
    ...(tambonCheck ? { tambonCheck } : {}),
  };
}

function fromFeature(f, basis, tambonCheck) {
  return { lat: f.lat, lon: f.lon, matchedName: f.names[0] ?? null, osm: f.osm, basis, ...(tambonCheck ? { tambonCheck } : {}) };
}

function baseOf(row, id) {
  return {
    id,
    nameTh: row.nameTh,
    amphoeTh: row.amphoeTh,
    tambonTh: row.tambonTh,
    capacity: row.capacity,
    electricity: row.electricity,
    water: row.water,
    toilets: row.toilets,
  };
}

function located(base, precision, hit) {
  if (!hit) return { ...base, lat: null, lon: null, precision: "none", matchedName: null, osm: null };
  const { lat, lon, ...rest } = hit;
  return { ...base, lat: round(lat), lon: round(lon), precision, ...rest };
}

// ---------------------------------------------------- official corrections

// data/shelter-locations.csv — coordinates confirmed by a government office.
// One row per shelter id (from shelters.json / shelters-to-verify.csv);
// nameTh must repeat the published name so a re-numbered list cannot attach
// a point to the wrong shelter.
export const OFFICIAL_HEADER = ["id", "nameTh", "lat", "lon", "source", "verifiedBy", "verifiedAt"];

/** Parse the corrections file. Returns rows plus every problem found (never throws). */
export function parseOfficialLocations(text) {
  const rows = parseCsv(String(text ?? "").replace(/^\uFEFF/, ""));
  if (rows.length === 0) return { rows: [], errors: ["empty file — keep the header row"] };
  const header = rows[0].map(clean);
  if (OFFICIAL_HEADER.some((h, i) => header[i] !== h)) {
    return { rows: [], errors: [`header must be: ${OFFICIAL_HEADER.join(",")}`] };
  }
  const out = [];
  const errors = [];
  const ids = new Set();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const [id, nameTh, latS, lonS, source, verifiedBy, verifiedAt] = OFFICIAL_HEADER.map((_, k) => clean(r[k]));
    const lat = Number(latS);
    const lon = Number(lonS);
    const problems = [];
    if (!/^cm-shelter-\d{3}$/.test(id)) problems.push(`bad id "${id}"`);
    if (ids.has(id)) problems.push(`id ${id} listed twice`);
    if (!nameTh) problems.push("nameTh missing");
    if (!latS || !Number.isFinite(lat) || lat < -90 || lat > 90) problems.push(`bad lat "${latS}"`);
    if (!lonS || !Number.isFinite(lon) || lon < -180 || lon > 180) problems.push(`bad lon "${lonS}"`);
    if (!verifiedBy) problems.push("verifiedBy missing");
    if (!/^\d{4}-\d{2}-\d{2}/.test(verifiedAt)) problems.push(`verifiedAt "${verifiedAt}" is not YYYY-MM-DD`);
    ids.add(id);
    if (problems.length) errors.push(`line ${line}: ${problems.join("; ")}`);
    else out.push({ line, id, nameTh, lat, lon, source, verifiedBy, verifiedAt });
  });
  return { rows: out, errors };
}

/** The shelter as placed by an official row; drops every geocode field. */
const GEOCODE_FIELDS = new Set(["lat", "lon", "precision", "matchedName", "osm", "basis", "tambonCheck"]);

export function officialShelter(s, row) {
  const base = Object.fromEntries(Object.entries(s).filter(([k]) => !GEOCODE_FIELDS.has(k)));
  return {
    ...base,
    lat: round(row.lat),
    lon: round(row.lon),
    precision: "official",
    matchedName: null,
    osm: null,
    basis: "official",
    officialSource: row.source || null,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt,
  };
}

/**
 * Overlay official rows on geocoded shelters (official always wins).
 * checks: { inProvince(lon, lat), inDistrict(amphoeTh, lon, lat) }.
 * Returns a new list plus errors; a row with any error is not applied.
 */
export function applyOfficialLocations(shelters, rows, checks) {
  const byId = new Map(shelters.map((s) => [s.id, s]));
  const errors = [];
  const accepted = new Map();
  for (const row of rows) {
    const s = byId.get(row.id);
    const where = `line ${row.line} (${row.id})`;
    if (!s) { errors.push(`${where}: no such shelter`); continue; }
    if (clean(s.nameTh) !== clean(row.nameTh)) { errors.push(`${where}: nameTh "${row.nameTh}" ≠ published "${s.nameTh}"`); continue; }
    if (!checks.inProvince(row.lon, row.lat)) { errors.push(`${where}: ${row.lat},${row.lon} is outside Chiang Mai province`); continue; }
    if (!checks.inDistrict(s.amphoeTh, row.lon, row.lat)) { errors.push(`${where}: ${row.lat},${row.lon} is outside อำเภอ${s.amphoeTh}`); continue; }
    accepted.set(row.id, row);
  }
  return { shelters: shelters.map((s) => (accepted.has(s.id) ? officialShelter(s, accepted.get(s.id)) : s)), errors };
}

function loadOfficialRows() {
  if (!existsSync(OFFICIAL_PATH)) return [];
  const { rows, errors } = parseOfficialLocations(readFileSync(OFFICIAL_PATH, "utf8"));
  if (errors.length) throw new Error(`data/shelter-locations.csv:\n  ${errors.join("\n  ")}`);
  return rows;
}

// -------------------------------------------------------- verify worksheet

const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 1 = district-level or unknown, 2 = subdistrict-level, 3 = building with ตำบล unconfirmed, 4 = building in its ตำบล. */
function verifyPriority(s) {
  if (s.precision === "none" || s.precision === "amphoe") return 1;
  if (s.precision === "tambon") return 2;
  return s.tambonCheck === "boundary" || s.tambonCheck === "address" ? 4 : 3;
}

export const VERIFY_HEADER = [
  "priority", "id", "nameTh", "tambon", "amphoe", "capacity", "precision", "basis", "currentLat", "currentLon",
  "osmLink", "googleMapsSearch", "verifiedLat", "verifiedLon", "verifiedBy", "verifiedAt", "note",
];

function verifyRows(shelters) {
  return shelters
    .filter((s) => s.precision !== "official" && !s.duplicateOf)
    .map((s) => ({ s, p: verifyPriority(s) }))
    .sort((a, b) => a.p - b.p || a.s.id.localeCompare(b.s.id))
    .map(({ s, p }) => {
      const osmLink = s.osm
        ? `https://www.openstreetmap.org/${s.osm}`
        : s.lat !== null ? `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=16/${s.lat}/${s.lon}` : "";
      const q = `${s.nameTh} ต.${s.tambonTh ?? ""} อ.${s.amphoeTh} จ.เชียงใหม่`;
      const gmaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
      return [p, s.id, s.nameTh, s.tambonTh, s.amphoeTh, s.capacity, s.precision, s.basis ?? "", s.lat, s.lon, osmLink, gmaps, "", "", "", "", ""];
    });
}

function writeVerifyCsv(shelters) {
  const lines = [VERIFY_HEADER, ...verifyRows(shelters)].map((r) => r.map(csvCell).join(","));
  // BOM so Excel opens the Thai text as UTF-8.
  writeFileSync(VERIFY_PATH, `\uFEFF${lines.join("\r\n")}\r\n`);
  return lines.length - 1;
}

// --------------------------------------------------------------------- run

const PRECISIONS = ["official", "place", "tambon", "amphoe", "none"];

async function locate(row, ctx) {
  const place = (await findPlaceNominatim(row, ctx)) ?? findPlaceOverpass(row, ctx);
  if (place) return ["place", place];
  const tambon = await findTambon(row, ctx);
  if (tambon) return ["tambon", tambon];
  const amphoe = await findAmphoe(row, ctx);
  return amphoe ? ["amphoe", amphoe] : ["none", null];
}

function stackReport(shelters) {
  const byCoord = new Map();
  for (const s of shelters) {
    if (s.lat === null || s.duplicateOf) continue;
    const k = `${s.lat},${s.lon}`;
    byCoord.set(k, [...(byCoord.get(k) ?? []), s]);
  }
  return [...byCoord.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
}

async function main() {
  if (existsSync(CACHE_PATH)) cache = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  const { text, fetchedAt, resourceUrl } = await loadCsvText();
  const { rows, skipped } = readShelterRows(text);
  console.log(`CSV: ${rows.length} shelter rows${skipped.length ? `, ${skipped.length} skipped` : ""}`);
  for (const s of skipped) console.log(`  skipped line ${s.line}: ${s.cells.join(" | ")}`);
  if (args.includes("--variants")) {
    for (const row of rows) console.log(`${row.line}\t${row.nameTh}\t→ ${nameVariants(row).join(" | ")}`);
    return;
  }

  const [poiTags, poiNames, adminRes] = [await overpass("poi-tags"), await overpass("poi-names"), await overpass("admin")];
  const admin = buildAdmin(adminRes.data);
  const { index, count } = buildIndex(poiTags.data, poiNames.data);
  console.log(`Overpass: ${count} named POIs, ${admin.districts.size} อำเภอ polygons, ${admin.tambons.length} ตำบล polygons`);
  const features = [...new Map([...index.values()].flat().map((h) => [h.f.osm, h.f])).values()];
  const byOsm = new Map(features.map((f) => [f.osm, f]));
  const ctx = { admin, index, features, byOsm, ambiguous: [], corroborated: [] };

  const seen = new Map();
  let shelters = [];
  for (const row of rows) {
    const id = `cm-shelter-${String(row.line - 1).padStart(3, "0")}`;
    const [precision, hit] = await locate(row, ctx);
    let s = located(baseOf(row, id), precision, hit);
    // Exact repeats in the published list are kept (it is the official
    // list) but flagged so capacity is not double counted.
    const dupKey = `${row.amphoeTh}|${row.tambonTh}|${row.nameTh}`;
    if (seen.has(dupKey)) s = { ...s, duplicateOf: seen.get(dupKey) };
    else seen.set(dupKey, id);
    shelters.push(s);
  }

  const official = applyOfficialLocations(shelters, loadOfficialRows(), { inProvince, inDistrict: admin.inDistrict });
  if (official.errors.length) throw new Error(`data/shelter-locations.csv:\n  ${official.errors.join("\n  ")}`);
  shelters = official.shelters;

  for (const s of shelters) {
    const tag = `${s.precision.padEnd(8)} ${(s.basis ?? "").padEnd(24)} ${(s.tambonCheck ?? "").padEnd(10)}`;
    console.log(`${tag} ${s.id} ${s.amphoeTh}/${s.tambonTh} ${s.nameTh}${s.matchedName ? `  →  ${s.matchedName.slice(0, 80)}` : ""}`);
  }

  const counts = Object.fromEntries([["total", shelters.length], ...PRECISIONS.map((p) => [p, 0])]);
  for (const s of shelters) counts[s.precision]++;

  const out = {
    generatedAt: new Date().toISOString(),
    source: {
      publisher: "สำนักงานจังหวัดเชียงใหม่",
      datasetUrl: `https://chiangmai.gdcatalog.go.th/dataset/${DATASET_ID}`,
      resourceUrl,
      fetchedAt,
    },
    geocoder: "OpenStreetMap — Overpass API + Nominatim (ODbL)",
    osmDataAt: poiTags.data.osm3s?.timestamp_osm_base ?? null,
    counts,
    shelters,
  };
  writeFileSync(OUT_PATH, `${JSON.stringify(out)}\n`);
  const toVerify = writeVerifyCsv(shelters);

  const basisCounts = {};
  for (const s of shelters) basisCounts[s.basis ?? "none"] = (basisCounts[s.basis ?? "none"] ?? 0) + 1;
  const checks = {};
  for (const s of shelters.filter((x) => x.precision === "place")) checks[s.tambonCheck] = (checks[s.tambonCheck] ?? 0) + 1;
  console.log("\nSummary");
  console.log(`  total ${counts.total}: ${PRECISIONS.map((p) => `${p} ${counts[p]}`).join(", ")}`);
  console.log(`  basis: ${JSON.stringify(basisCounts)}`);
  console.log(`  place points vs stated ตำบล: ${JSON.stringify(checks)}`);
  console.log(`  exact duplicate rows flagged: ${shelters.filter((s) => s.duplicateOf).length}`);
  for (const g of stackReport(shelters)) {
    console.log(`  stacked ×${g.length} at ${g[0].lat},${g[0].lon} (${[...new Set(g.map((s) => s.precision))].join("/")}): ${g.map((s) => s.id).join(" ")}`);
  }
  for (const a of ctx.ambiguous) console.log(`  ambiguous (not used): ${a}`);
  for (const c of new Set(ctx.corroborated)) console.log(`  namesake village vouched for: ${c}`);
  console.log(`  Nominatim network requests this run: ${networkRequests} (cache: ${CACHE_PATH})`);
  console.log(`  wrote ${OUT_PATH.pathname} and ${VERIFY_PATH.pathname} (${toVerify} rows to verify)`);
}

// For tests and one-off inspection scripts.
export const internals = { nameKey, officeKey, nameVariants, buildAdmin, buildIndex, areaKey, readShelterRows };

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
