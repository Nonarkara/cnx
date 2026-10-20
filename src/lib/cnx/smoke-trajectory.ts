// CNX smoke-trajectory engine — wind advection from active fire
// hotspots, predicting where the smoke plume goes over the next
// 1–6 hours. This is the haze-seasons answer to "where is the smoke
// coming from" — the actionable read the operator gets when PM2.5
// spikes in CNX and the basin model says "it's coming from Myanmar."
//
// Algorithm (deliberately simple, transparent, honest):
//   1. For each hotspot, compute a line of predicted positions at
//      t=1h through 6h using straight-line fallback wind advection
//      (x = x0 + windSpeed * cos(bearing) * dt)
//      (y = y0 + windSpeed * sin(bearing) * dt)
//   2. Tag every point with the predicted time so the panel can
//      colour by "in 1h / 3h / 6h".
//   3. Screen the origin and hourly positions against the province outline and a 50 km
//      radius of the city centre, and summarise how many plumes
//      have sampled positions there; this does not establish smoke arrival.
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
//     = "any sampled position falls within the province outline"

import { CNX_PROVINCE } from "./config";
import { inChiangMaiProvince } from "./province-boundary";
import { traceTrajectory, type WindSource } from "./wind-field-core";

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
  /** Predicted plume positions sampled hourly at t=1h through 6h. */
  points: TrajectoryPoint[];
  /** Does the origin or any hourly modeled position fall inside the province outline? */
  hitsCnxBbox: boolean;
  /** Does the origin or any hourly modeled position fall within 50 km of CNX centre? */
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
  /** `live` requires a FIRMS pass and at least one complete path, or zero detections. */
  provenance: "live" | "unavailable";
  hotspotSource: "firms" | "none";
  note: string | null;
  /** Fire detections without a completed six-hour path; not a zero-smoke finding. */
  omittedTrajectories?: number;
  /** How the plume lines were made: integrated through the hourly forecast
   *  wind field (curves with the flow), or one city wind as a straight line. */
  method?: "forecast-field" | "straight-line";
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

const HOURS = [1, 2, 3, 4, 5, 6] as const;

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
      provenance: hotspots.length > 0 ? "unavailable" : "live",
      hotspotSource: hotspots.length > 0 ? "firms" : "none",
      omittedTrajectories: hotspots.length,
      note: hotspots.length > 0 ? "No usable wind reading: all six-hour smoke outcomes are unknown, not evidence of no smoke." : null,
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
      provenance: hotspots.length > 0 ? "unavailable" : "live",
      hotspotSource: hotspots.length > 0 ? "firms" : "none",
      omittedTrajectories: hotspots.length,
      note: hotspots.length > 0 ? "Calm wind prevents reliable advection: all six-hour smoke outcomes are unknown, not evidence of no smoke." : null,
    };
  }
  for (const h of hotspots) {
    const origin = { latitude: h.latitude, longitude: h.longitude };
    const points: TrajectoryPoint[] = HOURS.map((hAhead) => ({
      hoursAhead: hAhead,
      ...advect(origin, wind, hAhead),
    }));
    const endpoint6 = points[points.length - 1];
    const path = [origin, ...points];
    const hitsCnx = path.some(inCnxBbox);
    const nearCnx = path.some(inCnxCore);
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
      "การเคลื่อนที่ของควันคำนวณจากลมผิวพื้นที่เมือง — ตรวจต้นทางและจุดรายชั่วโมงตลอด 6 ชม. อาจพลาดการผ่านพื้นที่ระหว่างจุดตัวอย่าง ไม่ใช่การยืนยันว่าควันมาถึง ไม่รวม turbulence, mixing, deposition",
    methodology_en:
      "Plume advection from surface wind only — straight-line, no turbulence or deposition. Screens the origin and hourly sampled positions over six hours; can miss crossings between samples. Not observed smoke arrival.",
    provenance: "live",
    hotspotSource: hotspots.length > 0 ? "firms" : "none",
    note: null,
    method: "straight-line",
  };
}

/** Height the plumes are carried at: 850 hPa (~1.5 km), the transport layer
 *  daytime mixing lifts burning-season smoke into; 10 m wind is too local
 *  and too weak to carry it across ranges. */
export const PLUME_LEVEL = "850hPa" as const;

/**
 * Plume centrelines integrated through the hourly forecast wind (RK2,
 * 10-minute steps) — each parcel follows the wind as it changes along the
 * way, so plumes bend around a turning flow. A line that ends before 6 h
 * left the model grid; it is not extended by guesswork.
 */
export function computeFieldTrajectories(
  hotspots: HotspotPoint[],
  field: WindSource[],
  nowMs: number = Date.now(),
): SmokeTrajectoryResponse {
  const t0 = nowMs / 1000;
  const segments: TrajectorySegment[] = [];
  let omittedTrajectories = 0;
  for (const h of hotspots) {
    const origin = { latitude: h.latitude, longitude: h.longitude };
    const points: TrajectoryPoint[] = traceTrajectory(field, PLUME_LEVEL, h.longitude, h.latitude, t0, 6);
    const end = points[points.length - 1];
    // The integration stops at missing cells or the model window edge.
    // Its last known position is not a forecast at six hours.
    if (!end || end.hoursAhead !== 6) {
      omittedTrajectories += 1;
      continue;
    }
    segments.push({
      hotspotId: h.id,
      origin,
      points,
      hitsCnxBbox: [origin, ...points].some(inCnxBbox),
      nearCnx: [origin, ...points].some(inCnxCore),
      travelKm6h: distKm(origin, end),
      weight: Math.min(1, Math.max(0.2, (h.frp ?? 5) / 30)),
    });
  }
  const origin = hotspots.length > 0 && segments.length === 0
    ? { th: "ยังไม่ทราบทิศทางต้นทางควัน", en: "smoke origin unknown" }
    : describeOrigin(segments.map((s) => s.origin));
  return {
    generatedAt: new Date(nowMs).toISOString(),
    wind: null,
    segments,
    summary: {
      total: hotspots.length,
      shown: segments.length,
      hitsCnx: segments.filter((s) => s.hitsCnxBbox).length,
      nearCnx: segments.filter((s) => s.nearCnx).length,
      origin_th: hotspots.length ? origin.th : "ไม่มีจุดความร้อน",
      origin_en: hotspots.length ? origin.en : "no hotspots",
    },
    methodology_th:
      "แนวควันคำนวณตามลมพยากรณ์รายชั่วโมงระดับ 850 hPa (~1.5 กม.) ที่เปลี่ยนไปตามเวลาและตำแหน่ง — เป็นเส้นแกนกลาง ไม่รวมการแผ่กระจายหรือการตกสะสม ตรวจต้นทางและจุดรายชั่วโมงตลอด 6 ชม. อาจพลาดการผ่านพื้นที่ระหว่างจุดตัวอย่าง ไม่ใช่การยืนยันว่าควันมาถึง",
    methodology_en:
      "Plume centrelines integrated through the hourly 850 hPa (~1.5 km) forecast wind field (advection, RK2) — they bend as the wind turns. No spread, mixing or deposition. Screens the origin and hourly sampled positions over six hours; can miss crossings between samples. Not observed smoke arrival.",
    provenance: hotspots.length > 0 && segments.length === 0 ? "unavailable" : "live",
    hotspotSource: hotspots.length > 0 ? "firms" : "none",
    omittedTrajectories,
    note: omittedTrajectories
      ? `${omittedTrajectories} of ${hotspots.length} detections lack a complete six-hour wind-field trajectory. Their six-hour outcome is unknown, not evidence of no smoke; completed trajectories are shown separately.`
      : null,
    method: "forecast-field",
  };
}
