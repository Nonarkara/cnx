// CNX flood / hydrology data module.
//
// ── THIS HEADER WAS WRONG UNTIL 2026-10-02. BOTH HALVES. ──────────
// It previously read:
//
//   "The upstream ThaiWater/HII API requires a key we don't have on
//    Cloudflare Workers" … "GET ThaiWater realtime (water.rid.go.th)"
//
// Neither was true. There is no key: the feed this board now reads is
// keyless and public. And `water.rid.go.th` is a 1996 HTML frameset that
// was never an API. The service name `thaiwater30` was never dead either
// — the router dispatches on the FULL sub-path, so the bare path 404s
// while `…/thaiwater30/public/waterlevel` answers 200.
//
// MEASURED RIVER LEVELS NOW LIVE IN `river-level.ts`, at
// `/api/cnx/river-level`. They are deliberately NOT here: this payload
// bundles gauges, rainfall and reservoirs under ONE provenance flag, and
// two of those three are still scenario. Moving the real gauges in would
// have forced that flag to "live" and quietly asserted that the rainfall
// and reservoir numbers are measured too. So the measurement sits beside
// this module, and this module keeps its scenario label where an operator
// can still see it.
//
// WHAT THIS MODULE STILL IS: the scenario fallback, and the reservoir and
// rainfall series. `fetchLive()` remains `return null` — it is not what
// carries the flood axis, and nothing imports it.
//
// The scenario numbers come from public monthly ThaiWater reports:
//   - Ping river bank-full at Nawarat Bridge ~3.5 m
//   - Bhumibol dam capacity 13,462 MCM
//   - Sirikit dam capacity 9,510 MCM
//   - Mae Kuang 263 MCM
//
// For what it's worth, that guessed 3.5 m turned out to be close: the
// station publishes a real critical level of 3.7 m above its zero
// (304.20 m above sea level). The guess was still a guess, and the
// published figure is what the board now shows.

import { CNX_PROVINCE } from "./config";
import type { CnxFloodResponse, CnxRainfallStation, CnxReservoir, CnxFloodGauge, OfficeNotice, SeverityLevel } from "../../types/cnx";

const TRENDING_RANDOMNESS = 0.15;

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

// ─── Live upstream hooks ─────────────────────────────────────────
// STILL a placeholder, and now honestly labelled as one. It is not
// waiting on a key — there was never a key requirement, and the intended
// source (water.rid.go.th) is a 1996 frameset. The measured feed is
// `river-level.ts`; this function exists only so the module's shape
// contract is preserved, and nothing imports it.
//
//   1. GET ThaiWater v3 /public/waterlevel?province_code=50
//   2. filter to basin_code 6 (Ping)
//   3. project, dedupe, attach observedAt
// See `river-level.ts` for all three, done.

async function fetchLive(): Promise<CnxFloodResponse | null> {
  return null;
}

// ─── Scenario fallback ───────────────────────────────────────────

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

const RESERVOIRS: Omit<CnxReservoir, "fillFraction" | "storageMCM" | "observedAt" | "severity">[] = [
  { damId: "BHM", name: "Bhumibol Dam" },
  { damId: "SKT", name: "Sirikit Dam" },
  { damId: "MKT", name: "Mae Kuang Udomthara" },
];

function buildScenario(nowIso: string): CnxFloodResponse {
  const gauges: CnxFloodGauge[] = PING_STATIONS.map((s, i) => {
    const bankFull = 3.5 + i * 0.3;
    const base = 1.4 + i * 0.15;
    const levelM = jitter(base, TRENDING_RANDOMNESS, `${s.stationId}-${nowIso}`);
    const trend: CnxFloodGauge["trend"] =
      hashSeed(`trend-${s.stationId}-${nowIso}`) > 0.5 ? "rising" : "falling";
    return {
      ...s,
      levelM: Math.round(levelM * 100) / 100,
      bankFullM: Math.round(bankFull * 100) / 100,
      dischargeM3s: Math.round(jitter(40 + i * 12, 8, `q-${s.stationId}-${nowIso}`)),
      trend,
      severity: severityForLevel(levelM, bankFull),
      observedAt: nowIso,
    };
  });

  const rainfall: CnxRainfallStation[] = RAINFALL.map((s, i) => {
    const r24 = 14 - i * 1.8;
    const rNow = 0.6 - i * 0.08;
    return {
      ...s,
      rainfall24hMm: Math.max(0, Math.round(jitter(r24, 6, `r24-${s.stationId}`) * 10) / 10),
      rainfallNowMmHr: Math.max(0, Math.round(jitter(rNow, 0.5, `rnow-${s.stationId}`) * 100) / 100),
      observedAt: nowIso,
    };
  });

  const reservoirs: CnxReservoir[] = RESERVOIRS.map((r, i) => {
    const storageMCM = r.damId === "BHM" ? 10_900 + i * 400 : r.damId === "SKT" ? 7_100 + i * 220 : 165 + i * 8;
    const fill = r.damId === "BHM" ? 0.81 : r.damId === "SKT" ? 0.74 : 0.62;
    return {
      ...r,
      storageMCM: Math.round(storageMCM),
      fillFraction: fill,
      inflowM3s: Math.round(jitter(28, 6, `i-${r.damId}`)),
      outflowM3s: Math.round(jitter(22, 4, `o-${r.damId}`)),
      observedAt: nowIso,
      severity: fill >= 0.9 ? "alert" : fill >= 0.7 ? "watch" : "good",
    };
  });

  // Ping river capacity fraction (max of the bank-full ratios)
  const pingCapacity = Math.max(
    0,
    ...gauges
      .filter((g) => g.basin === "Ping")
      .map((g) => (g.bankFullM ? g.levelM / g.bankFullM : 0)),
  );

  // No `office` notice is minted here, deliberately.
  //
  // This builder used to emit one attributed to "Royal Irrigation
  // Department Region 1" whenever the jittered ratio crossed 0.9. That is
  // us putting a Thai government agency's name on a number produced by a
  // hash function. Nothing above the payload's `provenance: "scenario"`
  // tag protects it: a notice reads as an official communication, and the
  // tag is one field away in a JSON object. A real notice belongs to the
  // live path, where there is an agency to attribute it to.
  const office: OfficeNotice | undefined = undefined;

  return {
    generatedAt: nowIso,
    provenance: "scenario",
    provenanceNote: {
      th: "ตัวเลขชุดนี้เป็นข้อมูลจำลอง ไม่ใช่ค่าที่วัดได้ — ห้ามใช้ตัดสินว่าน้ำกำลังเพิ่มหรือลด ดูค่าจริงที่สถานีวัดในพื้นที่",
      en: "These figures are a scenario fill, not measurements — do not use them to judge whether water is rising or falling. Read the live station gauges for your area.",
    },
    gauges,
    rainfall,
    reservoirs,
    pingCapacityFraction: pingCapacity,
    office,
  };
}

// ─── Public API ──────────────────────────────────────────────────

let cache: { at: number; data: CnxFloodResponse } | null = null;
const TTL_MS = 60_000;

export async function fetchCnxFlood(): Promise<CnxFloodResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const live = process.env.CNX_FLOOD_LIVE === "1" ? await fetchLive() : null;
  const data: CnxFloodResponse = live
    ? { ...live, provenance: "live", provenanceNote: null }
    : buildScenario(new Date().toISOString());
  cache = { at: Date.now(), data };
  return data;
}

export function inCnxBbox(lat: number, lon: number): boolean {
  const b = CNX_PROVINCE.bbox;
  return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;
}