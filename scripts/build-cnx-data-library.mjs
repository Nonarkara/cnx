#!/usr/bin/env node
// build-cnx-data-library.mjs
//
// Turns every data.go.th dataset that matches "เชียงใหม่" into a
// browsable "data workbench" (modelled on Lopburi's /lopburi/data):
//
//   1. Lists all matching datasets through CKAN package_search.
//   2. Mirrors every tabular resource (CSV / XLSX / JSON / …) to a local
//      folder (default /Volumes/Data/CNX/data-library-mirror) so the raw
//      files are kept, not just linked. `--all-files` also mirrors PDFs,
//      images, shapefiles etc.
//   3. Parses each table (datastore API when the portal has one, else the
//      downloaded file), detects columns (numeric / time / location) and
//      keeps at most PREVIEW_ROWS rows — with the true row total and an
//      explicit `truncated` flag, never a silent cut.
//   4. Writes public/data/cnx/data-library/
//        index.json            catalog + summary stats (one fetch)
//        datasets/<name>.json  full metadata + table previews (lazy)
//
// Unreadable resources are recorded with a reason, not dropped.
//
//   node scripts/build-cnx-data-library.mjs [--resume] [--all-files] [--limit N]
//
// No dependencies: CSV, XLSX (zip + XML) and JSON parsing are built in.

import { mkdir, writeFile, readFile, stat, readdir } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { inflateRawSync } from "node:zlib";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "public", "data", "cnx", "data-library");
const MIRROR = process.env.CNX_DATA_MIRROR ?? "/Volumes/Data/CNX/data-library-mirror";
const CKAN = "https://data.go.th/api/3/action";
const UA = "cnx-dashboard-datalib/1.0 (https://cnx.nonarkara.org)";

const PREVIEW_ROWS = 1000;
const MAX_COLS = 60;
// A dataset file is fetched whole when someone opens it, so bound its size:
// at most CELL_BUDGET cells per table (wide tables get fewer rows), and at
// most MAX_TABLES_PER_DATASET tables previewed per dataset.
const CELL_BUDGET = 40_000;
const MAX_TABLES_PER_DATASET = 12;
const MAX_CELL = 160;
const MAX_TABLE_BYTES = 200 * 1024 * 1024; // skip downloading tables bigger than this
const PARSE_HEAD_BYTES = 30 * 1024 * 1024; // parse only the head of files above this
const CONCURRENCY = 5;

const args = new Set(process.argv.slice(2));
const RESUME = args.has("--resume");
const ALL_FILES = args.has("--all-files");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i > -1 ? Number(process.argv[i + 1]) : Infinity;
})();

// ─── helpers ────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(800 * (i + 1));
    }
  }
  throw last;
}

async function ckan(path) {
  return withRetry(async () => {
    const res = await fetch(`${CKAN}${path}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(`${path} → success=false`);
    return json.result;
  });
}

async function pool(items, worker, size = CONCURRENCY) {
  let next = 0;
  const runners = Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

const safeName = (s) => s.replace(/[^\w.\-฀-๿]+/g, "_").slice(0, 120) || "file";

function fileNameFromUrl(url, fallback) {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "");
    return safeName(last || fallback);
  } catch {
    return safeName(fallback);
  }
}

// ─── domain classification (Thai keywords, first match wins) ────────

const DOMAINS = [
  ["tourism", "การท่องเที่ยว", "Tourism", /ท่องเที่ยว|นักท่องเที่ยว|โรงแรม|ที่พัก|ไนท์ซาฟารี|ททท|ไกด์|มัคคุเทศก์|homestay|tourism/i],
  ["disaster", "ภัยพิบัติและน้ำ", "Disaster & water", /น้ำท่วม|อุทกภัย|ภัยพิบัติ|ภัยแล้ง|ระดับน้ำ|ชลประทาน|เขื่อน|ปภ\.|วาตภัย|ดินโคลน|น้ำหลาก|สาธารณภัย/],
  ["environment", "สิ่งแวดล้อมและป่าไม้", "Environment & forest", /ฝุ่น|pm2\.5|ป่า|อากาศ(?!ยาน)|น้ำเสีย|ขยะ|ทรัพยากร|คุณภาพน้ำ|ไฟป่า|จุดความร้อน|อุทยาน|สิ่งแวดล้อม|มลพิษ|สัตว์ป่า|พื้นที่สีเขียว/i],
  ["agriculture", "เกษตรกรรม", "Agriculture", /เกษตร|พืช|ข้าว|ปศุสัตว์|ประมง|หม่อนไหม|ผลไม้|ลำไย|ปุ๋ย|สหกรณ์|ไร่|สวน|ยางพารา|กาแฟ|เมล็ดพันธุ์|แปลงใหญ่/],
  ["budget", "งบประมาณและการคลัง", "Budget & finance", /งบประมาณ|รายรับ|รายจ่าย|คลัง|ภาษี|งบ|หนี้|เงินอุดหนุน|พัสดุ|จัดซื้อ|จัดจ้าง|เงินสะสม|งบลงทุน|ทรัพย์สิน|ครุภัณฑ์/],
  ["health", "สาธารณสุข", "Health", /สาธารณสุข|โรงพยาบาล|โรค|สุขภาพ|อนามัย|ผู้ป่วย|วัคซีน|แพทย์|พยาบาล|สถานพยาบาล|ยาเสพติด|ทันตกรรม/],
  ["education", "การศึกษา", "Education", /การศึกษา|โรงเรียน|นักเรียน|ครู|มหาวิทยาลัย|สถานศึกษา|นักศึกษา|วิทยาลัย/],
  ["transport", "ขนส่งและจราจร", "Transport", /ขนส่ง|จราจร|รถโดยสาร|ถนน|อุบัติเหตุ|เที่ยวบิน|สนามบิน|ทางหลวง|ระบบราง|รถไฟ|ท่าอากาศยาน|ยานพาหนะ|ใบขับขี่/],
  ["society", "ประชากรและสังคม", "Population & society", /ประชากร|ครัวเรือน|ทะเบียนราษฎร|คนพิการ|ผู้สูงอายุ|สวัสดิการ|ยากจน|แรงงาน|การเกิด|ว่างงาน|เด็ก|สตรี|ชนกลุ่มน้อย|ชาติพันธุ์|ประกันสังคม/],
  ["urban", "เมืองและที่อยู่อาศัย", "Urban & housing", /ที่อยู่อาศัย|การเคหะ|ผังเมือง|อาคาร|ที่ดิน|พิงคนคร|ชุมชน|สาธารณูปโภค|ประปา|ไฟฟ้า|พลังงาน/],
  ["economy", "เศรษฐกิจและการค้า", "Economy & trade", /อุตสาหกรรม|การค้า|ตลาด|ราคา|วิสาหกิจ|โรงงาน|ธุรกิจ|ส่งออก|สินค้า|ผลิตภัณฑ์|โอทอป|otop|เศรษฐกิจ|gpp/i],
  ["admin", "การปกครองและความมั่นคง", "Governance & security", /ตำรวจ|อาชญากรรม|คดี|ความปลอดภัย|ปกครอง|อำเภอ|ท้องถิ่น|เลือกตั้ง|อปท|อบต|เทศบาล|กำนัน|ผู้ใหญ่บ้าน|ข้าราชการ|บุคลากร/],
  ["culture", "ศิลปวัฒนธรรม", "Culture & heritage", /วัฒนธรรม|ศาสนา|(?<!ห)วัด|ประเพณี|ศิลป|มรดก|ล้านนา|โบราณสถาน|พิพิธภัณฑ์|ภูมิปัญญา/],
];

function classify(pkg) {
  const hay = [pkg.title, pkg.notes, (pkg.tags ?? []).map((t) => t.name).join(" "), pkg.organization?.title].join(" ");
  const title = pkg.title ?? "";
  // Title match beats a keyword buried in notes/organisation.
  for (const [key, th, en, re] of DOMAINS) if (re.test(title)) return { key, th, en };
  for (const [key, th, en, re] of DOMAINS) if (re.test(hay)) return { key, th, en };
  return { key: "other", th: "อื่น ๆ", en: "Other" };
}

// ─── decoding, CSV, JSON, XLSX ──────────────────────────────────────

function decodeText(buf) {
  let b = buf;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    // Thai government exports are very often TIS-620 / Windows-874.
    return new TextDecoder("windows-874").decode(b);
  }
}

function detectDelimiter(text) {
  const head = text.slice(0, 4000).split(/\r?\n/).slice(0, 5).join("\n");
  const score = (d) => head.split(d).length;
  return [",", ";", "\t", "|"].sort((a, b) => score(b) - score(a))[0];
}

function parseCsv(text, delim) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQ = false;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += c;
    } else if (c === '"' && cell === "") inQ = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

function unzipEntries(buf) {
  // Minimal zip reader: walks the central directory.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + csize);
    out.set(name, () => (method === 0 ? raw : inflateRawSync(raw)));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const xmlUnescape = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");

function colIndex(ref) {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseXlsx(buf) {
  const zip = unzipEntries(buf);
  const get = (name) => (zip.has(name) ? zip.get(name)().toString("utf8") : null);
  const shared = [];
  const sst = get("xl/sharedStrings.xml");
  if (sst) {
    for (const si of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const parts = [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlUnescape(m[1]));
      shared.push(parts.join(""));
    }
  }
  const sheets = [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  let best = { rows: [], sheet: null };
  for (const name of sheets) {
    const xml = get(name);
    const rows = [];
    for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
        if (!ref) continue;
        const type = /t="(\w+)"/.exec(attrs)?.[1];
        const body = c[2] ?? "";
        let val = "";
        if (type === "s") val = shared[Number(/<v>(\d+)<\/v>/.exec(body)?.[1])] ?? "";
        else if (type === "inlineStr") val = xmlUnescape([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
        else val = xmlUnescape(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
        cells[colIndex(ref)] = val;
      }
      if (cells.some((v) => v !== undefined && v !== "")) rows.push(Array.from(cells, (v) => v ?? ""));
    }
    if (rows.length > best.rows.length) best = { rows, sheet: name };
  }
  return { rows: best.rows, sheetCount: sheets.length };
}

function rowsFromJson(value) {
  // Accept: array of objects | CKAN/datastore style | {data|result|records|items:[…]}.
  let v = value;
  for (let depth = 0; depth < 3 && v && !Array.isArray(v) && typeof v === "object"; depth++) {
    const key = ["records", "data", "result", "items", "rows", "features", "results"].find((k) => Array.isArray(v[k]) || (v[k] && typeof v[k] === "object"));
    if (!key) break;
    v = v[key];
  }
  if (!Array.isArray(v) || v.length === 0) return null;
  const flat = v.map((o) => {
    if (o && typeof o === "object" && !Array.isArray(o)) {
      const src = o.properties && typeof o.properties === "object" ? { ...o.properties, ...(o.geometry ? { geometry: o.geometry.type } : {}) } : o;
      const out = {};
      for (const [k, val] of Object.entries(src)) out[k] = val !== null && typeof val === "object" ? JSON.stringify(val) : val;
      return out;
    }
    return null;
  });
  if (flat.some((x) => x === null)) return null;
  const cols = [];
  const seen = new Set();
  for (const o of flat.slice(0, 200)) for (const k of Object.keys(o)) if (!seen.has(k)) (seen.add(k), cols.push(k));
  return [cols, ...flat.map((o) => cols.map((c) => o[c] ?? ""))];
}

// ─── column analysis ────────────────────────────────────────────────

const NUM = /^[\s+-]?\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*%?$|^[\s+-]?\d+(?:\.\d+)?\s*%?$/;
const isNum = (s) => typeof s === "number" || (typeof s === "string" && s.trim() !== "" && NUM.test(s.trim()));
const LAT = /(^|[^a-z])(lat|latitude)([^a-z]|$)|ละติจูด|^y$/i;
const LON = /(^|[^a-z])(lon|lng|long|longitude)([^a-z]|$)|ลองจิจูด|^x$/i;
const TIMEISH = /ปี|เดือน|วันที่|วัน\b|date|year|month|time|ไตรมาส|quarter|พ\.ศ\.|ค\.ศ\./i;

function analyseColumns(header, dataRows) {
  const cols = header.map((raw, i) => {
    const name = String(raw ?? "").trim() || `col_${i + 1}`;
    const sample = dataRows.slice(0, 300).map((r) => r[i]).filter((v) => v !== "" && v !== null && v !== undefined);
    const numeric = sample.length >= 3 && sample.filter(isNum).length / sample.length >= 0.9;
    let kind = numeric ? "number" : "text";
    const yearish = numeric && sample.every((v) => /^\s*(19|20|25)\d{2}\s*$/.test(String(v)));
    const dateish = !numeric && sample.length && sample.filter((v) => /^\d{4}-\d{2}-\d{2}|^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(String(v))).length / sample.length > 0.8;
    // A numeric column whose name merely mentions a year ("ประมาณการ ปี 2568")
    // is a measure, not a time axis — only year-like values make it time.
    if (yearish || dateish || (!numeric && TIMEISH.test(name))) kind = "time";
    if (numeric && (LAT.test(name) || LON.test(name))) kind = "geo";
    return { name, kind };
  });
  const hasLat = cols.some((c) => c.kind === "geo" && LAT.test(c.name));
  const hasLon = cols.some((c) => c.kind === "geo" && LON.test(c.name));
  const geoText = cols.some((c) => /geometry|wkt|geojson|พิกัด/i.test(c.name));
  return {
    columns: cols,
    hasLocation: (hasLat && hasLon) || geoText,
    hasTime: cols.some((c) => c.kind === "time"),
    numericCount: cols.filter((c) => c.kind === "number").length,
  };
}

function toTable(rows, meta) {
  if (!rows || rows.length < 2) return null;
  const width = Math.min(MAX_COLS, Math.max(...rows.slice(0, 50).map((r) => r.length)));
  const header = Array.from({ length: width }, (_, i) => rows[0][i] ?? "");
  const body = rows.slice(1);
  const clip = (v) => {
    const s = v === null || v === undefined ? "" : typeof v === "number" ? v : String(v);
    return typeof s === "string" && s.length > MAX_CELL ? `${s.slice(0, MAX_CELL)}…` : s;
  };
  const rowCap = Math.max(50, Math.min(PREVIEW_ROWS, Math.floor(CELL_BUDGET / Math.max(1, width))));
  const preview = body.slice(0, rowCap).map((r) => Array.from({ length: width }, (_, i) => clip(r[i])));
  const analysis = analyseColumns(header, preview);
  const totalRows = meta.totalRows ?? body.length;
  return {
    ...analysis,
    rows: preview,
    previewRows: preview.length,
    totalRows,
    truncated: totalRows > preview.length || meta.partial === true,
    columnsTruncated: Math.max(...rows.slice(0, 50).map((r) => r.length)) > MAX_COLS,
  };
}

// ─── download + parse one resource ──────────────────────────────────

const TABULAR = new Set(["CSV", "XLSX", "JSON", "XLS", "XSL", "TSV", "TXT"]);

async function download(url, dest, maxBytes) {
  if (existsSync(dest)) {
    const s = await stat(dest);
    if (s.size > 0) return { path: dest, bytes: s.size, cached: true };
  }
  return withRetry(async () => {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(180_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (maxBytes && len > maxBytes) throw Object.assign(new Error(`too large (${len} bytes)`), { tooLarge: true });
    const ctype = res.headers.get("content-type") ?? "";
    await mkdir(dirname(dest), { recursive: true });
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
    const s = await stat(dest);
    return { path: dest, bytes: s.size, contentType: ctype };
  }, 2);
}

async function readTableFromFile(path, fmt) {
  const buf = await readFile(path);
  const partial = buf.length > PARSE_HEAD_BYTES;
  if (fmt === "XLSX") {
    const { rows, sheetCount } = parseXlsx(buf);
    return { table: toTable(rows, { totalRows: Math.max(0, rows.length - 1) }), note: sheetCount > 1 ? `${sheetCount} sheets — largest shown` : undefined };
  }
  if (fmt === "XLS" || fmt === "XSL") return { table: null, reason: "legacy binary .xls — open at source" };
  const head = partial ? buf.subarray(0, PARSE_HEAD_BYTES) : buf;
  const text = decodeText(head);
  const trimmed = text.trimStart();
  if (fmt === "JSON" || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    if (partial) return { table: null, reason: `JSON larger than ${Math.round(PARSE_HEAD_BYTES / 1e6)} MB — open at source` };
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return { table: null, reason: "not valid JSON" };
    }
    const rows = rowsFromJson(json);
    if (!rows) return { table: null, reason: "JSON is not a flat list of records" };
    return { table: toTable(rows, { totalRows: rows.length - 1 }) };
  }
  if (/<html[\s>]/i.test(trimmed.slice(0, 500))) return { table: null, reason: "link points to a web page, not a data file" };
  const delim = detectDelimiter(text);
  let cut = text;
  if (partial) cut = text.slice(0, text.lastIndexOf("\n"));
  const rows = parseCsv(cut, delim);
  let totalRows = rows.length - 1;
  if (partial) {
    let nl = 0;
    for (let i = 0; i < buf.length; i++) if (buf[i] === 10) nl++;
    totalRows = Math.max(totalRows, nl - 1);
  }
  return { table: toTable(rows, { totalRows, partial }), note: partial ? "very large file — preview from the head only" : undefined };
}

async function readTableFromDatastore(rid) {
  const res = await ckan(`/datastore_search?resource_id=${rid}&limit=${PREVIEW_ROWS}`);
  const fields = res.fields.filter((f) => f.id !== "_id");
  if (!fields.length) return null;
  const rows = [fields.map((f) => f.id), ...res.records.map((rec) => fields.map((f) => rec[f.id]))];
  return toTable(rows, { totalRows: res.total ?? rows.length - 1 });
}

// ─── per dataset ────────────────────────────────────────────────────

function pickTableResources(resources) {
  // Same table is often published as CSV + XLSX + JSON. Keep one per
  // logical name, preferring CSV > XLSX > JSON.
  const rank = { CSV: 0, XLSX: 1, JSON: 2, XLS: 3, XSL: 3, TSV: 0, TXT: 4 };
  const groups = new Map();
  for (const r of resources) {
    const fmt = (r.format || "").toUpperCase();
    if (!TABULAR.has(fmt)) continue;
    const stem = (r.name || "").replace(/\.(csv|xlsx?|json|tsv|txt)$/i, "").trim().toLowerCase();
    const key = stem || r.id;
    const cur = groups.get(key);
    if (!cur || rank[fmt] < rank[(cur.format || "").toUpperCase()]) groups.set(key, r);
  }
  return [...groups.values()];
}

async function processDataset(pkg) {
  const domain = classify(pkg);
  const resources = (pkg.resources ?? []).map((r) => ({
    id: r.id,
    name: r.name || r.description || "",
    format: (r.format || "").toUpperCase() || "?",
    size: r.size ? Number(r.size) || null : null,
    url: r.url || "",
    modified: r.last_modified || r.metadata_modified || null,
    datastore: r.datastore_active === true,
  }));
  const tables = [];
  const unreadable = [];
  const allPicked = pickTableResources(pkg.resources ?? []);
  const picked = allPicked.slice(0, MAX_TABLES_PER_DATASET);
  const pickedIds = new Set(picked.map((r) => r.id));

  for (const r of picked) {
    const fmt = (r.format || "").toUpperCase();
    const base = { resourceId: r.id, name: r.name || r.id, format: fmt, sourceUrl: r.url, size: Number(r.size) || null };
    try {
      let table = null;
      let note;
      if (r.datastore_active && fmt !== "XLSX") {
        try {
          table = await readTableFromDatastore(r.id);
        } catch {
          table = null;
        }
      }
      if (!table) {
        if (!r.url || !/^https?:/i.test(r.url)) {
          unreadable.push({ ...base, reason: "no downloadable URL" });
          continue;
        }
        const dest = join(MIRROR, safeName(pkg.name), `${r.id.slice(0, 8)}_${fileNameFromUrl(r.url, `${r.id}.${fmt.toLowerCase()}`)}`);
        const dl = await download(r.url, dest, MAX_TABLE_BYTES);
        const parsed = await readTableFromFile(dl.path, fmt);
        table = parsed.table;
        note = parsed.note;
        if (!table) {
          unreadable.push({ ...base, reason: parsed.reason ?? "no rows found" });
          continue;
        }
      }
      tables.push({ ...base, note, ...table });
    } catch (e) {
      unreadable.push({ ...base, reason: e.tooLarge ? String(e.message) : `download/parse failed: ${e.message}` });
    }
  }

  for (const r of allPicked.slice(MAX_TABLES_PER_DATASET)) {
    unreadable.push({
      resourceId: r.id,
      name: r.name || r.id,
      format: (r.format || "").toUpperCase(),
      sourceUrl: r.url,
      size: Number(r.size) || null,
      reason: `preview limit — first ${MAX_TABLES_PER_DATASET} tables shown, open the rest at the publisher`,
    });
  }

  // Non-table resources: mirrored on request, always listed with their source link.
  const files = [];
  for (const r of resources) {
    if (pickedIds.has(r.id)) continue;
    let mirrored = false;
    if (ALL_FILES && /^https?:/i.test(r.url) && r.format !== "URL" && r.format !== "API") {
      try {
        await download(r.url, join(MIRROR, safeName(pkg.name), `${r.id.slice(0, 8)}_${fileNameFromUrl(r.url, `${r.id}.${r.format.toLowerCase()}`)}`), 0);
        mirrored = true;
      } catch {
        mirrored = false;
      }
    }
    files.push({ ...r, mirrored });
  }

  const spatialFormats = resources.some((r) => ["SHP", "KML", "KMZ", "GEOJSON", "GPKG"].includes(r.format));
  const hasLocation = spatialFormats || tables.some((t) => t.hasLocation);
  const hasTime = tables.some((t) => t.hasTime);
  const numericCount = tables.reduce((m, t) => Math.max(m, t.numericCount), 0);
  const totalRows = tables.reduce((s, t) => s + t.totalRows, 0);
  const fields = tables.reduce((m, t) => Math.max(m, t.columns.length), 0);
  const status = tables.length ? "ready" : resources.some((r) => /^https?:/i.test(r.url) && r.format !== "URL") ? "files" : "link";

  const formats = [...new Set(resources.map((r) => r.format))].filter((f) => f !== "?");
  const detail = {
    id: pkg.id,
    name: pkg.name,
    title: pkg.title,
    notes: pkg.notes || "",
    org: pkg.organization?.title ?? "",
    domain: domain.key,
    tags: (pkg.tags ?? []).map((t) => t.name),
    license: pkg.license_title || pkg.license_id || "",
    accessCondition: pkg.accessible_condition || "",
    dataSource: pkg.data_source || "",
    maintainer: pkg.maintainer || "",
    firstYear: pkg.first_year_of_data || "",
    lastYear: pkg.last_year_of_data || "",
    created: pkg.metadata_created,
    modified: pkg.metadata_modified,
    portalUrl: `https://data.go.th/dataset/${pkg.name}`,
    tables,
    unreadable,
    files,
  };
  const summary = {
    id: pkg.id,
    name: pkg.name,
    title: pkg.title,
    org: detail.org,
    domain: domain.key,
    formats,
    resourceCount: resources.length,
    tableCount: tables.length,
    rows: totalRows,
    fields,
    hasLocation,
    hasTime,
    numericCount,
    status,
    modified: pkg.metadata_modified,
    license: detail.license,
    unreadableCount: unreadable.length,
  };
  return { detail, summary };
}

// ─── main ───────────────────────────────────────────────────────────

async function main() {
  await mkdir(join(OUT, "datasets"), { recursive: true });
  await mkdir(MIRROR, { recursive: true });

  console.log("[lib] listing datasets…");
  const packages = [];
  // The Thai query is the one the portal search uses (311 datasets). The
  // English "Chiang Mai" query drags in hundreds of other provinces' datasets.
  for (const q of ["เชียงใหม่"]) {
    let start = 0;
    while (true) {
      const res = await ckan(`/package_search?q=${encodeURIComponent(q)}&rows=100&start=${start}`);
      packages.push(...res.results);
      start += res.results.length;
      if (!res.results.length || start >= res.count) break;
    }
  }
  const unique = [...new Map(packages.map((p) => [p.id, p])).values()].slice(0, LIMIT);
  console.log(`[lib] ${unique.length} unique datasets`);

  const summaries = new Array(unique.length);
  let done = 0;
  await pool(unique, async (pkg, i) => {
    const file = join(OUT, "datasets", `${safeName(pkg.name)}.json`);
    try {
      if (RESUME && existsSync(file)) {
        const prev = JSON.parse(await readFile(file, "utf8"));
        if (prev.modified === pkg.metadata_modified && prev._summary) {
          summaries[i] = prev._summary;
          done++;
          return;
        }
      }
      const { detail, summary } = await processDataset(pkg);
      await writeFile(file, JSON.stringify({ ...detail, _summary: summary }));
      summaries[i] = summary;
    } catch (e) {
      console.warn(`[lib] ${pkg.name} failed: ${e.message}`);
      summaries[i] = { id: pkg.id, name: pkg.name, title: pkg.title, org: pkg.organization?.title ?? "", domain: classify(pkg).key, formats: [], resourceCount: (pkg.resources ?? []).length, tableCount: 0, rows: 0, fields: 0, hasLocation: false, hasTime: false, numericCount: 0, status: "link", modified: pkg.metadata_modified, license: "", unreadableCount: 0 };
    }
    done++;
    if (done % 10 === 0 || done === unique.length) console.log(`[lib] ${done}/${unique.length}`);
  });

  const list = summaries.filter(Boolean);
  const ready = list.filter((d) => d.status === "ready");
  const domainCounts = new Map();
  for (const d of list) {
    const e = domainCounts.get(d.domain) ?? { key: d.domain, datasets: 0, tables: 0, rows: 0, spatial: 0 };
    e.datasets++;
    e.tables += d.tableCount;
    e.rows += d.rows;
    if (d.hasLocation) e.spatial++;
    domainCounts.set(d.domain, e);
  }
  const domainMeta = Object.fromEntries([...DOMAINS, ["other", "อื่น ๆ", "Other"]].map((d) => [d[0], { th: d[1], en: d[2] }]));
  const index = {
    generatedAt: new Date().toISOString(),
    source: "data.go.th (CKAN) — search: เชียงใหม่",
    previewRowCap: PREVIEW_ROWS,
    stats: {
      datasets: list.length,
      resources: list.reduce((s, d) => s + d.resourceCount, 0),
      readyDatasets: ready.length,
      tables: list.reduce((s, d) => s + d.tableCount, 0),
      rows: list.reduce((s, d) => s + d.rows, 0),
      spatial: list.filter((d) => d.hasLocation).length,
      timeIndexed: list.filter((d) => d.hasTime).length,
      numeric: list.filter((d) => d.numericCount > 0).length,
      filesOnly: list.filter((d) => d.status === "files").length,
      linkOnly: list.filter((d) => d.status === "link").length,
      unreadableResources: list.reduce((s, d) => s + d.unreadableCount, 0),
    },
    domains: [...domainCounts.values()].sort((a, b) => b.datasets - a.datasets).map((d) => ({ ...d, ...domainMeta[d.key] })),
    datasets: list.sort((a, b) => (b.modified ?? "").localeCompare(a.modified ?? "")),
  };
  await writeFile(join(OUT, "index.json"), JSON.stringify(index));
  const files = await readdir(join(OUT, "datasets"));
  let bytes = 0;
  for (const f of files) bytes += (await stat(join(OUT, "datasets", f))).size;
  console.log(`[lib] wrote index.json + ${files.length} dataset files (${(bytes / 1e6).toFixed(1)} MB)`);
  console.log(JSON.stringify(index.stats));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
