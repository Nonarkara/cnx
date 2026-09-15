// CNX fires (FIRMS) module.
//
// Live: NASA FIRMS CSV download for Southeast Asia, 24-h window. The
// public endpoint is
//   https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/VIIRS_SNPP_NRT/97,17,101,21/1/2026-09-15
// We filter hotspots to the CNX bbox and project to FireHotspot.
//
// When FIRMS is not reachable (Cloudflare Workers egress is blocked
// to firms.modaps.eosdis.nasa.gov by default) we degrade to a
// deterministic scenario dataset — burning-season hotspots
// concentrated in the forest-edge districts.

import { CNX_PROVINCE } from "./config";
import type { CnxFiresResponse, FireHotspot, SeverityLevel } from "../../types/cnx";

const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";

function severityForBrightness(b: number): SeverityLevel {
  if (b >= 360) return "critical";
  if (b >= 340) return "alert";
  if (b >= 320) return "watch";
  return "good";
}

function parseFirmsCsv(csv: string): FireHotspot[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const idx = {
    lat: header.indexOf("latitude"),
    lon: header.indexOf("longitude"),
    bright: header.indexOf("bright_ti4"),
    confidence: header.indexOf("confidence"),
    frp: header.indexOf("frp"),
    satellite: header.indexOf("satellite"),
    acq: header.indexOf("acq_date") + 1,
    acqTime: header.indexOf("acq_time"),
  };
  return lines.slice(1).map((line, i) => {
    const cells = line.split(",");
    const lat = +cells[idx.lat];
    const lon = +cells[idx.lon];
    const b = CNX_PROVINCE.bbox;
    if (lon < b.west || lon > b.east || lat < b.south || lat > b.north) return null;
    const brightness = +cells[idx.bright];
    const hotspot: FireHotspot = {
      id: `firms-${cells[0]}-${i}`,
      latitude: lat,
      longitude: lon,
      brightness,
      confidence: +cells[idx.confidence],
      satellite: (cells[idx.satellite] || "SUOMI-NPP") as FireHotspot["satellite"],
      detectedAt: `${cells[idx.acq]}T${String(cells[idx.acqTime]).padStart(4, "0").slice(0, 2)}:${String(
        cells[idx.acqTime],
      ).padStart(4, "0").slice(2, 4)}:00Z`,
      severity: severityForBrightness(brightness),
      frp: cells[idx.frp] ? +cells[idx.frp] : undefined,
    };
    return hotspot;
  }).filter((h): h is FireHotspot => h !== null);
}

async function fetchLiveFirms(): Promise<FireHotspot[] | null> {
  const mapKey = process.env.FIRMS_MAP_KEY;
  if (!mapKey) return null;
  const b = CNX_PROVINCE.bbox;
  const today = new Date().toISOString().slice(0, 10);
  const url = `${FIRMS_BASE}/${mapKey}/VIIRS_SNPP_NRT/${b.west},${b.south},${b.east},${b.north}/1/${today}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const csv = await res.text();
    return parseFirmsCsv(csv);
  } catch {
    return null;
  }
}

function buildScenario(now: string): CnxFiresResponse {
  // 14 hotspots, deterministically scattered. Forest-edge (above
  // ~700 m elevation, west and south of city) carries the bulk.
  const hotspots: FireHotspot[] = [
    { lat: 18.51, lon: 98.62, sat: "SUOMI-NPP" },
    { lat: 18.62, lon: 98.71, sat: "NOAA-20" },
    { lat: 18.55, lon: 98.85, sat: "SUOMI-NPP" },
    { lat: 18.69, lon: 98.81, sat: "NOAA-20" },
    { lat: 18.73, lon: 98.93, sat: "SUOMI-NPP" },
    { lat: 18.83, lon: 99.21, sat: "NOAA-21" },
    { lat: 18.91, lon: 99.43, sat: "SUOMI-NPP" },
    { lat: 19.02, lon: 99.51, sat: "NOAA-20" },
    { lat: 19.18, lon: 99.31, sat: "SUOMI-NPP" },
    { lat: 19.42, lon: 99.07, sat: "NOAA-20" },
    { lat: 19.61, lon: 98.83, sat: "SUOMI-NPP" },
    { lat: 19.55, lon: 98.61, sat: "NOAA-21" },
    { lat: 19.71, lon: 99.81, sat: "SUOMI-NPP" },
    { lat: 18.34, lon: 99.27, sat: "NOAA-20" },
  ].map((s, i) => {
    const brightness = 330 + Math.sin(i * 1.7) * 18;
    return {
      id: `scenario-fire-${i}`,
      latitude: s.lat,
      longitude: s.lon,
      brightness: Math.round(brightness * 10) / 10,
      confidence: Math.round(60 + Math.sin(i) * 20 + 20),
      satellite: s.sat as FireHotspot["satellite"],
      detectedAt: now,
      severity: severityForBrightness(brightness),
      frp: Math.round((Math.sin(i) * 4 + 6) * 10) / 10,
    };
  });
  return {
    generatedAt: now,
    hotspots,
    totalCount: hotspots.length,
    forestShare: 0.71,
  };
}

let cache: { at: number; data: CnxFiresResponse } | null = null;
const TTL_MS = 10 * 60_000;

export async function fetchCnxFires(): Promise<CnxFiresResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const now = new Date().toISOString();
  const live = await fetchLiveFirms();
  if (live) {
    const response: CnxFiresResponse = {
      generatedAt: now,
      hotspots: live,
      totalCount: live.length,
    };
    cache = { at: Date.now(), data: response };
    return response;
  }
  const scenario = buildScenario(now);
  cache = { at: Date.now(), data: scenario };
  return scenario;
}