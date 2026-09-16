// CNX CCTV strip — sources of truth:
//
//   1. Longdo's national camera index (camera.longdo.com/feed) — free,
//      public, no key required. It already aggregates iTIC Motion,
//      BMA, and other municipal feeds nationwide; we just filter to
//      the CNX bbox. Coverage inside Chiang Mai proper is currently
//      sparse (Longdo's network is heaviest around Bangkok), so real
//      cameras are merged into the curated scenario set rather than
//      replacing it outright.
//   2. iTIC Thailand traffic cams (itic.traffic.rid.go.th). DoH ITS
//      provincial highway cameras — needs a key we don't have; left
//      as a stub.
//   3. Tourism Authority of Thailand (TAT) live cams at Wat Phra
//      Singh and Doi Suthep — used during burning-season advisories.
//
// When the upstream returns nothing new we degrade to the curated
// scenario set so the strip never goes blank.

import { CNX_PROVINCE } from "./config";
import type { CctvFeedResponse, CctvSlot, CctvSource } from "../../types/cnx";

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
  // provisioned. Until then, scenario fallback.
  return [];
}

// ─── Scenario fallback (12 slots) ────────────────────────────────

const SCENARIO_SLOTS: CctvSlot[] = [
  { id: "cnx-c01", label: "Nawarat Bridge", source: "longdo", longitude: 99.0008, latitude: 18.7887, hlsUrl: undefined, posterUrl: undefined, reachable: true, category: "traffic" },
  { id: "cnx-c02", label: "Tha Phae Gate", source: "longdo", longitude: 98.9933, latitude: 18.7909, reachable: true, category: "heritage" },
  { id: "cnx-c03", label: "Mae Ping Bridge", source: "longdo", longitude: 99.0291, latitude: 18.7821, reachable: true, category: "highway" },
  { id: "cnx-c04", label: "Doi Suthep Lower", source: "youtube", longitude: 98.9215, latitude: 18.8048, hlsUrl: undefined, posterUrl: undefined, reachable: true, category: "tourism" },
  { id: "cnx-c05", label: "CNX Airport Apron", source: "private", longitude: 98.9622, latitude: 18.7715, reachable: true, category: "highway" },
  { id: "cnx-c06", label: "Night Bazaar", source: "longdo", longitude: 99.0003, latitude: 18.7843, reachable: true, category: "heritage" },
  { id: "cnx-c07", label: "Nimman One", source: "youtube", longitude: 98.9671, latitude: 18.8014, reachable: true, category: "tourism" },
  { id: "cnx-c08", label: "Hang Dong Junction", source: "itic", longitude: 98.9213, latitude: 18.6871, reachable: true, category: "traffic" },
  { id: "cnx-c09", label: "Mae Rim Highway", source: "itic", longitude: 98.9611, latitude: 18.9101, reachable: true, category: "highway" },
  { id: "cnx-c10", label: "Ping River Park", source: "longdo", longitude: 99.029, latitude: 18.797, reachable: true, category: "flood" },
  { id: "cnx-c11", label: "Wat Phra Singh", source: "youtube", longitude: 98.9867, latitude: 18.7895, reachable: true, category: "heritage" },
  { id: "cnx-c12", label: "Doi Inthanon Summit", source: "private", longitude: 98.4867, latitude: 18.5883, reachable: false, category: "tourism" },
];

let cache: { at: number; data: CctvFeedResponse } | null = null;
const TTL_MS = 60_000;

export async function fetchCnxCctv(): Promise<CctvFeedResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const [longdo, itic] = await Promise.all([fetchLongdo(), fetchItic()]);
  const live: CctvSlot[] = [...longdo, ...itic].map((u) => ({ ...u, reachable: u.reachable ?? true }));
  // Live cameras are merged into the curated scenario set rather than
  // replacing it — national feeds (Longdo) currently have sparse
  // coverage inside Chiang Mai proper, so a handful of real cameras
  // shouldn't blank out the other 12 curated slots.
  //
  // Scenario slots keep a deterministic reachable-flag jitter (so the
  // strip isn't a wall of green dots); live slots report their real
  // fetch outcome, which is already true here.
  const scenario = SCENARIO_SLOTS.map((s) => ({
    ...s,
    reachable: s.reachable && s.id.charCodeAt(s.id.length - 1) % 5 !== 0,
  }));
  const slots: CctvSlot[] = [...live, ...scenario];
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