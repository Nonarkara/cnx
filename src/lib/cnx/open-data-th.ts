// CNX Open Data — typed catalog reader.
//
// data.go.th publishes a CKAN-style catalogue. The CNX search at
// https://data.go.th/dataset/?q=เชียงใหม่ returns ~311 results in
// the typical snapshot; the fetcher
// (`scripts/fetch-datagoth-cnx.mjs`) downloads them to
// `public/data/cnx/open-data/`. This reader is the runtime view of
// that directory.

import type { OpenDataIndex, OpenDataDataset } from "../../types/cnx";
import { fetchStaticAsset } from "./static-asset";

// A bare relative path here previously failed outright (server-side
// fetch has no implicit origin to resolve against); a plain absolute
// URL self-fetch works but is intermittent — same issue documented in
// bus-routes.ts / waterways.ts (~30-40% empty responses in production,
// confirmed by hitting /api/cnx/bus-routes repeatedly and watching it
// alternate between real data and empty on the same deployed version).
// fetchStaticAsset uses the Workers ASSETS binding directly, which
// reads the file in-process with no network round-trip.
const INDEX_PATH = "/data/cnx/open-data/index.json";
const ALL_PATH = "/data/cnx/open-data/all.json";

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
  // Tests can opt out via CNX_SKIP_DISK_LOAD=1 so mocked `fetch`
  // becomes the only path under test. Without this flag, a unit test
  // in a clone of the repo would always hit the real baked JSON on
  // disk and never exercise the network-fetch / empty-fallback paths.
  if (process.env.CNX_SKIP_DISK_LOAD === "1") return null;
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

  // 2. Read via the Workers ASSETS binding (falls back to a plain
  // fetch outside a Workers request context, e.g. local `next dev`).
  try {
    const [idxRes, allRes] = await Promise.all([
      fetchStaticAsset(INDEX_PATH),
      fetchStaticAsset(ALL_PATH).catch(() => null),
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

// summariseDataset / groupDatasets moved to open-data-format.ts — pure
// functions a client component needs, split out so importing them
// doesn't drag this module's server-only node:fs/promises code into
// the browser bundle.