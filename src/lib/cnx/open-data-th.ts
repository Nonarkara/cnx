// CNX Open Data — typed catalog reader.
//
// data.go.th publishes a CKAN-style catalogue. The CNX search at
// https://data.go.th/dataset/?q=เชียงใหม่ returns ~311 results in
// the typical snapshot; the fetcher
// (`scripts/fetch-datagoth-cnx.mjs`) downloads them to
// `public/data/cnx/open-data/`. This reader is the runtime view of
// that directory.

import type { OpenDataIndex, OpenDataDataset } from "../../types/cnx";

// Server-side `fetch` has no implicit origin to resolve a relative
// path against (unlike the browser) — Cloudflare Workers included.
// Build an absolute URL from the same env var the /api/cnx/build
// route already falls back to.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cnx.nonarkara.org";
const INDEX_PATH = `${SITE_URL}/data/cnx/open-data/index.json`;
const ALL_PATH = `${SITE_URL}/data/cnx/open-data/all.json`;

let cache: { at: number; index: OpenDataIndex } | null = null;
const TTL_MS = 6 * 60 * 60_000;

interface RawDataset extends Partial<OpenDataDataset> {
  nameTh?: string;
  nameEn?: string;
}

function normalizeDatasets(list: RawDataset[]): OpenDataDataset[] {
  return list.map((d) => ({
    id: d.id || "",
    titleTh: d.titleTh || d.nameTh || d.id || "ไม่มีชื่อชุดข้อมูล",
    titleEn: d.titleEn || d.nameEn || d.titleTh || d.nameTh || d.id || "Untitled Dataset",
    publisher: d.publisher || "หน่วยงานราชการ",
    format: d.format || "CSV",
    url: d.url || `https://data.go.th/dataset/${d.id}`,
    localMirror: d.localMirror,
    tags: Array.isArray(d.tags) ? d.tags : [],
    fetchedAt: d.fetchedAt || new Date().toISOString(),
    byteSize: d.byteSize,
    summary: d.summary || "",
  }));
}

async function loadFromDisk(): Promise<OpenDataIndex | null> {
  if (typeof process === "undefined" || !process.cwd) return null;
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const filePath = path.join(process.cwd(), "public/data/cnx/open-data/index.json");
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as {
      generatedAt?: string;
      totalDatasets?: number;
      fetched?: number;
      failed?: number;
      datasets?: RawDataset[];
    };
    if (Array.isArray(parsed.datasets) && parsed.datasets.length > 0) {
      return {
        generatedAt: parsed.generatedAt || new Date().toISOString(),
        totalDatasets: parsed.totalDatasets ?? parsed.datasets.length,
        fetched: parsed.fetched ?? parsed.datasets.length,
        failed: parsed.failed ?? 0,
        datasets: normalizeDatasets(parsed.datasets),
      };
    }
  } catch {
    // fall back to network fetch
  }
  return null;
}

export async function fetchCnxOpenDataIndex(): Promise<OpenDataIndex> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.index;

  // 1. Try local disk (Node.js / dev / edge builder)
  const diskIndex = await loadFromDisk();
  if (diskIndex) {
    cache = { at: Date.now(), index: diskIndex };
    return diskIndex;
  }

  // 2. Try network fetch from site URL
  try {
    const [idxRes, allRes] = await Promise.all([
      fetch(INDEX_PATH, { cache: "no-store" }),
      fetch(ALL_PATH, { cache: "no-store" }).catch(() => null),
    ]);
    if (!idxRes.ok) throw new Error(`HTTP ${idxRes.status}`);
    const idx = (await idxRes.json()) as {
      generatedAt?: string;
      totalDatasets?: number;
      fetched?: number;
      failed?: number;
      datasets?: RawDataset[];
    };
    let datasets = idx.datasets ?? [];
    if (allRes?.ok) {
      const all = (await allRes.json()) as { datasets?: RawDataset[] };
      if (all.datasets && all.datasets.length > 0) {
        datasets = all.datasets;
      }
    }
    const normalized: OpenDataIndex = {
      generatedAt: idx.generatedAt || new Date().toISOString(),
      totalDatasets: idx.totalDatasets ?? datasets.length,
      fetched: idx.fetched ?? datasets.length,
      failed: idx.failed ?? 0,
      datasets: normalizeDatasets(datasets),
    };
    cache = { at: Date.now(), index: normalized };
    return normalized;
  } catch {
    const empty: OpenDataIndex = {
      generatedAt: new Date().toISOString(),
      totalDatasets: 311,
      fetched: 0,
      failed: 0,
      datasets: [],
    };
    return empty;
  }
}

export function summariseDataset(d: OpenDataDataset): string {
  if (d.summary && d.summary.trim().length > 0) return d.summary;
  const tagsStr = d.tags.length ? ` · #${d.tags.slice(0, 3).join(" #")}` : "";
  return `${d.publisher} · ${d.format}${tagsStr}`;
}

export function groupDatasets(datasets: OpenDataDataset[]): Record<string, OpenDataDataset[]> {
  const out: Record<string, OpenDataDataset[]> = {};
  for (const d of datasets) {
    const key = d.publisher || "หน่วยงานราชการ";
    out[key] = out[key] ?? [];
    out[key].push(d);
  }
  return out;
}