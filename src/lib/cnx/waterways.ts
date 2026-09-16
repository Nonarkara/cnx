// CNX waterways — OSM rivers + streams for the flood overlay.
//
// The dashboard's flood desk already shows river gauges and dam
// storage; this module adds the **stream network itself** as
// PathLayers on the map so the operator can see which channels are
// draining into the Ping basin.
//
// The curated extract is baked to `public/data/cnx/waterways.geojson`
// via `scripts/fetch-cnx-waterways.mjs` (weekly refresh).
//
// Three-tier loader (in order):
//
//   1. In-isolate module cache (1-hour TTL, served without I/O).
//   2. The baked JSON via the worker's own static asset URL
//      (`/data/cnx/waterways.geojson`). Resolved by Next.js in dev,
//      by the `ASSETS` binding in production. ~8.5 MB; loads in one
//      fetch with `cache: "no-store"` so cold isolates always see
//      the latest bake.
//   3. A live Overpass call as last resort. Anonymous tier is
//      rate-limited from the Cloudflare edge, so this often fails —
//      that's why tier 2 exists.
//
// Why not bundle the JSON statically? At 8.5 MB the static import
// would explode the worker bundle AND hang the OpenNext bundler on
// Node 26 (process.nextTick stalls during esbuild). Pulling through
// the asset URL keeps the bundle small AND reliable.
//
// Same pattern as `bus-routes.ts` — see the comment there for the
// history (live Overpass from edge was silently shipping empty
// arrays on every rate-limit).

export interface Waterway {
  id: string;
  name: string;
  category: "river" | "stream";
  /** GeoJSON LineString's coordinates array as [lon, lat] tuples. */
  geometry: [number, number][];
  /** Natural width class (river > stream > drain). */
  width: "major" | "minor" | "drain";
}

const OVERPASS = "https://overpass-api.de/api/interpreter";

const QUERY = `
[out:json][timeout:60];
(
  way["waterway"="river"](17.5,97.5,20.5,100.5);
  way["waterway"="stream"](17.5,97.5,20.5,100.5);
);
out geom;
`;

interface WaterwaysFile {
  meta?: { source?: string; generatedAt?: string; bbox?: unknown; scope?: string };
  waterways: Waterway[];
}

interface WaterwayRaw {
  type: "way";
  id: number;
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

const EMPTY: { waterways: Waterway[]; generatedAt: string } = { waterways: [], generatedAt: new Date(0).toISOString() };

let cache: { at: number; data: WaterwaysFile } | null = null;
const TTL_MS = 60 * 60_000;

export async function fetchCnxWaterways(): Promise<{ waterways: Waterway[]; generatedAt: string }> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { waterways: cache.data.waterways, generatedAt: cache.data.meta?.generatedAt ?? new Date(cache.at).toISOString() };
  }
  try {
    const data = await loadBaked();
    cache = { at: Date.now(), data };
    return { waterways: data.waterways, generatedAt: data.meta?.generatedAt ?? new Date().toISOString() };
  } catch (e) {
    console.warn(`[waterways] baked asset failed (${(e as Error).message}); trying live Overpass`);
  }
  try {
    const data = await loadOverpass();
    cache = { at: Date.now(), data: { waterways: data.waterways, meta: { generatedAt: data.generatedAt } } };
    return data;
  } catch (e) {
    console.warn(`[waterways] live Overpass failed: ${(e as Error).message}`);
    if (cache) return { waterways: cache.data.waterways, generatedAt: cache.data.meta?.generatedAt ?? new Date(cache.at).toISOString() };
    return EMPTY;
  }
}

async function loadBaked(): Promise<WaterwaysFile> {
  const res = await fetch("/data/cnx/waterways.geojson", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as WaterwaysFile;
  if (!Array.isArray(data.waterways)) throw new Error("missing `waterways` array");
  return data;
}

async function loadOverpass(): Promise<{ waterways: Waterway[]; generatedAt: string }> {
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      Accept: "*/*",
      "User-Agent": "cnx-dashboard/1.0 (+https://cnx.nonarkara.org)",
    },
    body: QUERY,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  const json = (await res.json()) as { elements: WaterwayRaw[] };
  const waterways: Waterway[] = [];
  for (const el of json.elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
    const category = el.tags?.waterway === "river" ? "river" : "stream";
    const width: Waterway["width"] =
      el.tags?.waterway === "river" ? "major" : category === "stream" ? "minor" : "drain";
    waterways.push({
      id: `w-${el.id}`,
      name: el.tags?.name ?? el.tags?.["name:en"] ?? "",
      category,
      width,
      geometry: el.geometry.map((p) => [p.lon, p.lat]),
    });
  }
  return { waterways, generatedAt: new Date().toISOString() };
}