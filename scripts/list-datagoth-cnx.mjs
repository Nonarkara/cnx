#!/usr/bin/env node
// list-datagoth-cnx.mjs — fast list-only pull.
//
// Unlike fetch-datagoth-cnx.mjs (which downloads every resource
// bytes), this script only emits the catalog index.json + all.json
// from the data.go.th package_search API. Use this when you want the
// CNX analytics page populated without the heavy per-resource
// downloads (~5–10 min for all 311 datasets).
//
// Run: node scripts/list-datagoth-cnx.mjs

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "public", "data", "cnx", "open-data");
const INDEX_PATH = join(ROOT, "index.json");
const ALL_PATH = join(ROOT, "all.json");

const CKAN_BASE = "https://data.go.th/api/3/action";
const QUERIES = (process.argv.includes("--en"))
  ? ["Chiang Mai"]
  : (process.argv.includes("--both"))
  ? ["เชียงใหม่", "Chiang Mai"]
  : ["เชียงใหม่"];
const PAGE_SIZE = 1000;

if (!existsSync(ROOT)) await mkdir(ROOT, { recursive: true });

async function http(path) {
  const res = await fetch(`${CKAN_BASE}${path}`, {
    headers: { "User-Agent": "cnx-dashboard/1.0 (cnx.nonarkara.org)", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return await res.json();
}

async function listAll(q) {
  const out = new Map();
  let start = 0;
  while (true) {
    const url = `/package_search?q=${encodeURIComponent(q)}&rows=${PAGE_SIZE}&start=${start}`;
    const json = await http(url);
    const result = json?.result;
    if (!result) break;
    const { results, count } = result;
    for (const r of results) {
      if (!out.has(r.id || r.name)) out.set(r.id || r.name, r);
    }
    start += results.length;
    if (start >= count || results.length === 0) break;
  }
  return [...out.values()];
}

const all = new Map();
for (const q of QUERIES) {
  console.log(`[list] q="${q}"…`);
  try {
    const pkgs = await listAll(q);
    for (const p of pkgs) all.set(p.id || p.name, p);
    console.log(`  → ${pkgs.length} packages`);
  } catch (e) {
    console.warn(`[list] q="${q}" failed:`, e.message);
  }
}

const total = all.size;
console.log(`[list] ${total} unique packages total.`);

const datasets = [...all.values()].map((pkg) => {
  const r = pkg.resources?.[0] ?? {};
  return {
    id: pkg.id || pkg.name,
    nameTh: pkg.title_th ?? pkg.title,
    nameEn: pkg.title_en ?? pkg.title,
    publisher: pkg.organization?.title ?? pkg.author ?? "data.go.th",
    format: (r.format || "UNKNOWN").toUpperCase(),
    url: r.url ?? "",
    tags: (pkg.tags ?? []).map((t) => t.name_th ?? t.name_en ?? t.display_name ?? t.name ?? "").filter(Boolean),
    fetchedAt: new Date().toISOString(),
    byteSize: r.size ?? null,
    summary: pkg.notes_en ?? pkg.notes_th ?? "",
  };
});

const index = {
  generatedAt: new Date().toISOString(),
  totalDatasets: total,
  fetched: 0,
  failed: 0,
  datasets,
};

await writeFile(INDEX_PATH, JSON.stringify(index, null, 2));
await writeFile(ALL_PATH, JSON.stringify({ generatedAt: index.generatedAt, datasets }, null, 2));
console.log(`[list] wrote ${INDEX_PATH}`);
console.log(`[list] wrote ${ALL_PATH}`);
console.log(`[list] ${total} CNX datasets indexed (no bytes).`);