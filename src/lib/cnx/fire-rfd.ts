// CNX Fire / Royal Forest Department (RFD) hotspot client.
//
// Live upstream: Royal Forest Department Active Fire Hotspot service
// at https://wildfire.forest.go.th/firemap/getdb.php
//
// Required params discovered from the RFD frontend JS:
//   datestart / dateend — YYYY-MM-DD
//   province — Thai name (เชียงใหม่) or "ทุกจังหวัด"
//   snpp / noaa20 / noaa21 — VIIRS satellite toggles, "on" each
//   nighttime / daytime — pass "on" both
//   modis — "1" to include MODIS Terra/Aqua (per the source page)
//
// Without `modis=1` the response is `{"hotspot":[]}` — the Thai
// department only started including MODIS in 2025 and the flag is the
// toggle. Worth keeping even though VIIRS is the primary sensor.
//
// Response shape: { "hotspot": [ { LAT, LONG, YYMMDD, TIME,
//   TUMBON, AUMPER, PROVINCE, TYPE, NAME, ... } ] }
//   TYPE values: NRF (ป่าสงวน), ALOW (ป่าที่ส่วนราชการใช้ประโยชน์),
//                CMF (ป่าชุมชน), FIO (อ.อ.ป.), DNP (ป่าอนุรักษ์), ...

import { CNX_PROVINCE } from "./config";
import type { FireHotspot, SeverityLevel } from "../../types/cnx";

const RFD_BASE = "https://wildfire.forest.go.th/firemap/getdb.php";

export interface RfdHotspot {
  lat: number;
  lon: number;
  yymmdd: string;        // YYYY-MM-DD (Thai date)
  time: string;          // HHMM (Thai minutes since midnight)
  province: string;
  aumper: string;
  tumbon: string;
  /** Forest tenure: NRF / ALOW / CMF / FIO / DNP / SD / CP / DOL / TD / ALRO / OTHER */
  type: string;
  /** Forest name if mapped to a gazetted reserve. */
  name: string;
  satellite?: "SUOMI-NPP" | "NOAA-20" | "NOAA-21" | "MODIS";
  confidence: number;
  frp?: number;
}

function severityForType(type: string): SeverityLevel {
  // Forest reserves are the most concerning — agricultural burning
  // outside forests is a different operational response.
  switch (type) {
    case "DNP":
    case "NRF":
      return "critical";
    case "ALOW":
    case "CMF":
    case "FIO":
      return "alert";
    case "SD":
    case "CP":
      return "watch";
    default:
      return "good";
  }
}

function severityForConfidence(c: number): SeverityLevel {
  if (c >= 90) return "critical";
  if (c >= 70) return "alert";
  if (c >= 40) return "watch";
  return "good";
}

function pickSeverity(type: string, confidence: number): SeverityLevel {
  // Severity combines the forest-tenure class with detection confidence.
  // A DNP hit at 60% confidence is still more critical than an
  // agricultural-burn outside forest at 95%.
  const t = severityForType(type);
  const c = severityForConfidence(confidence);
  const order: SeverityLevel[] = ["good", "watch", "alert", "critical"];
  return order.indexOf(t) >= order.indexOf(c) ? t : c;
}

interface RawResponse {
  hotspot?: Array<{
    LAT: string;
    LONG: string;
    YYMMDD: string;
    TIME: string;
    TUMBON?: string;
    AUMPER?: string;
    PROVINCE?: string;
    TYPE?: string;
    NAME?: string;
    SATELLITE?: string;
    CONFIDENCE?: string;
    FRP?: string;
  }>;
}

export async function fetchRfdHotspots(opts: { dateStart?: Date; dateEnd?: Date } = {}): Promise<RfdHotspot[]> {
  const end = opts.dateEnd ?? new Date();
  const start = opts.dateStart ?? new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000); // last 7 days
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = new URL(RFD_BASE);
  url.searchParams.set("datestart", fmt(start));
  url.searchParams.set("dateend", fmt(end));
  url.searchParams.set("province", "เชียงใหม่");
  url.searchParams.set("snpp", "on");
  url.searchParams.set("noaa20", "on");
  url.searchParams.set("noaa21", "on");
  url.searchParams.set("nighttime", "on");
  url.searchParams.set("daytime", "on");
  url.searchParams.set("modis", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": "cnx-dashboard/1.0 (cnx.nonarkara.org)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as RawResponse;
    const b = CNX_PROVINCE.bbox;
    return (json.hotspot ?? [])
      .filter((h) => {
        const lat = parseFloat(h.LAT);
        const lon = parseFloat(h.LONG);
        if (isNaN(lat) || isNaN(lon)) return false;
        return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;
      })
      .map((h) => {
        const confidence = h.CONFIDENCE ? Number(h.CONFIDENCE) : 80;
        return {
          lat: parseFloat(h.LAT),
          lon: parseFloat(h.LONG),
          yymmdd: h.YYMMDD,
          time: h.TIME,
          province: h.PROVINCE ?? "",
          aumper: h.AUMPER ?? "",
          tumbon: h.TUMBON ?? "",
          type: h.TYPE ?? "OTHER",
          name: h.NAME ?? "",
          satellite: (h.SATELLITE as RfdHotspot["satellite"]) ?? "SUOMI-NPP",
          confidence,
          frp: h.FRP ? Number(h.FRP) : undefined,
        };
      });
  } catch {
    return [];
  }
}

/** RFD-only response — distinct from FIRMS to keep the two sources
 *  separable in the panel UI. */
export interface RfdFiresResponse {
  generatedAt: string;
  hotspots: RfdHotspot[];
  totalCount: number;
  byType: Record<string, number>;
  forestShare: number;
}

let cache: { at: number; data: RfdFiresResponse } | null = null;
const TTL_MS = 30 * 60_000;

export async function fetchCnxRfdFires(): Promise<RfdFiresResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const now = new Date().toISOString();
  const hotspots = await fetchRfdHotspots();
  const byType: Record<string, number> = {};
  let forestCount = 0;
  const FOREST_TYPES = new Set(["DNP", "NRF", "ALOW", "CMF", "FIO"]);
  for (const h of hotspots) {
    byType[h.type] = (byType[h.type] ?? 0) + 1;
    if (FOREST_TYPES.has(h.type)) forestCount += 1;
  }
  const response: RfdFiresResponse = {
    generatedAt: now,
    hotspots,
    totalCount: hotspots.length,
    byType,
    forestShare: hotspots.length ? forestCount / hotspots.length : 0,
  };
  cache = { at: Date.now(), data: response };
  return response;
}

/** Convert an RFD hotspot into the project's FireHotspot shape so the
 *  map layer can render RFD + FIRMS in one deck.gl ScatterplotLayer. */
export function rfdToFireHotspot(h: RfdHotspot): FireHotspot {
  const sev = pickSeverity(h.type, h.confidence);
  return {
    id: `rfd-${h.yymmdd}-${h.time}-${h.lat}-${h.lon}`,
    latitude: h.lat,
    longitude: h.lon,
    // RFD doesn't return brightness in K — synthesise a severity-ramped
    // proxy so the map colour ramp matches FIRMS.
    brightness: sev === "critical" ? 365 : sev === "alert" ? 350 : sev === "watch" ? 335 : 320,
    confidence: h.confidence,
    frp: h.frp,
    satellite: h.satellite === "MODIS" ? "TERRA" : (h.satellite ?? "SUOMI-NPP") as FireHotspot["satellite"],
    detectedAt: `${h.yymmdd}T${String(h.time).padStart(4, "0").slice(0, 2)}:${String(h.time).padStart(4, "0").slice(2, 4)}:00+07:00`,
    severity: sev,
  };
}