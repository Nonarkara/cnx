#!/usr/bin/env node
// fetch-datagoth-cnx.mjs
//
// Pull every dataset on data.go.th that matches the CNX search
// ("เชียงใหม่" / "Chiang Mai") into
//   public/data/cnx/open-data/<id>.json
// and emit
//   public/data/cnx/open-data/index.json   ← catalog summary
//   public/data/cnx/open-data/all.json     ← single big file (panel single-fetch)
//
// data.go.th is a CKAN instance (CKAN 2.9+). The package_search
// endpoint paginates by 1000; we walk every page, dedupe by id, and
// download the resource metadata (and the bytes themselves if CSV/XLSX
// is small enough — files > 25 MB are stored as URL-only).
//
// Run locally with:
//   node scripts/fetch-datagoth-cnx.mjs            # default
//   node scripts/fetch-datagoth-cnx.mjs --dry-run  # skip downloads
//
// Wired into `npm run ingest:all` (Lopburi-style). Idempotent —
// re-running only re-pulls datasets whose `last_modified` has moved.

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "public", "data", "cnx", "open-data");
const INDEX_PATH = join(ROOT, "index.json");
const ALL_PATH = join(ROOT, "all.json");

const CKAN_BASE = "https://data.go.th/api/3/action";
const QUERIES = ["เชียงใหม่", "Chiang Mai"];
const PAGE_SIZE = 1000;
const MAX_RESOURCE_BYTES = 25 * 1024 * 1024;
const USER_AGENT = "cnx-dashboard/1.0 (https://cnx.nonarkara.org; nonarkara)";

const dryRun = process.argv.includes("--dry-run");

async function ensureDir() {
  if (!existsSync(ROOT)) await mkdir(ROOT, { recursive: true });
}

async function http(path, { method = "GET", body } = {}) {
  const res = await fetch(`${CKAN_BASE}${path}`, {
    method,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Content-Type": body ? "application/json" : undefined,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
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
      if (!out.has(r.id)) out.set(r.id, r);
    }
    start += results.length;
    if (start >= count || results.length === 0) break;
  }
  return [...out.values()];
}

function normalise(pkg) {
  const resources = (pkg.resources ?? []).map((r) => ({
    id: r.id,
    name: r.name_th ?? r.name_en ?? r.name ?? r.id,
    format: (r.format || "").toUpperCase(),
    url: r.url,
    lastModified: r.last_modified || r.created,
    byteSize: r.size ?? null,
  }));
  return {
    id: pkg.id || pkg.name,
    nameTh: pkg.title_th ?? pkg.title,
    nameEn: pkg.title_en ?? pkg.title,
    publisher: pkg.organization?.title ?? pkg.author ?? "data.go.th",
    notesTh: pkg.notes_th,
    notesEn: pkg.notes_en,
    metadataCreated: pkg.metadata_created,
    metadataModified: pkg.metadata_modified,
    tags: (pkg.tags ?? []).map((t) => t.name_th ?? t.name_en ?? t.display_name ?? t.name ?? "").filter(Boolean),
    license: pkg.license_title,
    resources,
    fetchedAt: new Date().toISOString(),
  };
}

async function tryDownloadResource(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length")) || 0;
    if (len > MAX_RESOURCE_BYTES) return null;
    const buf = await res.arrayBuffer();
    return { bytes: Buffer.from(buf), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

async function run() {
  await ensureDir();
  console.log("[fetch-datagoth-cnx] listing packages…");
  const all = new Map();
  for (const q of QUERIES) {
    const pkgs = await listAll(q).catch((e) => {
      console.warn(`[fetch-datagoth-cnx] search failed for "${q}":`, e.message);
      return [];
    });
    for (const p of pkgs) all.set(p.id || p.name, p);
  }
  const total = all.size;
  console.log(`[fetch-datagoth-cnx] ${total} packages listed.`);

  const normalised = [];
  let downloaded = 0;
  let failed = 0;
  let i = 0;

  for (const pkg of all.values()) {
    i++;
    const norm = normalise(pkg);
    const file = join(ROOT, `${norm.id}.json`);
    if (existsSync(file) && !dryRun) {
      // Skip re-fetch unless metadata_modified moved
      try {
        const cached = JSON.parse(await import("node:fs").then((m) => m.readFileSync(file, "utf8")));
        if (cached.metadataModified === norm.metadataModified) {
          normalised.push(cached);
          continue;
        }
      } catch { /* fall through to fresh write */ }
    }

    if (!dryRun) {
      // Try the first downloadable resource for a small CSV/XLSX
      let mirror = null;
      for (const r of norm.resources) {
        if (!r.url) continue;
        if (!/^https?:\/\//i.test(r.url)) continue;
        const dl = await tryDownloadResource(r.url);
        if (dl) {
          const mirrorPath = join(ROOT, `${norm.id}.${(r.format || "bin").toLowerCase()}`);
          await writeFile(mirrorPath, dl.bytes);
          mirror = mirrorPath.replace(join(__dirname, ".."), "").replace(/\\/g, "/");
          downloaded++;
          break;
        } else {
          failed++;
        }
      }
      norm.mirror = mirror;
      await writeFile(file, JSON.stringify(norm, null, 2), "utf8");
    }
    normalised.push(norm);
    if (i % 50 === 0) console.log(`[fetch-datagoth-cnx] ${i}/${total}`);
  }

  const index = {
    generatedAt: new Date().toISOString(),
    totalDatasets: total,
    fetched: downloaded,
    failed,
    datasets: normalised.map((n) => ({
      id: n.id,
      nameTh: n.nameTh,
      nameEn: n.nameEn,
      publisher: n.publisher,
      format: n.resources?.[0]?.format ?? "UNKNOWN",
      url: n.resources?.[0]?.url ?? "",
      tags: n.tags,
      fetchedAt: n.fetchedAt,
      byteSize: n.resources?.[0]?.byteSize,
      summary: n.notesEn ?? n.notesTh ?? "",
    })),
  };

  if (!dryRun) {
    await writeFile(INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
    await writeFile(
      ALL_PATH,
      JSON.stringify({ generatedAt: index.generatedAt, datasets: index.datasets }, null, 2),
      "utf8",
    );
    console.log(
      `[fetch-datagoth-cnx] wrote index.json (${normalised.length} entries, ${downloaded} downloaded, ${failed} failed).`,
    );
  } else {
    console.log(`[fetch-datagoth-cnx] dry-run: ${total} packages would be fetched.`);
  }
}

run().catch((err) => {
  console.error("[fetch-datagoth-cnx] fatal:", err);
  process.exit(1);
});