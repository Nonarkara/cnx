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

export async function fetchCnxOpenDataIndex(): Promise<OpenDataIndex> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.index;
  try {
    const [idxRes, allRes] = await Promise.all([
      fetch(INDEX_PATH),
      fetch(ALL_PATH).catch(() => null),
    ]);
    if (!idxRes.ok) throw new Error("index fetch failed");
    const idx = (await idxRes.json()) as OpenDataIndex;
    if (allRes?.ok) {
      const all = (await allRes.json()) as { datasets: OpenDataDataset[] };
      idx.datasets = all.datasets ?? idx.datasets;
    }
    cache = { at: Date.now(), index: idx };
    return idx;
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
  return d.summary ?? `${d.publisher} • ${d.format} • ${d.titleEn ?? d.titleTh ?? d.id}`;
}

export function groupDatasets(datasets: OpenDataDataset[]): Record<string, OpenDataDataset[]> {
  const out: Record<string, OpenDataDataset[]> = {};
  for (const d of datasets) {
    const key = d.publisher || "Unknown publisher";
    out[key] = out[key] ?? [];
    out[key].push(d);
  }
  return out;
}