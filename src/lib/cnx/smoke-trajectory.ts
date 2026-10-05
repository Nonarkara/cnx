// CNX smoke-trajectory engine — wind advection from active fire
// hotspots, predicting where the smoke plume goes over the next
// 1–6 hours. This is the haze-seasons answer to "where is the smoke
// coming from" — the actionable read the operator gets when PM2.5
// spikes in CNX and the basin model says "it's coming from Myanmar."
//
// Algorithm (deliberately simple, transparent, honest):
//   1. For each hotspot, compute a line of predicted positions at
//      t=1h, 3h, 6h using straight-line wind advection
//      (x = x0 + windSpeed * cos(bearing) * dt)
//      (y = y0 + windSpeed * sin(bearing) * dt)
//   2. Tag every point with the predicted time so the panel can
//      colour by "in 1h / 3h / 6h".
//   3. Measure the 6 h endpoint against the CNX bbox and a 50 km
//      radius of the city centre, and summarise how many plumes
//      arrive and roughly where they come from.
//
// There is deliberately NO plume widening: the wire format is a
// centreline, and a synthetic Gaussian spread would draw a modelled
// width that no measurement supports. If you want uncertainty, say so
// with a corridor around the line, not with invented sigma.
//
// Limitations — stated up front in the API response so the panel can
// render them honestly:
//   - Straight-line advection ignores turbulence, boundary-layer
//     dynamics, and deposition. Real plumes curve.
//   - No vertical mixing assumed; surface wind only.
//   - One wind reading for the whole response (the Chiang Mai city
//     point), not per-hotspot. A hotspot 300 km away in Shan State
//     can be under completely different wind, so treat the far end of
//     the segment as indicative rather than a forecast.
//   - All trajectory points are *predictions*, never observed
//     values. The UI must surface the methodology.
//
// Inputs:
//   - Hotspots: lat/lng per fire, from a live FIRMS pass (fires.ts).
//   - Wind: speed (km/h) + direction (degrees from north, 0=N, 90=E)
//     from Open-Meteo's city-centre point, fetched by smoke-feed.ts.
//     That is a separate request from the one the verdict engine makes
//     — they are not shared, and each is cached on its own TTL.
//
// Output:
//   - TrajectorySegment[] — one per hotspot, with predicted points
//   - hazeWatch — operator-visible verdict: "smoke heading toward CNX?"
//     = "any trajectory segment endpoint falls within CNX bbox"

import { CNX_PROVINCE } from "./config";
import { inChiangMaiProvince } from "./province-boundary";

export interface HotspotPoint {
  id: string;
  latitude: number;
  longitude: number;
  /** Optional satellite (SUOMI-NPP / NOAA-20 / NOAA-21 / MODIS) — for chip. */
  satellite?: string;
  /** FRP (MW) if available — used to weight the trajectory "importance". */
  frp?: number;
  /** Detected-at timestamp (ISO) — for the trajectory time label. */
  detectedAt?: string;
}

export interface WindVector {
  /** Speed km/h. */
  speedKmh: number;
  /** Direction the wind is COMING FROM in degrees from north (0=N, 90=E).
   *  Meteorology convention: a north wind = 0°, an east wind = 90°. */
  fromDirectionDeg: number;
}

export interface TrajectoryPoint {
  latitude: number;
  longitude: number;
  /** Hours from now. */
  hoursAhead: number;
}

export interface TrajectorySegment {
  hotspotId: string;
  /** Origin (the fire itself). */
  origin: { latitude: number; longitude: number };
  /** Predicted plume points at t=1h, 3h, 6h. */
  points: TrajectoryPoint[];
  /** Does the 6 h prediction fall inside the CNX bbox? */
  hitsCnxBbox: boolean;
  /** Does the 6 h prediction fall within 50 km of CNX centre? */
  nearCnx: boolean;
  /** Distance from origin to the 6 h endpoint in km. */
  travelKm6h: number;
  /** Weight — higher FRP = more visually prominent line. */
  weight: number;
}

export interface SmokeTrajectoryResponse {
  generatedAt: string;
  wind: WindVector | null;
  segments: TrajectorySegment[];
  /** Operator-visible signal: "smoke heading toward CNX". */
  summary: {
    total: number;
    /** Segments included in this payload (approaching plumes first, capped). */
    shown: number;
    hitsCnx: number;
    nearCnx: number;
    /** Where the smoke is coming from — "from the west", "from Myanmar", etc. */
    origin_th: string;
    origin_en: string;
  };
  /** Honest methodology — every prediction surface carries this. */
  methodology_th: string;
  methodology_en: string;
  /** `live` means the hotspots came from a FIRMS pass. Never advect illustrations. */
  provenance: "live" | "unavailable";
  hotspotSource: "firms" | "none";
  note: string | null;
}

/** How far from Chiang Mai we look for fires that can feed the basin.
 *  250 km stops at the border and misses the Shan State burns that
 *  actually arrive on a northwest wind. 350 km reaches them. */
export const SMOKE_RADIUS_KM = 350;
export const SMOKE_SEGMENT_CAP = 80;

export function transportBbox(
  center: { latitude: number; longitude: number } = CNX_PROVINCE.center,
  radiusKm = SMOKE_RADIUS_KM,
): { west: number; south: number; east: number; north: number } {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((center.latitude * Math.PI) / 180));
  return {
    west: Math.round((center.longitude - dLng) * 100) / 100,
    east: Math.round((center.longitude + dLng) * 100) / 100,
    south: Math.round((center.latitude - dLat) * 100) / 100,
    north: Math.round((center.latitude + dLat) * 100) / 100,
  };
}

/** Keep the wire payload readable: plumes that reach the city first, then
 *  the strongest remaining fires, capped. Summary counts stay on the full set. */
export function presentForOperator(response: SmokeTrajectoryResponse): SmokeTrajectoryResponse {
  const ranked = [...response.segments].sort((a, b) => {
    const rank = (s: TrajectorySegment) => (s.nearCnx ? 2 : 0) + (s.hitsCnxBbox ? 1 : 0);
    const diff = rank(b) - rank(a);
    return diff !== 0 ? diff : b.weight - a.weight;
  });
  const shown = ranked.slice(0, SMOKE_SEGMENT_CAP);
  return {
    ...response,
    segments: shown,
    summary: { ...response.summary, shown: shown.length },
  };
}

const HOURS = [1, 3, 6] as const;

/**
 * Compute the plume destination at t hours.
 *
 * Wind direction is "from" — to find where the smoke GOES, we add 180°.
 * Then for each hour, displacement (km) = speedKmh * hoursAhead,
 * converted to lat/lng delta using:
 *   1 deg latitude ≈ 111 km
 *   1 deg longitude ≈ 111 km * cos(latitude)
 */
function advect(
  origin: { latitude: number; longitude: number },
  wind: WindVector,
  hoursAhead: number,
): { latitude: number; longitude: number } {
  // Direction the wind is going TO
  const toDeg = (wind.fromDirectionDeg + 180) % 360;
  const toRad = (toDeg * Math.PI) / 180;
  const distanceKm = wind.speedKmh * hoursAhead;
  const dLat = (distanceKm * Math.cos(toRad)) / 111;
  const dLng =
    (distanceKm * Math.sin(toRad)) / (111 * Math.cos((origin.latitude * Math.PI) / 180));
  return {
    latitude: origin.latitude + dLat,
    longitude: origin.longitude + dLng,
  };
}

function distKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Inside the Chiang Mai province outline. Every consumer reports this as
 *  "enters the province"; it used to be the rectangular query box, which
 *  also covers Mae Hong Son, Lamphun, Lampang, Chiang Rai and Myanmar — on
 *  2026-10-05 it counted 16 plumes "entering the province" from fires that
 *  were all outside it. (The field keeps its historical name.) */
function inCnxBbox(p: { latitude: number; longitude: number }): boolean {
  return inChiangMaiProvince(p.longitude, p.latitude);
}

function inCnxCore(p: { latitude: number; longitude: number }): boolean {
  return distKm(p, CNX_PROVINCE.center) <= 50;
}

function describeOrigin(points: { latitude: number; longitude: number }[]): { th: string; en: string } {
  if (points.length === 0) return { th: "ไม่มีจุดความร้อน", en: "no hotspots" };
  const meanLat = points.reduce((a, p) => a + p.latitude, 0) / points.length;
  const meanLng = points.reduce((a, p) => a + p.longitude, 0) / points.length;
  const cnx = CNX_PROVINCE.center;
  const bearingFromCnx = (() => {
    const dLng = meanLng - cnx.longitude;
    const y = Math.sin((dLng * Math.PI) / 180) * Math.cos((meanLat * Math.PI) / 180);
    const x =
      Math.cos((cnx.latitude * Math.PI) / 180) * Math.sin((meanLat * Math.PI) / 180) -
      Math.sin((cnx.latitude * Math.PI) / 180) *
        Math.cos((meanLat * Math.PI) / 180) *
        Math.cos((dLng * Math.PI) / 180);
    const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    return deg;
  })();
  // Bearings from CNX centre: 270 = west, 0 = north, 90 = east, 180 = south.
  // Northern Myanmar (Shan State) is roughly NW of CNX (~300°).
  // Laos (Bokeo / Sayaboury) is roughly E/SE of CNX (~120°).
  const compass = (deg: number): string => {
    const dirs = ["เหนือ", "ตะวันออกเฉียงเหนือ", "ตะวันออก", "ตะวันออกเฉียงใต้", "ใต้", "ตะวันตกเฉียงใต้", "ตะวันตก", "ตะวันตกเฉียงเหนือ"];
    const i = Math.round(deg / 45) % 8;
    return dirs[i] ?? "ตะวันตก";
  };
  const compassEn = (deg: number): string => {
    const dirs = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
    const i = Math.round(deg / 45) % 8;
    return dirs[i] ?? "west";
  };
  return {
    th: `${compass(bearingFromCnx)}ของเชียงใหม่`,
    en: `${compassEn(bearingFromCnx)} of Chiang Mai`,
  };
}

export function computeTrajectories(
  hotspots: HotspotPoint[],
  wind: WindVector | null,
): SmokeTrajectoryResponse {
  const now = new Date().toISOString();
  const segments: TrajectorySegment[] = [];
  if (!wind) {
    return {
      generatedAt: now,
      wind,
      segments: [],
      summary: {
        total: hotspots.length,
        shown: 0,
        hitsCnx: 0,
        nearCnx: 0,
        origin_th: "ไม่มีข้อมูลลม",
        origin_en: "no wind data",
      },
      methodology_th: "ไม่มีข้อมูลลม — ไม่สามารถคำนวณการเคลื่อนที่ของควันได้",
      methodology_en: "No wind reading — smoke advection cannot be computed.",
      provenance: "live",
      hotspotSource: hotspots.length > 0 ? "firms" : "none",
      note: null,
    };
  }
  if (wind.speedKmh < 1) {
    const origin = describeOrigin(hotspots);
    return {
      generatedAt: now,
      wind,
      segments: [],
      summary: {
        total: hotspots.length,
        shown: 0,
        hitsCnx: 0,
        nearCnx: 0,
        origin_th: origin.th,
        origin_en: origin.en,
      },
      methodology_th: "ลมสงบ — ไม่สามารถคำนวณการเคลื่อนที่ของควันได้",
      methodology_en: "Calm wind — smoke advection cannot be computed reliably.",
      provenance: "live",
      hotspotSource: hotspots.length > 0 ? "firms" : "none",
      note: null,
    };
  }
  for (const h of hotspots) {
    const origin = { latitude: h.latitude, longitude: h.longitude };
    const points: TrajectoryPoint[] = HOURS.map((hAhead) => ({
      hoursAhead: hAhead,
      ...advect(origin, wind, hAhead),
    }));
    const endpoint6 = points[points.length - 1];
    const hitsCnx = inCnxBbox(endpoint6);
    const nearCnx = inCnxCore(endpoint6);
    const weight = Math.min(1, Math.max(0.2, (h.frp ?? 5) / 30));
    segments.push({
      hotspotId: h.id,
      origin,
      points,
      hitsCnxBbox: hitsCnx,
      nearCnx,
      travelKm6h: distKm(origin, endpoint6),
      weight,
    });
  }
  const hitsCnx = segments.filter((s) => s.hitsCnxBbox).length;
  const nearCnx = segments.filter((s) => s.nearCnx).length;
  const origin = describeOrigin(segments.map((s) => s.origin));
  return {
    generatedAt: now,
    wind,
    segments,
    summary: {
      total: hotspots.length,
      shown: segments.length,
      hitsCnx,
      nearCnx,
      origin_th: origin.th,
      origin_en: origin.en,
    },
    methodology_th:
      "การเคลื่อนที่ของควันคำนวณจากลมผิวพื้นที่เมือง — ไม่รวม turbulence, mixing, deposition",
    methodology_en:
      "Plume advection from surface wind only — straight-line, no turbulence or deposition.",
    provenance: "live",
    hotspotSource: hotspots.length > 0 ? "firms" : "none",
    note: null,
  };
}
