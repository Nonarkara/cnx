// CNX Aerosol Optical Depth (AOD) overlay.
//
// Source: GISTDA (Geo-Informatics and Space Technology Development
// Agency of Thailand) hosts a public MODIS/VIIRS AOD product. The
// open mirror is NASA's GIBS / MODIS_Terra_Aerosol_Optical_Depth —
// the same tile template used by the satellite catalog — but the
// *value at point* (for the right-rail AOD card) comes from
// Open-Meteo's CAMS AOD endpoint, which is JSON and free.
//
// We compose two layers:
//   - AOD tile overlay on the map (raster)
//   - Province-average AOD number on the right rail (CAMS)
//
// Open-Meteo CAMS returns AOD at 550 nm; we map 0–1 to "good → critical"
// with dashboard display bands, not health thresholds. AOD is a column
// optical quantity and cannot establish surface PM2.5 or health risk.

import type { SeverityLevel } from "../../types/cnx";

const OPEN_METEO_CAMS = "https://air-quality-api.open-meteo.com/v1/air-quality";

export interface AerosolResponse {
  generatedAt: string;
  /** AOD at 550 nm — province average. */
  aod550: number | null;
  /** Range across stations. */
  aodMin: number | null;
  aodMax: number | null;
  level: SeverityLevel | null;
  provenance: "model" | "unavailable";
  /** Tile URL template (for the map overlay). */
  tileUrl: string;
}

const AOD_LEVELS: { max: number; level: SeverityLevel }[] = [
  { max: 0.1, level: "good" },
  { max: 0.25, level: "watch" },
  { max: 0.4, level: "alert" },
  { max: Infinity, level: "critical" },
];

function severityForAod(aod: number): SeverityLevel {
  for (const { max, level } of AOD_LEVELS) if (aod < max) return level;
  return "critical";
}

let cache: { at: number; data: AerosolResponse } | null = null;
const TTL_MS = 30 * 60_000;

function gibsDateAod(daysAgo = 1): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export async function fetchCnxAerosol(): Promise<AerosolResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const now = new Date().toISOString();
  // CNX center coords for the CAMS query (Open-Meteo returns per-point
  // values; we then aggregate across the four CNX corners for a rough
  // province spread).
  const b = { west: 97.5, east: 100.5, south: 17.5, north: 20.5 };
  const probes = [
    { lat: (b.south + b.north) / 2, lon: (b.west + b.east) / 2 },
    { lat: b.south + 0.5, lon: b.west + 0.5 },
    { lat: b.north - 0.5, lon: b.east - 0.5 },
    { lat: b.south + 0.5, lon: b.east - 0.5 },
    { lat: b.north - 0.5, lon: b.west + 0.5 },
  ];

  try {
    const vals = await Promise.all(
      probes.map(async (p) => {
        const u = `${OPEN_METEO_CAMS}?latitude=${p.lat}&longitude=${p.lon}&hourly=aerosol_optical_depth&forecast_days=1&timezone=UTC&timeformat=unixtime`;
        const res = await fetch(u, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return null;
        const j = (await res.json()) as { hourly?: { aerosol_optical_depth?: (number | null)[]; time?: number[] } };
        const times = j.hourly?.time ?? [];
        let idx = -1;
        for (let i = 0; i < times.length; i += 1) {
          const t = times[i] * 1000;
          if (Number.isFinite(t) && t <= Date.now() && Date.now() - t <= 3 * 3_600_000 && (idx < 0 || times[i] > times[idx])) idx = i;
        }
        const value = idx < 0 ? null : j.hourly?.aerosol_optical_depth?.[idx];
        return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
      }),
    );
    const live = vals.filter((v): v is number => v !== null);
    const aod = live.length ? live.reduce((a, b) => a + b, 0) / live.length : null;
    const aodMin = live.length ? Math.min(...live) : null;
    const aodMax = live.length ? Math.max(...live) : null;
    const day = gibsDateAod(1);
    const tileUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Aerosol_Optical_Depth/default/${day}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`;
    const response: AerosolResponse = {
      generatedAt: now,
      aod550: aod === null ? null : Math.round(aod * 1000) / 1000,
      aodMin: aodMin === null ? null : Math.round(aodMin * 1000) / 1000,
      aodMax: aodMax === null ? null : Math.round(aodMax * 1000) / 1000,
      level: aod === null ? null : severityForAod(aod),
      provenance: aod === null ? "unavailable" : "model",
      tileUrl,
    };
    cache = { at: Date.now(), data: response };
    return response;
  } catch {
    const fallback: AerosolResponse = {
      generatedAt: now,
      aod550: null,
      aodMin: null,
      aodMax: null,
      level: null,
      provenance: "unavailable",
      tileUrl: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Aerosol_Optical_Depth/default/${gibsDateAod(1)}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`,
    };
    return fallback;
  }
}