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
//   2. Apply a slight Gaussian spread perpendicular to the wind
//      direction (smoke plumes widen as they travel).
//   3. Tag every point with the predicted time so the panel can
//      colour by "in 1h / 3h / 6h".
//
// Limitations — stated up front in the API response so the panel can
// render them honestly:
//   - Straight-line advection ignores turbulence, boundary-layer
//     dynamics, and deposition. Real plumes curve.
//   - No vertical mixing assumed; surface wind only.
//   - One wind reading per hotspot (the basin city-centre reading),
//     not per-grid. A 25 km spatial error is plausible for distant
//     hotspots.
//   - All trajectory points are *predictions*, never observed
//     values. The UI must surface the methodology.
//
// Inputs:
//   - Hotspots: lat/lng per fire (FIRMS or RFD or DustBoy-fused)
//   - Wind: speed (km/h) + direction (degrees from north, 0=N, 90=E)
//     from Open-Meteo's city-centre point. Same fetch as the verdict
//     engine already does — no new external call.
//
// Output:
//   - TrajectorySegment[] — one per hotspot, with predicted points
//   - hazeWatch — operator-visible verdict: "smoke heading toward CNX?"
//     = "any trajectory segment endpoint falls within CNX bbox"

import { CNX_PROVINCE } from "./config";

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
    hitsCnx: number;
    nearCnx: number;
    /** Where the smoke is coming from — "from the west", "from Myanmar", etc. */
    origin_th: string;
    origin_en: string;
  };
  /** Honest methodology — every prediction surface carries this. */
  methodology_th: string;
  methodology_en: string;
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

function inCnxBbox(p: { latitude: number; longitude: number }): boolean {
  const b = CNX_PROVINCE.bbox;
  return (
    p.longitude >= b.west && p.longitude <= b.east && p.latitude >= b.south && p.latitude <= b.north
  );
}

function inCnxCore(p: { latitude: number; longitude: number }): boolean {
  return distKm(p, CNX_PROVINCE.center) <= 50;
}

function describeOrigin(segments: TrajectorySegment[]): { th: string; en: string } {
  if (segments.length === 0) return { th: "ไม่มีจุดความร้อน", en: "no hotspots" };
  const meanLat =
    segments.reduce((a, s) => a + s.origin.latitude, 0) / segments.length;
  const meanLng =
    segments.reduce((a, s) => a + s.origin.longitude, 0) / segments.length;
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
  if (!wind || wind.speedKmh < 1) {
    return {
      generatedAt: now,
      wind,
      segments: [],
      summary: {
        total: hotspots.length,
        hitsCnx: 0,
        nearCnx: 0,
        origin_th: "ไม่มีข้อมูลลม",
        origin_en: "no wind data",
      },
      methodology_th: "พัดลมนิ่ง — ไม่สามารถคำนวณการเคลื่อนที่ของควันได้",
      methodology_en: "Calm wind — smoke advection cannot be computed reliably.",
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
  const origin = describeOrigin(segments);
  return {
    generatedAt: now,
    wind,
    segments,
    summary: {
      total: hotspots.length,
      hitsCnx,
      nearCnx,
      origin_th: origin.th,
      origin_en: origin.en,
    },
    methodology_th:
      "การเคลื่อนที่ของควันคำนวณจากลมผิวพื้นที่เมือง — ไม่รวม turbulence, mixing, deposition",
    methodology_en:
      "Plume advection from surface wind only — straight-line, no turbulence or deposition.",
  };
}
