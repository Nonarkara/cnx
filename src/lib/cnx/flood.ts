// CNX flood module — since 2026-10-11, a DRILL generator and nothing else.
//
// ── WHERE THE LIVE FLOOD PICTURE COMES FROM ─────────────────────────
// Not from here. Every part of the flood desk is now a measured or
// forecast feed with its own provenance and its own age:
//
//   river levels   river-level.ts   /api/cnx/river-level  ThaiWater waterlevel (relay)
//   rain gauges    rain.ts          /api/cnx/rain         ThaiWater rain_24h (relay)
//   reservoirs     dam.ts           /api/cnx/dam          ThaiWater analyst/dam (relay)
//   river forecast floodhub.ts      /api/cnx/floodhub     Google Flood Hub (model)
//   rain forecast  outlook.ts       /api/cnx/forecast-field  Open-Meteo 48 h (model)
//
// CNXFloodPanel composes those five. They are deliberately not merged into
// one payload here: this response carries ONE provenance flag, and bundling
// a measured river with a model forecast under it would force a single word
// onto evidence of different kinds and ages.
//
// ── WHAT THIS MODULE STILL DOES ────────────────────────────────────
// Without `?scenario=<id>`, `fetchCnxFlood()` returns provenance
// "unavailable" with EMPTY arrays and a note saying where the live parts
// are. That is the payload the twin, story, RAG and ticker read, so none of
// them can pick up a scenario number: they gate on `provenance === "live"`,
// which nothing produces, and the arrays they would read are empty.
//
// With `?scenario=<id>` (drill mode, e.g. ?scenario=monsoon-flood-watch)
// it returns the old hash-seeded scenario, provenance "scenario", and a
// `drill` label — "ซ้อมแผน / DRILL — ข้อมูลจำลอง" — that every surface
// showing it must carry. The scenario used to be the DEFAULT payload of
// the flood panel; the client sent `?scenario=` and the route dropped it
// (audit 2026-10-09). Both are fixed: the route reads the parameter, and
// the default no longer contains invented numbers.
//
// ── HISTORY WORTH KEEPING ───────────────────────────────────────────
// Until 2026-10-02 this header claimed ThaiWater needed a key and that
// `water.rid.go.th` was the upstream. Neither was true: the v3 API is
// keyless, and that host is a 1996 HTML frameset. The scenario's guessed
// 3.5 m bank-full at Nawarat Bridge turned out close to the station's real
// published critical level of 3.7 m (304.20 m MSL) — still a guess, and the
// published figure is what the board shows.

import { CNX_PROVINCE } from "./config";
import type { CnxFloodResponse, CnxRainfallStation, CnxReservoir, CnxFloodGauge, SeverityLevel } from "../../types/cnx";

const TRENDING_RANDOMNESS = 0.15;
/** Drill ids are URL input: short lowercase slugs only. */
const DRILL_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
/** The drill that rehearses high water; every other id gets ordinary levels. */
const HIGH_WATER_DRILLS = new Set(["monsoon-flood-watch"]);

export const DRILL_LABEL = { th: "ซ้อมแผน — ข้อมูลจำลอง", en: "DRILL — simulated data" } as const;

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

function jitter(base: number, amplitude: number, seed: string): number {
  return base + (hashSeed(seed) * 2 - 1) * amplitude;
}

function severityForLevel(level: number, bankFull: number | undefined): SeverityLevel {
  if (!bankFull) return "watch";
  const r = level / bankFull;
  if (r >= 0.95) return "critical";
  if (r >= 0.85) return "alert";
  if (r >= 0.6) return "watch";
  return "good";
}

export function isDrillId(id: string | null | undefined): id is string {
  return typeof id === "string" && DRILL_ID.test(id);
}

// ─── Drill scenario ──────────────────────────────────────────────

const PING_STATIONS: Omit<CnxFloodGauge, "levelM" | "trend" | "severity" | "observedAt">[] = [
  { stationId: "P.1", name: "Nawarat Bridge", river: "Ping", basin: "Ping", longitude: 99.0, latitude: 18.79 },
  { stationId: "P.2A", name: "Mae Ngat Srid", river: "Mae Ngat", basin: "Ping", longitude: 99.07, latitude: 19.21 },
  { stationId: "P.3", name: "Mae Kuang", river: "Mae Kuang", basin: "Ping", longitude: 99.18, latitude: 18.86 },
  { stationId: "P.4", name: "Mae Taeng", river: "Mae Taeng", basin: "Ping", longitude: 98.93, latitude: 19.13 },
  { stationId: "P.5", name: "Li Wa", river: "Li Wa", basin: "Ping", longitude: 98.94, latitude: 18.74 },
  { stationId: "P.7", name: "Sop Tui", river: "Ping", basin: "Ping", longitude: 99.08, latitude: 18.58 },
];

const RAINFALL: Omit<CnxRainfallStation, "rainfall24hMm" | "rainfallNowMmHr" | "observedAt">[] = [
  { stationId: "50101", name: "Chiang Mai City", longitude: 98.985, latitude: 18.79 },
  { stationId: "50102", name: "Hang Dong", longitude: 98.92, latitude: 18.69 },
  { stationId: "50103", name: "Mae Rim", longitude: 98.96, latitude: 18.91 },
  { stationId: "50104", name: "Mae On", longitude: 99.27, latitude: 18.86 },
  { stationId: "50105", name: "Doi Inthanon", longitude: 98.49, latitude: 18.59 },
];

const RESERVOIRS: (Omit<CnxReservoir, "fillFraction" | "storageMCM" | "observedAt" | "severity"> & { capacityMCM: number; fill: number })[] = [
  { damId: "MNG", name: "Mae Ngat Somboon Chon", capacityMCM: 265, fill: 0.82 },
  { damId: "MKT", name: "Mae Kuang Udom Thara", capacityMCM: 263, fill: 0.62 },
  { damId: "BHM", name: "Bhumibol", capacityMCM: 13_462, fill: 0.7 },
];

export function buildDrill(id: string, nowIso: string): CnxFloodResponse {
  const high = HIGH_WATER_DRILLS.has(id);
  const seed = (s: string) => `${id}-${s}-${nowIso}`;
  const gauges: CnxFloodGauge[] = PING_STATIONS.map((s, i) => {
    const bankFull = 3.5 + i * 0.3;
    const base = high ? bankFull * (0.82 + i * 0.025) : 1.4 + i * 0.15;
    const levelM = jitter(base, TRENDING_RANDOMNESS, seed(s.stationId));
    return {
      ...s,
      levelM: Math.round(levelM * 100) / 100,
      bankFullM: Math.round(bankFull * 100) / 100,
      dischargeM3s: Math.round(jitter((high ? 180 : 40) + i * 12, 8, seed(`q-${s.stationId}`))),
      trend: high || hashSeed(seed(`trend-${s.stationId}`)) > 0.5 ? "rising" : "falling",
      severity: severityForLevel(levelM, bankFull),
      observedAt: nowIso,
    };
  });

  const rainfall: CnxRainfallStation[] = RAINFALL.map((s, i) => ({
    ...s,
    rainfall24hMm: Math.max(0, Math.round(jitter((high ? 70 : 14) - i * 1.8, 6, seed(`r24-${s.stationId}`)) * 10) / 10),
    rainfallNowMmHr: Math.max(0, Math.round(jitter((high ? 6 : 0.6) - i * 0.08, 0.5, seed(`rnow-${s.stationId}`)) * 100) / 100),
    observedAt: nowIso,
  }));

  const reservoirs: CnxReservoir[] = RESERVOIRS.map(({ capacityMCM, fill: baseFill, ...r }) => {
    const fill = Math.min(1.05, baseFill + (high ? 0.15 : 0));
    return {
      ...r,
      storageMCM: Math.round(capacityMCM * fill),
      fillFraction: fill,
      inflowM3s: Math.round(jitter(high ? 90 : 28, 6, seed(`i-${r.damId}`))),
      outflowM3s: Math.round(jitter(high ? 70 : 22, 4, seed(`o-${r.damId}`))),
      observedAt: nowIso,
      severity: fill >= 0.9 ? "alert" : fill >= 0.7 ? "watch" : "good",
    };
  });

  const pingCapacity = Math.max(0, ...gauges.map((g) => (g.bankFullM ? g.levelM / g.bankFullM : 0)));

  // No `office` notice, ever. A notice reads as an official communication;
  // putting a Thai agency's name on a hash-seeded number would outrank every
  // label around it the moment it is quoted on its own.
  return {
    generatedAt: nowIso,
    provenance: "scenario",
    provenanceNote: {
      th: `${DRILL_LABEL.th} (${id}) — ตัวเลขทั้งหมดสร้างขึ้นเพื่อซ้อมแผน ไม่ใช่ค่าที่วัดได้ ห้ามใช้ตัดสินสถานการณ์จริง`,
      en: `${DRILL_LABEL.en} (${id}) — every figure is generated for an exercise, not measured. Do not use it to judge the real situation.`,
    },
    drill: { id, ...DRILL_LABEL },
    gauges,
    rainfall,
    reservoirs,
    pingCapacityFraction: pingCapacity,
    office: undefined,
  };
}

// ─── Normal payload: no invented numbers ─────────────────────────

export function noScenarioPayload(nowIso: string): CnxFloodResponse {
  return {
    generatedAt: nowIso,
    provenance: "unavailable",
    provenanceNote: {
      th: "ไม่มีข้อมูลรวมในชุดนี้ — ระดับน้ำ ฝน เขื่อน และพยากรณ์ อ่านจากแหล่งจริงแยกกัน แต่ละแหล่งมีที่มาและเวลาของตัวเอง",
      en: "This payload carries no figures. River levels, rain, reservoirs and forecasts are read from their own live feeds — /api/cnx/river-level, /api/cnx/rain, /api/cnx/dam, /api/cnx/floodhub, /api/cnx/forecast-field — each with its own provenance and age.",
    },
    drill: null,
    gauges: [],
    rainfall: [],
    reservoirs: [],
  };
}

// ─── Public API ──────────────────────────────────────────────────

/** Drill payload for a valid `?scenario=<id>`; otherwise the empty, honest default. */
export async function fetchCnxFlood(scenarioId?: string | null): Promise<CnxFloodResponse> {
  const nowIso = new Date().toISOString();
  return isDrillId(scenarioId) ? buildDrill(scenarioId, nowIso) : noScenarioPayload(nowIso);
}

export function inCnxBbox(lat: number, lon: number): boolean {
  const b = CNX_PROVINCE.bbox;
  return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;
}
