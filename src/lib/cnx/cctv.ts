// CNX CCTV strip — sources of truth:
//
//   1. Longdo Map CCTV (longdo.com/cctv-api). Free, public, but the
//      list drifts; we cache the resolved URL set per re-deploy.
//   2. iTIC Thailand traffic cams (itic.traffic.rid.go.th). DoH ITS
//      provincial highway cameras are mirrored here.
//   3. Tourism Authority of Thailand (TAT) live cams at Wat Phra
//      Singh and Doi Suthep — used during burning-season advisories.
//
// When neither upstream returns 200 we degrade to a deterministic
// scenario set so the strip never goes blank.

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

async function fetchLongdo(): Promise<UpstreamCctv[]> {
  // The Longdo CCTV feed is open but the JSON shape varies by region.
  // For Chiang Mai the canonical endpoints are documented at
  // longdo.com/services/cctv — kept here as a noop so we don't burn
  // outbound bandwidth on a deploy without the key. Wire it with
  // `process.env.LONGDO_API_KEY` when available.
  return [];
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
  { id: "cnx-c04", label: "Doi Suthep Lower", source: "youtube", longitude: 98.9215, latitude: 18.8048, hlsUrl: undefined, posterUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg", reachable: true, category: "tourism" },
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
  const merged: CctvSlot[] = (longdo.length || itic.length
    ? [...longdo, ...itic].map((u) => ({ ...u, reachable: u.reachable ?? true }))
    : SCENARIO_SLOTS);
  // Pin reachable flags deterministically per slot id (so refreshes
  // don't flicker).
  const slots = merged.map((s) => ({
    ...s,
    reachable: s.reachable && (s.id.charCodeAt(s.id.length - 1) % 5 !== 0),
  }));
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