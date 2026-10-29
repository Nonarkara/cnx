// CNX — province watch list.
//
// The one surface that answers the governor's actual question: "สิ่งที่
// เชียงใหม่ต้องเฝ้าระวังตอนนี้คืออะไร" — what must Chiang Mai be watching
// right now? Every warning system the board operates — satellite, ground
// measurement, model and camera vision — is listed here with its level,
// its evidence and its limits, or with an honest "ไม่มีข้อมูล". A missing
// feed is rendered as a gap, never as safety; the inventory is the proof
// the organism is alive, because a dead feed has to show up as dead.
//
// Pure function over responses the shell already polls plus five the watch
// board fetches for itself (aeronet, jaxa-aot, floodhub, aqi-amphoe and the
// TMD official warnings, which always lead the list — official-watch.ts).
// No thresholds live here that don't live in the source module — this
// file composes, it does not invent.

import { buildHazeWatchState } from "./haze-watch-state";
import type { ExecutiveMetric } from "./executive-brief";
import type { RfdFiresResponse } from "./fire-rfd";
import type { AerosolResponse } from "./aerosol";
import type { AeronetResponse } from "./aeronet";
import type { JaxaAotResponse } from "./jaxa-aot";
import { currentFloodHub, type FloodHubResponse, type FloodHubSeverity } from "./floodhub";
import type { GistdaPm25Response } from "./gistda-pm25";
import type { SmokeTrajectoryResponse } from "./smoke-trajectory";
import type { HazeVisionResponse } from "./haze-vision";
import type { DustboyResponse } from "./dustboy";
import type { WeatherLayerUrls } from "./weather-layers";
import type { RiverGauge } from "./river-level";
import type { RainResponse } from "./rain";
import { currentRainSummary } from "./rain-core";
import { outlookWatchItems, type ProvinceOutlook } from "./outlook";
import type { OfficialWarningsResponse } from "./tmd-cap-core";
import { officialWatchItems, OFFICIAL_WARNING_MAX_AGE_MS } from "./official-watch";
import { getTwinEntity } from "./twin-manifest";
import { isCurrentGaugeReading } from "./verdict";

/** "official" = a government warning (TMD CAP); it leads the board. */
export type WatchKind = "official" | "measured" | "satellite" | "model" | "vision" | "imagery";
export type WatchDomain = "water" | "air" | "fire" | "haze" | "mobility";
/** Reuses the executive-brief vocabulary: "unknown" is the honest miss. */
export type WatchLevel = ExecutiveMetric["level"];

export interface WatchItem {
  id: string;
  domain: WatchDomain;
  kind: WatchKind;
  /** System name shown to the operator, e.g. "NASA FIRMS · ดาวเทียม". */
  systemTh: string;
  systemEn: string;
  /** Attribution line under the value. */
  source: string;
  level: WatchLevel;
  valueTh: string;
  valueEn: string;
  /** Limits and caveats — every number carries its own scope statement. */
  evidenceTh: string;
  evidenceEn: string;
  /** What to do about it. Metrics carry actions; imagery rows do not. */
  actionTh: string | null;
  actionEn: string | null;
  /** Observation time (see DataAge rules). Null = no observation to age. */
  observedAt: string | null;
  /** Direct source evidence when the publisher supplies a safe HTTP(S) URL. */
  evidenceUrl?: string;
  /** Desk/panel to open for the evidence. Null = no deeper surface exists. */
  openMetric: "water" | "air" | "fire" | "mobility" | "model" | "haze" | null;
  /** Chip wording that replaces the level label, shown neutral — used for
   *  "no official warning", which must not read as a green "normal". */
  chipTh?: string;
  chipEn?: string;
}

/** Age the displayed clock, not the feed's collection cadence. FIRMS's
 * clock is a detection inside a rolling 24 h window; model/reference
 * rows use their declared issuance or daily-observation budget. */
export function watchItemStaleAfterMs(item: Pick<WatchItem, "id" | "kind" | "source">): number {
  const hour = 3_600_000;
  if (item.kind === "official") return OFFICIAL_WARNING_MAX_AGE_MS;
  if (item.id === "fire") return 24 * hour;
  if (item.id === "water") return (item.source === "ThaiWater rain gauges" ? 6 : 3) * hour;
  if (item.id === "river-gauges") return 3 * hour;
  if (item.id === "rain-gauges") return 6 * hour;
  if (item.id === "mobility") return 10 * 60_000;
  const registryId: Record<string, string> = {
    "air-gistda": "gistda-pm25", "aerosol-cams": "cams-aod",
    "smoke": "smoke-trajectory", "fires-rfd": "rfd-fires",
    "forecast-rain": "forecast-field", "forecast-pm25": "forecast-field",
  };
  return (getTwinEntity(registryId[item.id] ?? item.id)?.staleAfterSec ?? 3 * 3600) * 1000;
}

export interface WatchListInput {
  metrics: ExecutiveMetric[];
  firesRfd: RfdFiresResponse | null;
  aerosol: AerosolResponse | null;
  aeronet: AeronetResponse | null;
  jaxa: JaxaAotResponse | null;
  floodhub: FloodHubResponse | null;
  gistda: GistdaPm25Response | null;
  smoke: SmokeTrajectoryResponse | null;
  hazeVision: HazeVisionResponse | null;
  dustboy: DustboyResponse | null;
  weatherLayers: WeatherLayerUrls | null;
  riverGauges: RiverGauge[];
  rain: RainResponse | null;
  /** The 48 h forecast outlook; absent = the board did not ask for it. */
  outlook?: ProvinceOutlook | null;
  /** TMD CAP warnings for Chiang Mai; null/absent = not read (shown as unavailable). */
  officialWarnings?: OfficialWarningsResponse | null;
  now?: Date;
}

export interface WatchBoardModel {
  /** Full sensor inventory — every system, every cycle, dead or alive. */
  systems: WatchItem[];
  /** Ranked subset with a current concern (level above "good"). */
  watch: WatchItem[];
  attentionCount: number;
  /** Systems with no data right now — shown, never hidden. */
  gapCount: number;
}

const rank: Record<WatchLevel, number> = { unknown: -1, good: 0, watch: 1, alert: 2, critical: 3 };
const domainOrder: Record<WatchDomain, number> = { water: 0, air: 1, fire: 2, haze: 3, mobility: 4 };
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const officialFirst = (item: WatchItem) => (item.kind === "official" ? 0 : 1);

/** Registry SLOs differ for daily observations, relay frames and model issuance. */
function currentEvidence(id: string, stamp: string | null, now: Date): boolean {
  const limit = getTwinEntity(id)?.staleAfterSec;
  const age = stamp ? now.getTime() - Date.parse(stamp) : NaN;
  return limit != null && Number.isFinite(age) && age >= -5 * 60_000 && age <= limit * 1000;
}

/** Newest ISO stamp in a list, or null — an empty feed is not a fresh feed. */
function newestStamp(rows: Array<Record<string, unknown>>, key: string): string | null {
  let best = -Infinity;
  let raw: string | null = null;
  for (const row of rows) {
    const v = row[key];
    if (typeof v !== "string" || !v) continue;
    const t = Date.parse(v);
    if (Number.isFinite(t) && t > best) {
      best = t;
      raw = v;
    }
  }
  return raw;
}

const METRIC_DOMAIN: Record<ExecutiveMetric["id"], WatchDomain> = { water: "water", air: "air", fire: "fire", mobility: "mobility" };
const METRIC_KIND: Record<ExecutiveMetric["id"], WatchKind> = { water: "measured", air: "measured", fire: "satellite", mobility: "measured" };

function metricItems(metrics: ExecutiveMetric[]): WatchItem[] {
  return metrics.map((metric) => ({
    id: metric.id,
    domain: METRIC_DOMAIN[metric.id],
    kind: METRIC_KIND[metric.id],
    systemTh: metric.titleTh,
    systemEn: metric.titleEn,
    source: metric.source,
    level: metric.state === "current" ? metric.level : "unknown",
    valueTh: metric.value === "—" ? "ยังไม่มีข้อมูล" : `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`,
    valueEn: metric.value === "—" ? "No verified reading" : `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`,
    evidenceTh: metric.summaryTh,
    evidenceEn: metric.summaryEn,
    actionTh: metric.state === "current" ? metric.actionTh : null,
    actionEn: metric.state === "current" ? metric.actionEn : null,
    observedAt: metric.observedAt,
    openMetric: metric.id,
  }));
}

const AOD_DISPLAY_BANDS: { max: number; level: WatchLevel }[] = [
  { max: 0.1, level: "good" },
  { max: 0.25, level: "watch" },
  { max: 0.4, level: "alert" },
  { max: Infinity, level: "critical" },
];
/** Display bands only — matching aerosol.ts, an AOD column is not a health grade. */
function aodBand(aod: number): WatchLevel {
  for (const band of AOD_DISPLAY_BANDS) if (aod < band.max) return band.level;
  return "critical";
}

function gistdaItem(gistda: GistdaPm25Response | null, now: Date): WatchItem {
  const base = {
    id: "air-gistda",
    domain: "air" as const,
    kind: "satellite" as const,
    systemTh: "PM2.5 รายอำเภอ (ดาวเทียม GISTDA)",
    systemEn: "Per-district PM2.5 (GISTDA satellite)",
    source: "GISTDA · ดาวเทียม/โมเดลต่ออำเภอ · 25 อำเภอ",
    actionTh: "ตรวจสอบอำเภอที่ค่าสูงกับสถานีภาคพื้นดินและประกาศทางการ" as string | null,
    actionEn: "Cross-check elevated districts with ground stations and official notices" as string | null,
    observedAt: null as string | null,
    openMetric: "air" as const,
  };
  // Age every district observation. A newly generated envelope or a
  // current city reading cannot refresh the other district estimates.
  const districts = gistda?.provenance === "live" ? gistda.amphoe.filter(a =>
    finite(a.pm25) && a.pm25 >= 0 && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(a.dt)
    && currentEvidence("gistda-pm25", a.dt, now)) : [];
  if (!gistda || gistda.provenance !== "live" || districts.length === 0) {
    return {
      ...base,
      level: "unknown",
      valueTh: "ไม่มีข้อมูลอำเภอปัจจุบัน",
      valueEn: "No current district readings",
      evidenceTh: gistda?.provenanceNote ?? "ข้อมูลอำเภอขาดหาย เก่าเกิน 3 ชม. หรือยืนยันเวลาไม่ได้ · ไม่มีข้อมูลไม่ใช่อากาศสะอาด",
      evidenceEn: "District readings are missing, older than 3 hours or their timestamps cannot be verified; not an all-clear",
      actionTh: null,
      actionEn: null,
      observedAt: newestStamp((gistda?.amphoe ?? []) as unknown as Array<Record<string, unknown>>, "dt"),
    };
  }
  const worst = [...districts].sort((a, b) => b.pm25 - a.pm25)[0];
  const over50 = districts.filter(a => a.pm25 >= 50).length;
  const average = Math.round(districts.reduce((sum, a) => sum + a.pm25, 0) / districts.length * 10) / 10;
  const level = worst.severity;
  return {
    ...base,
    level,
    valueTh: `สูงสุด ${worst.ap_tn} ${worst.pm25} µg/m³ · เฉลี่ยอำเภอที่ใช้ได้ ${average}${over50 ? ` · ${over50} อำเภอ ≥50` : ""}`,
    valueEn: `Highest ${worst.ap_en} ${worst.pm25} µg/m³; current-district avg ${average}${over50 ? `; ${over50} districts ≥50` : ""}`,
    evidenceTh: `ใช้ ${districts.length}/${gistda.amphoe.length} อำเภอใน 3 ชม. · อ่านจากดาวเทียม/โมเดล · อำเภอที่เก่าหรืออ่านไม่ได้ไม่นับ ไม่ใช่อากาศสะอาด`,
    evidenceEn: `${districts.length}/${gistda.amphoe.length} districts within 3 hours; satellite/model estimates; old or unreadable districts are excluded, not clean air`,
    observedAt: newestStamp(districts as unknown as Array<Record<string, unknown>>, "dt"),
  };
}

function dustboyItem(dustboy: DustboyResponse | null, now: Date): WatchItem {
  const base = {
    id: "dustboy",
    domain: "air" as const,
    kind: "measured" as const,
    systemTh: "เครือข่าย PM2.5 ภาคพื้นดิน CMU DustBoy",
    systemEn: "CMU DustBoy ground PM2.5 network",
    source: "CMU CCDC · เซนเซอร์ภาคพื้นดิน",
    openMetric: "air" as const,
  };
  if (!dustboy || dustboy.provenance !== "live") {
    return {
      ...base,
      level: "unknown" as WatchLevel,
      valueTh: "ไม่มีข้อมูลเครือข่าย",
      valueEn: "Network unavailable",
      evidenceTh: "เครือข่าย DustBoy ไม่ตอบสนอง · ไม่ใช่การยืนยันว่าอากาศปลอดภัย",
      evidenceEn: "DustBoy network is not answering; not an all-clear",
      actionTh: null,
      actionEn: null,
      observedAt: null,
    };
  }
  const readings = buildHazeWatchState({ dustboy, now: now.getTime() }).chiangMaiDustboy;
  const values = readings.map(s => s.pm25!).sort((a, b) => a - b);
  const max = values.length ? values[Math.min(values.length - 1, Math.floor(values.length * 0.95))] : null;
  const level: WatchLevel = max === null ? "unknown" : max < 25 ? "good" : max < 50 ? "watch" : max < 90 ? "alert" : "critical";
  return {
    ...base,
    level,
    valueTh: `เชียงใหม่ ${readings.length}/${dustboy.stations.filter(s => s.province === "เชียงใหม่").length} สถานีล่าสุด · สูงสุด (p95) ${max ?? "—"} µg/m³`,
    valueEn: `Chiang Mai ${readings.length}/${dustboy.stations.filter(s => s.province === "เชียงใหม่").length} current stations; p95 max ${max ?? "—"} µg/m³`,
    evidenceTh: "ค่าสูงสุดใช้ p95 ที่คัดเซนเซอร์ผิดปกติแล้ว · เป็นการคัดกรอง ไม่ใช่เกณฑ์สุขภาพเฉลี่ย 24 ชม.",
    evidenceEn: "Max is the outlier-screened p95; screening value, not a 24-hour health grade",
    actionTh: level === "good" || level === "unknown" ? null : "ตรวจสอบอำเภอที่เซนเซอร์สูงและประกาศทางการ",
    actionEn: level === "good" || level === "unknown" ? null : "Check districts with elevated sensors and official notices",
    observedAt: newestStamp(readings as unknown as Array<Record<string, unknown>>, "observedAt"),
  };
}

function aerosolItem(aerosol: AerosolResponse | null, now: Date): WatchItem {
  const base = {
    id: "aerosol-cams",
    domain: "haze" as const,
    kind: "model" as const,
    systemTh: "คอลัมน์ละอองฝุ่น CAMS (AOD 550)",
    systemEn: "CAMS aerosol column (AOD 550)",
    source: "CAMS โมเดลบรรยากาศ · ชั้นคอลัมน์ทั้งหุบเขา",
    openMetric: "haze" as const,
  };
  if (!aerosol || !buildHazeWatchState({ aerosol, now: now.getTime() }).currentAerosol) {
    return {
      ...base,
      level: "unknown" as WatchLevel,
      valueTh: "ไม่มีข้อมูลโมเดล",
      valueEn: "No model output",
      evidenceTh: "โมเดล CAMS ไม่มีค่าในขณะนี้ · ไม่ใช่หลักฐานว่าไม่มีละอองฝุ่น",
      evidenceEn: "No CAMS value right now; not evidence of clear sky",
      actionTh: null,
      actionEn: null,
      observedAt: null,
    };
  }
  return {
    ...base,
    level: aerosol.level ?? aodBand(aerosol.aod550 ?? 0),
    valueTh: `AOD ${aerosol.aod550 ?? "—"} (ช่วง ${aerosol.aodMin ?? "—"}–${aerosol.aodMax ?? "—"})`,
    valueEn: `AOD ${aerosol.aod550 ?? "—"} (range ${aerosol.aodMin ?? "—"}–${aerosol.aodMax ?? "—"})`,
    evidenceTh: "คอลัมน์ทั้งบรรยากาศจากโมเดล · ไม่ใช่ค่าฝุ่นผิวดินและไม่ใช่เกณฑ์สุขภาพ",
    evidenceEn: "Whole-column model value; not surface PM2.5 and not a health threshold",
    actionTh: null,
    actionEn: null,
    observedAt: aerosol.observedAt ?? null,
  };
}

function aeronetItem(aeronet: AeronetResponse | null, now: Date): WatchItem {
  const base = {
    id: "aeronet",
    domain: "haze" as const,
    kind: "measured" as const,
    systemTh: "AERONET · AOD อ้างอิงภาคพื้นดิน",
    systemEn: "AERONET ground-truth AOD",
    source: "NASA AERONET · สถานีอุตุนิยมวิทยาเชียงใหม่ · Level 1.5",
    openMetric: "haze" as const,
  };
  if (!aeronet || !aeronet.latest) {
    return {
      ...base,
      level: "unknown" as WatchLevel,
      valueTh: "ไม่มีการอ่านค่า 30 วันล่าสุด",
      valueEn: "No reading in the last 30 days",
      evidenceTh: aeronet?.note ?? "เมฆปกคลุมหรือเครื่องมือออฟไลน์ · วันที่เมฆปิดไม่มีค่า ไม่ใช่ว่าอากาศใส",
      evidenceEn: "Cloudy or instrument offline; cloud-covered days carry no reading, not clear air",
      actionTh: null,
      actionEn: null,
      observedAt: null,
    };
  }
  const fresh = currentEvidence("aeronet", aeronet.latest.date, now);
  const smoke = finite(aeronet.latest.angstrom440_870) && aeronet.latest.angstrom440_870! > 1;
  return {
    ...base,
    level: fresh ? aodBand(aeronet.latest.aod500) : "unknown",
    valueTh: `AOD ${aeronet.latest.aod500} · Ångström ${aeronet.latest.angstrom440_870 ?? "—"}${smoke ? " · อนุภาคเล็ก ลักษณะควัน" : ""}`,
    valueEn: `AOD ${aeronet.latest.aod500}; Ångström ${aeronet.latest.angstrom440_870 ?? "—"}${smoke ? " — fine particles, smoke-like" : ""}`,
    evidenceTh: `${fresh ? "" : "ค่าอ้างอิงย้อนหลัง เกินอายุที่กำหนด 3 วันหรือยืนยันเวลาไม่ได้ · "}ค่าเฉลี่ยรายวันจากเครื่องวัดแสงอาทิตย์ · แถบสีเป็นการแสดงผล ไม่ใช่เกณฑ์สุขภาพ · เป็นค่าอ้างอิงตรวจสอบดาวเทียม`,
    evidenceEn: `${fresh ? "" : "Historical reference: outside the declared 3-day SLO or observation time unverifiable; "}daily sun-photometer mean; colour bands are display only and this is the satellite-validation reference`,
    actionTh: null,
    actionEn: null,
    observedAt: aeronet.latest.date,
  };
}

function jaxaItem(jaxa: JaxaAotResponse | null, now: Date): WatchItem {
  const base = {
    id: "jaxa-aot",
    domain: "haze" as const,
    kind: "satellite" as const,
    systemTh: "JAXA GCOM-C · ละอองฝุ่น (AOT)",
    systemEn: "JAXA GCOM-C aerosol (AOT)",
    source: "JAXA G-Portal · SGLI L3 AOT รายวัน",
    openMetric: null,
  };
  if (!jaxa || jaxa.provenance !== "live" || !jaxa.item) {
    return {
      ...base,
      level: "unknown" as WatchLevel,
      valueTh: "ไม่มีซีนใน 11 วันล่าสุด",
      valueEn: "No scene in the last 11 days",
      evidenceTh: jaxa?.reason ?? "ไม่พบข้อมูลซีน GCOM-C · ไม่ใช่การยืนยันว่าไม่มีละอองฝุ่น",
      evidenceEn: "No GCOM-C scene resolved; not evidence of clear sky",
      actionTh: null,
      actionEn: null,
      observedAt: null,
    };
  }
  const observedAt = jaxa.item.observedFrom ?? jaxa.resolvedFor ?? null;
  const fresh = currentEvidence("jaxa-aot", observedAt, now);
  return {
    ...base,
    // Presence, not a risk grade: the COG scene is imagery for analysis,
    // and the board never turns availability into an all-clear.
    level: fresh ? "good" : "unknown",
    valueTh: `ซีนประจำวันที่ ${jaxa.resolvedFor} (ย้อน ${jaxa.walkedBackDays} วัน)`,
    valueEn: `Scene for ${jaxa.resolvedFor} (${jaxa.walkedBackDays} d walk-back)`,
    evidenceTh: `${fresh ? "" : "ซีนย้อนหลัง เกินอายุที่กำหนด 3 วันหรือยืนยันเวลาไม่ได้ · "}ความพร้อมของข้อมูล ไม่ใช่ระดับความเสี่ยง · พื้นที่ที่เมฆปิดในซีนเป็นค่าว่างตามที่ประกาศ ไม่ใช่อากาศใส`,
    evidenceEn: `${fresh ? "" : "Historical scene: outside the declared 3-day SLO or observation time unverifiable; "}data availability, not a risk level; cloud-covered scene pixels are declared no-observation, not clean air`,
    actionTh: null,
    actionEn: null,
    observedAt,
  };
}

function smokeItem(smoke: SmokeTrajectoryResponse | null, now: Date): WatchItem {
  const base = {
    id: "smoke",
    domain: "haze" as const,
    kind: "model" as const,
    systemTh: "แนวการเคลื่อนที่ของควัน",
    systemEn: "Smoke trajectory",
    source: smoke?.method === "forecast-field" ? "NASA FIRMS × 850 hPa hourly forecast wind" : "NASA FIRMS × surface wind · straight-line fallback",
    openMetric: "haze" as const,
  };
  if (!smoke || !buildHazeWatchState({ smoke, now: now.getTime() }).currentSmoke) {
    return {
      ...base,
      level: "unknown" as WatchLevel,
      valueTh: "ไม่มีการคำนวณควัน",
      valueEn: "No smoke computation",
      evidenceTh: "ต้องใช้จุดความร้อนสดจากดาวเทียมเท่านั้น · ไม่มีข้อมูลไม่ได้แปลว่าไม่มีควัน",
      evidenceEn: "Requires live satellite hotspots; no data does not mean no smoke",
      actionTh: null,
      actionEn: null,
      observedAt: null,
    };
  }
  const s = smoke.summary;
  const incomplete = (smoke.omittedTrajectories ?? 0) > 0;
  const level: WatchLevel = s.hitsCnx > 0 ? "alert" : s.nearCnx > 0 ? "watch" : incomplete ? "unknown" : "good";
  return {
    ...base,
    level,
    valueTh: `ควันจาก ${s.total} จุดปล่อง · เข้าเขต CNX ${s.hitsCnx} · ใกล้เขต ${s.nearCnx} · ทิศ ${s.origin_th}`,
    valueEn: `Smoke from ${s.total} sources; reaches CNX ${s.hitsCnx}, near ${s.nearCnx}; ${s.origin_en}`,
    evidenceTh: `${smoke.methodology_th}${incomplete ? " · บางเส้นทางไม่มีลมพยากรณ์ครบ 6 ชม. ไม่ใช่การยืนยันว่าไม่มีควันเข้าเขต" : ""}`,
    evidenceEn: `${smoke.methodology_en}${incomplete ? "; some trajectories lack six-hour coverage — not an all-clear" : ""}`,
    actionTh: level === "good" || level === "unknown" ? null : "ตรวจสอบแนวควันบนแผนที่และค่าฝุ่นภาคพื้นดินควบคู่กัน",
    actionEn: level === "good" || level === "unknown" ? null : "Check the plume lines on the map together with ground PM2.5",
    observedAt: smoke.generatedAt,
  };
}

function floodHubItem(input: FloodHubResponse | null, now: Date): WatchItem {
  const floodhub = currentFloodHub(input, now);
  const base = {
    id: "floodhub",
    domain: "water" as const,
    kind: "model" as const,
    systemTh: "Google FloodHub · พยากรณ์น้ำแม่น้ำ",
    systemEn: "Google FloodHub river forecast",
    source: "Google FloodHub · จุดตรวจเสมือนลุ่มแม่น้ำปิง",
    openMetric: "model" as const,
  };
  if (!floodhub || floodhub.provenance !== "live") {
    return {
      ...base,
      level: "unknown" as WatchLevel,
      valueTh: "ไม่มีข้อมูลพยากรณ์",
      valueEn: "No forecast data",
      evidenceTh: "ไม่มีช่วงพยากรณ์ FloodHub ที่เป็นปัจจุบัน · ไม่มีข้อมูลไม่ใช่การยืนยันว่าไม่มีน้ำท่วม",
      evidenceEn: "No current FloodHub issuance and forecast window; absence of data is not absence of flooding",
      actionTh: null,
      actionEn: null,
      observedAt: null,
    };
  }
  const worstLevel = (worst: FloodHubSeverity | null): WatchLevel =>
    worst === "EXTREME" ? "critical" : worst === "SEVERE" ? "alert" : worst === "ABOVE_NORMAL" ? "watch" : "good";
  const known = floodhub.points.filter(p => p.severity !== "UNKNOWN");
  const elevated = known.filter(p => p.severity !== "NO_FLOODING").length;
  const coverageTh = ` · ใช้ได้ ${known.length}/${floodhub.points.length} จุด`;
  const coverageEn = `; ${known.length}/${floodhub.points.length} points current`;
  const level = floodhub.outlook === "flooding" ? worstLevel(floodhub.worst) : floodhub.outlook === "none-forecast" ? "good" : "unknown";
  return {
    ...base,
    level,
    valueTh: floodhub.outlook === "flooding"
      ? `คาดการณ์น้ำสูงกว่าปกติ ${elevated} จุดตรวจ · ระดับสูงสุด ${floodhub.worst ?? "—"}`
      : floodhub.outlook === "none-forecast"
        ? "ไม่มีจุดตรวจที่คาดการณ์น้ำล้นตลิ่ง"
        : "สถานะพยากรณ์ไม่ทราบ",
    valueEn: floodhub.outlook === "flooding"
      ? `Above-normal water forecast at ${elevated} gauge points; worst ${floodhub.worst ?? "—"}`
      : floodhub.outlook === "none-forecast"
        ? "No gauge point forecasts above-normal water"
        : "Forecast status unknown",
    evidenceTh: `${floodhub.note}${coverageTh}`,
    evidenceEn: `${floodhub.note}${coverageEn}`,
    actionTh: floodhub.outlook === "flooding" ? "ตรวจสอบจุดตรวจที่ระดับสูงและประกาศทางการริมน้ำ" : null,
    actionEn: floodhub.outlook === "flooding" ? "Check elevated gauge points and official notices along the river" : null,
    observedAt: newestStamp(known as unknown as Array<Record<string, unknown>>, "issuedTime"),
  };
}

function hazeVisionItem(hazeVision: HazeVisionResponse | null, now: Date): WatchItem {
  const base = {
    id: "haze-vision",
    domain: "haze" as const,
    kind: "vision" as const,
    systemTh: "กล้องวิสัยทัศน์หมอกควัน",
    systemEn: "Haze webcam vision",
    source: "เรลาย์วิเคราะห์ภาพกล้อง · เทียบ DustBoy อัตโนมัติ",
    openMetric: "haze" as const,
  };
  if (!hazeVision || hazeVision.provenance !== "live") {
    return {
      ...base,
      level: "unknown" as WatchLevel,
      valueTh: "ไม่มีผลวิเคราะห์ภาพ",
      valueEn: "No vision verdicts",
      evidenceTh: "เรลาย์ภาพกล้องเงียบ · ไม่ใช่การยืนยันว่าไม่มีหมอก",
      evidenceEn: "The vision relay is quiet; not proof of clear air",
      actionTh: null,
      actionEn: null,
      observedAt: null,
    };
  }
  // A fresh relay push does not refresh an old frame, and a dark,
  // monochrome or calibrating frame carries no verdict about clear air.
  const cams = buildHazeWatchState({ hazeVision, now: now.getTime() }).assessedCameras;
  const excluded = hazeVision.cameras.length - cams.length;
  const likely = cams.filter((c) => c.verdict === "haze-likely").length;
  const some = cams.filter((c) => c.verdict === "some-haze").length;
  const clear = cams.filter((c) => c.verdict === "clear").length;
  const level: WatchLevel = likely > 0 ? "alert" : some > 0 ? "watch" : cams.length ? "good" : "unknown";
  const a = hazeVision.agreement;
  const agreement = a && a.pairs > 0
    ? `สอดคล้องกับฝุ่นภาคพื้นดิน r=${a.r ?? "—"} (${a.pairs} คู่ข้อมูล)${a.spansHazeEvent ? "" : " · ยังไม่เคยผ่านเหตุการณ์หมอกระดับสูงจริง จึงยังตรวจสอบความแม่นไม่ได้"}`
    : "ยังไม่มีคู่ข้อมูลพอให้ประเมินความสอดคล้อง";
  return {
    ...base,
    level,
    valueTh: `${cams.length} กล้องที่ประเมินได้ล่าสุด · สันนิษฐานหมอก ${likely} · มีหมอกบางส่วน ${some} · ชัด ${clear}${excluded ? ` · ${excluded} กล้องเก่า/ยังประเมินไม่ได้` : ""}`,
    valueEn: `${cams.length} current usable cameras; haze-likely ${likely}, some-haze ${some}, clear ${clear}${excluded ? `; ${excluded} stale/unusable cameras` : ""}`,
    evidenceTh: `${agreement} · คำตัดสินจากภาพเป็นการคัดกรอง ไม่ใช่การวัดฝุ่นโดยตรง`,
    evidenceEn: `${a && a.pairs > 0 ? `Camera/ground association r=${a.r ?? "—"} (${a.pairs} distinct pairs); detection accuracy not established` : "Insufficient paired ground observations"}; image screening is not a PM2.5 measurement`,
    actionTh: likely + some > 0 ? "เปิดภาพกล้องจุดที่สันนิษฐานหมอกเพื่อยืนยันด้วยตา" : null,
    actionEn: likely + some > 0 ? "Open the flagged camera snapshots and verify visually" : null,
    observedAt: newestStamp(cams as unknown as Array<Record<string, unknown>>, "observedAt"),
  };
}

function rfdItem(rfd: RfdFiresResponse | null, now: Date): WatchItem {
  const base = {
    id: "fires-rfd",
    domain: "fire" as const,
    kind: "satellite" as const,
    systemTh: "กรมอุทยานแห่งชาติ · จุดความร้อน 7 วัน",
    systemEn: "Royal Forest Department · 7-day hotspots",
    source: "wildfire.forest.go.th · รายงานภาคสนาม/ดาวเทียม",
    openMetric: "fire" as const,
  };
  if (!rfd || rfd.provenance !== "live" || !currentEvidence("rfd-fires", rfd.generatedAt, now)) {
    return {
      ...base,
      level: "unknown" as WatchLevel,
      valueTh: "ไม่มีข้อมูลหน่วยงาน",
      valueEn: "Agency feed unavailable",
      evidenceTh: "ข้อมูลกรมป่าไม้ขาดหายหรือเกินอายุ ไม่ได้แปลว่าไม่มีจุดความร้อน",
      evidenceEn: "Missing or stale RFD data does not establish zero hotspots",
      actionTh: null,
      actionEn: null,
      observedAt: null,
    };
  }
  const count = rfd.totalCount ?? rfd.hotspots.length;
  return {
    ...base,
    level: count > 0 ? "watch" : "good",
    valueTh: `${count} จุด 7 วัน · ในเขตป่า ${Math.round((rfd.forestShare ?? 0) * 100)}%`,
    valueEn: `${count} detections over 7 days; ${(rfd.forestShare ?? 0) * 100}% in forest tenure`,
    evidenceTh: "จุดความร้อนสะสม 7 วันของหน่วยงาน ไม่ใช่ไฟที่กำลังลุกไหม้ · จุดในเขตป่าสงวนต้องการการตรวจสอบภาคสนาม",
    evidenceEn: "7-day agency accumulation, not actively burning fires; detections inside forest reserves need field verification",
    actionTh: count > 0 ? "ตรวจสอบจุดในเขตป่ากับหน่วยป้องกันไฟภาคสนาม" : null,
    actionEn: count > 0 ? "Verify reserve detections with field fire crews" : null,
    observedAt: newestStamp(rfd.hotspots as unknown as Array<Record<string, unknown>>, "yymmdd"),
  };
}

function imageryItem(
  id: string,
  systemTh: string,
  systemEn: string,
  source: string,
  available: boolean | null,
  availableTh: string,
  availableEn: string,
  missingTh: string,
  missingEn: string,
): WatchItem {
  // `available: null` means the board has not probed this layer yet —
  // the row states that honestly instead of claiming readiness.
  const level: WatchLevel = available === true ? "good" : "unknown";
  const value =
    available === true
      ? { th: availableTh, en: availableEn }
      : available === false
        ? { th: missingTh, en: missingEn }
        : { th: "ยังไม่ตรวจสอบสถานะช่องเวลา", en: "Time slot not probed yet" };
  return {
    id,
    domain: id === "weather-radar" ? "water" : "haze",
    kind: "imagery",
    systemTh,
    systemEn,
    source,
    level,
    valueTh: value.th,
    valueEn: value.en,
    evidenceTh: "ชั้นข้อมูลภาพประกอบการตัดสินใจบนแผนที่ · แถบสีเป็นการแสดงผล ไม่ใช่เกณฑ์เตือนภัย",
    evidenceEn: "Supporting imagery layer on the map; colour bands are display only, not warning thresholds",
    actionTh: null,
    actionEn: null,
    observedAt: null,
    openMetric: null,
  };
}

function riverItem(gauges: RiverGauge[], now: Date): WatchItem {
  const current = gauges.filter(g => isCurrentGaugeReading(g.observedAt, now.getTime()));
  const observedAt = newestStamp((current.length ? current : gauges) as unknown as Array<Record<string, unknown>>, "observedAt");
  return {
    id: "river-gauges",
    domain: "water",
    kind: "measured",
    systemTh: "สถานีวัดระดับน้ำแม่ปิง",
    systemEn: "Ping river gauges",
    source: "ThaiWater · ผ่านเรลาย์ 10 นาที",
    // Availability, not risk: the verdict on the water axis lives in the
    // water metric row fed by these gauges.
    level: current.length ? "good" : "unknown",
    valueTh: `${current.length}/${gauges.length} สถานีใน 3 ชม.`,
    valueEn: `${current.length}/${gauges.length} gauges within 3 hours`,
    evidenceTh: "นับเฉพาะค่าวัดใน 3 ชม. เหมือนแถวน้ำด้านบน · สถานีเก่าหรือยืนยันเวลาไม่ได้เป็นประวัติ ไม่ใช่หลักฐานว่าน้ำปัจจุบันปลอดภัย",
    evidenceEn: "Only observations within 3 hours feed the water row above; old or unverifiable readings are historical, not evidence that current river conditions are safe",
    actionTh: null,
    actionEn: null,
    observedAt,
    openMetric: "water",
  };
}

function rainItem(rainSummary: ReturnType<typeof currentRainSummary>): WatchItem {
  const wet = rainSummary?.districts[0] ?? null;
  const level: WatchLevel = !rainSummary ? "unknown" : wet?.band === "very-heavy" ? "alert" : wet ? "watch" : "good";
  return {
    id: "rain-gauges",
    domain: "water",
    kind: "measured",
    systemTh: "เครื่องวัดฝน 24 ชม.",
    systemEn: "24-hour rain gauges",
    source: "ThaiWater · ผ่านเรลาย์",
    level,
    valueTh: rainSummary
      ? wet
        ? `ฝนหนัก${wet.band === "very-heavy" ? "มาก" : ""} สูงสุด ${wet.max} มม. ที่ อ.${wet.th}`
        : `${rainSummary.stations.length} สถานี · ไม่มีฝนหนักใน 24 ชม.`
      : "ไม่มีข้อมูลฝนจากเรลาย์",
    valueEn: rainSummary
      ? wet
        ? `${wet.band === "very-heavy" ? "Very heavy" : "Heavy"} rain, max ${wet.max} mm in ${wet.en}`
        : `${rainSummary.stations.length} gauges; no heavy rain in 24 h`
      : "No relayed rain data",
    evidenceTh: "ฝนหนักวัดได้คือสัญญาณน้ำป่า/ดินถล่มก่อนที่น้ำจะถึงแม่น้ำ · เกินอายุเรลาย์ = ไม่มีข้อมูล ไม่ใช่ไม่มีฝน",
    evidenceEn: "Heavy measured rain is the flash-flood signal before water reaches the river; past relay age is absence, not dry weather",
    actionTh: wet ? "เฝ้าระวังน้ำป่า/ดินถล่มพื้นที่ลาดชันของอำเภอที่ฝนหนัก" : null,
    actionEn: wet ? "Watch slopes in the heavy-rain districts for flash floods and landslides" : null,
    observedAt: rainSummary?.wettest?.observedAt ?? null,
    openMetric: "water",
  };
}

export function buildWatchList(input: WatchListInput): WatchBoardModel {
  const now = input.now ?? new Date();
  const rainSummary = currentRainSummary(input.rain, now.getTime());
  const outlook = input.outlook && !currentEvidence("forecast-field", input.outlook.fetchedAt, now)
    ? { ...input.outlook, available: false }
    : input.outlook;

  const systems: WatchItem[] = [
    // Official warnings first: the government's statement leads the board.
    ...officialWatchItems(input.officialWarnings, now),
    ...metricItems(input.metrics),
    riverItem(input.riverGauges, now),
    rainItem(rainSummary),
    ...(outlook ? outlookWatchItems(outlook).map(item => input.outlook?.available && !outlook.available ? {
      ...item,
      observedAt: input.outlook.fetchedAt,
      evidenceTh: "แบบจำลองเกินอายุที่กำหนด 6 ชม. หรือยืนยันเวลาไม่ได้ · ยืนยันพยากรณ์ปัจจุบันไม่ได้ ไม่ใช่การยืนยันว่าไม่มีฝนหรือฝุ่น",
      evidenceEn: "Forecast is older than the declared 6-hour limit or its timestamp cannot be verified; current rain and air outlook are unknown, not an all-clear",
    } : item) : []),
    gistdaItem(input.gistda, now),
    dustboyItem(input.dustboy, now),
    aerosolItem(input.aerosol, now),
    aeronetItem(input.aeronet, now),
    jaxaItem(input.jaxa, now),
    smokeItem(input.smoke, now),
    floodHubItem(input.floodhub, now),
    hazeVisionItem(input.hazeVision, now),
    rfdItem(input.firesRfd, now),
    imageryItem(
      "weather-himawari",
      "Himawari-9 · ความร้อนอินฟราเรด",
      "Himawari-9 infrared",
      "JMA/GIBS · ภาพดาวเทียมพฤกษา 10 นาที",
      input.weatherLayers ? input.weatherLayers.himawari !== null : null,
      "พร้อมใช้ · เปิดบนแผนที่",
      "Available on the map",
      "ไม่มีภาพในช่วงเวลานี้",
      "No imagery for this time window",
    ),
    imageryItem(
      "weather-aod",
      "MODIS · ภาพละอองฝุ่นรวม",
      "MODIS combined aerosol imagery",
      "NASA GIBS · ภาพ AOD รายวัน",
      input.weatherLayers ? input.weatherLayers.aerosol !== null : null,
      "พร้อมใช้ · เปิดบนแผนที่",
      "Available on the map",
      "ไม่มีภาพในช่องเวลานี้",
      "No imagery in this slot",
    ),
    imageryItem(
      "weather-radar",
      "RainViewer · เรดาร์ฝน",
      "RainViewer precipitation radar",
      "RainViewer · เรดาร์ฝนใกล้เคียงเวลาจริง",
      input.weatherLayers ? input.weatherLayers.rainRadar !== null : null,
      "พร้อมใช้ · เปิดบนแผนที่",
      "Available on the map",
      "ไม่มีภาพเรดาร์ในช่วงนี้",
      "No radar frame in this window",
    ),
    imageryItem(
      "burnscar",
      "Sentinel-2 · รอยไฟเผา",
      "Sentinel-2 burn scars",
      "HII tamroypao · ไทล์รอยไฟฤดูแล้ง",
      true,
      "ชั้นข้อมูลบนแผนที่ · เปิดดูรอยไฟย้อนหลัง",
      "Map layer; retrospective burn mapping",
      "-",
      "-",
    ),
  ];

  const watch = systems
    .filter((item) => rank[item.level] > 0)
    .sort((a, b) => officialFirst(a) - officialFirst(b) || rank[b.level] - rank[a.level] || domainOrder[a.domain] - domainOrder[b.domain]);

  return {
    systems,
    watch,
    attentionCount: watch.length,
    gapCount: systems.filter((item) => item.level === "unknown").length,
  };
}
