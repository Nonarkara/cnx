// CNX CCTV strip — sources of truth:
//
//   1. Windy.com public webcams (9 across the basin + Lamphun corridors)
//      — keyless snapshot JPEGs + day-player iframes. Registry + probing
//      in cctv-windy.ts. This is the backbone: verified live 2026-09-19.
//   2. Longdo's national camera index (camera.longdo.com/feed) — free,
//      public, no key. Filtered to the operational bbox (basin +
//      approach corridors, not the whole province box) so distant
//      Tak/Uttaradit highway cams don't masquerade as Chiang Mai feeds.
//   3. Municipal registry (municipal-cameras.ts) — empty until the
//      municipality onboards cameras via docs/CCTV-PIPELINE.md.
//
// There is deliberately NO scenario filler. A previous revision rendered
// 12 curated slots with green reachable dots and no streams behind them;
// that is exactly the fake-green the About-page doctrine forbids. When
// every upstream is down the strip says so honestly and keeps the
// municipal onboarding call-to-action visible.

import { CNX_PROVINCE } from "./config";
import type { CctvFeedResponse, CctvSlot, CctvSource } from "../../types/cnx";
import { MUNICIPAL_CAMERAS } from "./municipal-cameras";
import { WINDY_CAMERAS, WINDY_TTL_MS, probeWindySnapshots } from "./cctv-windy";

interface UpstreamCctv {
  id: string;
  label: string;
  longitude: number;
  latitude: number;
  hlsUrl?: string;
  posterUrl?: string;
  source: CctvSource;
  category: CctvSlot["category"];
  reachable?: boolean;
}

const LONGDO_FEED = "https://camera.longdo.com/feed/?command=json";

interface LongdoCamera {
  camid?: string;
  title?: string;
  latitude?: string | number;
  longitude?: string | number;
  imgurl?: string;
  hls_url?: string;
}

function num(v: string | number | undefined): number | null {
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchLongdo(): Promise<UpstreamCctv[]> {
  try {
    const res = await fetch(LONGDO_FEED, {
      headers: { Accept: "application/json", "User-Agent": "cnx-dashboard/1.0 (+https://cnx.nonarkara.org)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`longdo ${res.status}`);
    const json = (await res.json()) as { cameras?: LongdoCamera[] } | LongdoCamera[];
    const cameras = Array.isArray(json) ? json : json.cameras ?? [];
    const { west, south, east, north } = CNX_PROVINCE.bbox;
    const out: UpstreamCctv[] = [];
    for (const cam of cameras) {
      const lat = num(cam.latitude);
      const lon = num(cam.longitude);
      if (lat === null || lon === null) continue;
      if (lat < south || lat > north || lon < west || lon > east) continue;
      out.push({
        id: `longdo-${cam.camid ?? `${lon}-${lat}`}`,
        label: cam.title?.trim() || "Camera",
        longitude: lon,
        latitude: lat,
        hlsUrl: cam.hls_url,
        posterUrl: cam.imgurl,
        source: "longdo",
        category: "traffic",
        reachable: true,
      });
    }
    return out;
  } catch (e) {
    console.warn(`[cctv] longdo fetch failed: ${(e as Error).message}`);
    return [];
  }
}

async function fetchItic(): Promise<UpstreamCctv[]> {
  // itic.traffic.rid.go.th — DoH ITS mirrors — needs API key
  // provisioned. Until then, nothing (never filler).
  return [];
}

// ─── Operational bbox ──────────────────────────────────────────
// Tighter than CNX_PROVINCE.bbox (which spans Tak→Uttaradit): the CCTV
// wall covers the basin + approach corridors only, so a Tak highway
// camera never renders as a Chiang Mai feed.
const CCTV_BBOX = { west: 98.5, south: 18.3, east: 99.5, north: 19.4 };

function inCctvBbox(lon: number, lat: number): boolean {
  return lon >= CCTV_BBOX.west && lon <= CCTV_BBOX.east && lat >= CCTV_BBOX.south && lat <= CCTV_BBOX.north;
}

interface WindySlot extends UpstreamCctv {
  playerUrl: string;
  upstreamUrl: string;
}

let windyCache: { at: number; slots: WindySlot[] } | null = null;

async function fetchWindy(): Promise<WindySlot[]> {
  if (windyCache && Date.now() - windyCache.at < WINDY_TTL_MS) return windyCache.slots;
  const probes = await probeWindySnapshots();
  const byId = new Map(probes.map((p) => [p.id, p.reachable]));
  const slots: WindySlot[] = WINDY_CAMERAS.map((c) => ({
    id: c.id,
    label: c.nameTh ? `${c.nameTh} · ${c.name}` : c.name,
    longitude: c.longitude,
    latitude: c.latitude,
    posterUrl: c.snapshot,
    playerUrl: c.player,
    upstreamUrl: c.detail,
    source: "windy" as CctvSource,
    category: c.category === "tourism" ? "tourism" : "traffic",
    reachable: byId.get(c.id) ?? false,
  }));
  windyCache = { at: Date.now(), slots };
  return slots;
}

let cache: { at: number; data: CctvFeedResponse } | null = null;
const TTL_MS = 60_000;

export async function fetchCnxCctv(): Promise<CctvFeedResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const [longdo, itic, windy] = await Promise.all([fetchLongdo(), fetchItic(), fetchWindy()]);
  // Longdo is national: keep only cameras inside the operational bbox.
  const live: CctvSlot[] = [...longdo, ...itic]
    .filter((u) => inCctvBbox(u.longitude, u.latitude))
    .map((u) => ({ ...u, reachable: u.reachable ?? true }));
  const windySlots: CctvSlot[] = windy.map((w) => ({
    ...w,
    reachable: w.reachable ?? false,
    snapshotRefreshSec: Math.round(WINDY_TTL_MS / 1000),
  }));
  const municipal: CctvSlot[] = MUNICIPAL_CAMERAS.map((m) => ({
    id: m.id,
    label: m.label,
    longitude: m.longitude,
    latitude: m.latitude,
    hlsUrl: m.hlsUrl,
    posterUrl: m.snapshotUrl,
    source: "municipal" as CctvSource,
    category: m.category,
    reachable: Boolean(m.hlsUrl || m.snapshotUrl),
  }));
  const slots: CctvSlot[] = [...windySlots, ...live, ...municipal];
  const reachableCount = slots.filter((s) => s.reachable).length;
  const response: CctvFeedResponse = {
    generatedAt: new Date().toISOString(),
    slots,
    reachableCount,
    totalCount: slots.length,
  };
  cache = { at: Date.now(), data: response };
  return response;
}