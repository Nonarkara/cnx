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
// data.go.th is a CKAN instance (CKAN 2.9+). package_search paginates,
// but the upstream gateway times out on large pages, so we walk the result
// set in small pages, dedupe by id, and download the resource metadata
// (and the bytes themselves if CSV is small enough — files > 25 MB are
// stored as URL-only).
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
import { redactPersonalContactText, redactDatasetMetadata } from "./redact-personal-contacts.mjs";
import {
  USER_AGENT,
  listAll,
} from "./fetch-datagoth-core.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "public", "data", "cnx", "open-data");
const INDEX_PATH = join(ROOT, "index.json");
const ALL_PATH = join(ROOT, "all.json");

const QUERIES = ["เชียงใหม่", "Chiang Mai"];
const MAX_RESOURCE_BYTES = 25 * 1024 * 1024;
const RESOURCE_TIMEOUT_MS = 120_000;

const dryRun = process.argv.includes("--dry-run");

async function ensureDir() {
  if (!existsSync(ROOT)) await mkdir(ROOT, { recursive: true });
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
  return redactDatasetMetadata({
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
  });
}

async function tryDownloadResource(url) {
  try {
    // Bounded so one dead mirror cannot stall the whole bake; the resource
    // URL is published either way, so a timeout only costs us the mirror.
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(RESOURCE_TIMEOUT_MS),
    });
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
    // A failed search must NOT be swallowed. Returning [] here used to let the
    // bake publish a catalog that silently omitted every dataset of that
    // query while still looking complete — the board would show a shorter
    // list with nothing saying anything was missing. That is the omission
    // error this board treats as fatal, so the bake fails instead.
    const pkgs = await listAll(q, {
      onRetry: (err, attempt, attempts, wait) =>
        console.warn(
          `[fetch-datagoth-cnx] "${q}" page failed (${err.message}); retry ${attempt}/${attempts - 1} in ${wait} ms`,
        ),
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
          const safe = redactDatasetMetadata(cached);
          await writeFile(file, JSON.stringify(safe, null, 2), "utf8");
          normalised.push(safe);
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
        // Only publish mirrors we can inspect and redact. Binary resources
        // remain available through the publisher's original resource URL.
        if ((r.format || "").toUpperCase() !== "CSV") continue;
        const dl = await tryDownloadResource(r.url);
        if (dl) {
          let csv;
          try {
            csv = new TextDecoder("utf-8", { fatal: true }).decode(dl.bytes);
          } catch {
            continue; // preserve the source URL rather than corrupting another encoding
          }
          const mirrorPath = join(ROOT, `${norm.id}.${(r.format || "bin").toLowerCase()}`);
          await writeFile(mirrorPath, redactPersonalContactText(csv), "utf8");
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
