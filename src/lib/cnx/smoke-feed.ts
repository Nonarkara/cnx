// Live smoke-trajectory feed.
//
// Advects only a real VIIRS pass inside the haze-transport window
// (Chiang Mai + Shan State + northern Laos). Illustrated FIRMS hotspots
// from the province fire panel are never used — a plume drawn from them
// would tell the operator smoke is arriving when no satellite said so.

import { fetchFirmsInBbox } from "./fires";
import {
  computeTrajectories,
  presentForOperator,
  transportBbox,
  type HotspotPoint,
  type SmokeTrajectoryResponse,
  type WindVector,
} from "./smoke-trajectory";

const UNAVAILABLE_NOTE =
  "No live VIIRS pass (FIRMS_MAP_KEY missing, or firms.modaps.eosdis.nasa.gov did not answer). Plumes are not drawn from illustrated hotspots.";

function unavailable(note: string): SmokeTrajectoryResponse {
  return {
    generatedAt: new Date().toISOString(),
    wind: null,
    segments: [],
    summary: {
      total: 0,
      shown: 0,
      hitsCnx: 0,
      nearCnx: 0,
      origin_th: "ไม่มีจุดความร้อนสด",
      origin_en: "no live hotspots",
    },
    methodology_th: "ไม่คำนวณแนวควันจากจุดความร้อนจำลอง",
    methodology_en:
      "Straight-line advection runs only on a live FIRMS pass — illustrated hotspots are not advected.",
    provenance: "unavailable",
    hotspotSource: "none",
    note,
  };
}

async function fetchWind(): Promise<WindVector | null> {
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=18.788&longitude=98.985&current=wind_speed_10m,wind_direction_10m&timezone=Asia%2FBangkok";
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      current?: { wind_speed_10m?: number; wind_direction_10m?: number };
    };
    const mps = j.current?.wind_speed_10m;
    const dir = j.current?.wind_direction_10m;
    if (typeof mps !== "number" || typeof dir !== "number") return null;
    return { speedKmh: Math.round(mps * 3.6 * 10) / 10, fromDirectionDeg: Math.round(dir) };
  } catch {
    return null;
  }
}

let cache: { at: number; data: SmokeTrajectoryResponse } | null = null;
const TTL_MS = 10 * 60_000;

export async function fetchSmokeTrajectory(): Promise<SmokeTrajectoryResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const firms = await fetchFirmsInBbox(transportBbox());
  if (!firms) {
    const data = unavailable(UNAVAILABLE_NOTE);
    cache = { at: Date.now(), data };
    return data;
  }

  const wind = await fetchWind();
  const hotspots: HotspotPoint[] = firms.map((h) => ({
    id: h.id,
    latitude: h.latitude,
    longitude: h.longitude,
    satellite: h.satellite,
    frp: h.frp,
    detectedAt: h.detectedAt,
  }));
  const full = computeTrajectories(hotspots, wind);
  const data = presentForOperator({
    ...full,
    provenance: "live",
    hotspotSource: hotspots.length > 0 ? "firms" : "none",
    note:
      hotspots.length === 0
        ? "FIRMS answered: no VIIRS detections in the 350 km haze window in the last 24 h."
        : full.note,
  });
  cache = { at: Date.now(), data };
  return data;
}
