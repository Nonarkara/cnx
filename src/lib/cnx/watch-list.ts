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
// Pure function over responses the shell already polls plus four the watch
// board fetches for itself (aeronet, jaxa-aot, floodhub, aqi-amphoe).
// No thresholds live here that don't live in the source module — this
// file composes, it does not invent.

import type { ExecutiveMetric } from "./executive-brief";
import type { RfdFiresResponse } from "./fire-rfd";
import type { AerosolResponse } from "./aerosol";
import type { AeronetResponse } from "./aeronet";
import type { JaxaAotResponse } from "./jaxa-aot";
import type { FloodHubResponse, FloodHubSeverity } from "./floodhub";
import type { GistdaPm25Response } from "./gistda-pm25";
import type { SmokeTrajectoryResponse } from "./smoke-trajectory";
import type { HazeVisionResponse } from "./haze-vision";
import type { DustboyResponse } from "./dustboy";
import type { WeatherLayerUrls } from "./weather-layers";
import type { RiverGauge } from "./river-level";
import type { RainResponse } from "./rain";
import { currentRainSummary } from "./rain-core";

export type WatchKind = "measured" | "satellite" | "model" | "vision" | "imagery";
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
  /** Desk/panel to open for the evidence. Null = no deeper surface exists. */
  openMetric: "water" | "air" | "fire" | "mobility" | "model" | null;
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
    level: metric.level,
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

function gistdaItem(gistda: GistdaPm25Response | null): WatchItem {
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
  if (!gistda || gistda.provenance !== "live") {
    return {
      ...base,
      level: "unknown",
      valueTh: "ไม่มีข้อมูลอำเภอ",
      valueEn: "No district readings",
      evidenceTh: gistda?.provenanceNote ?? "อ่านค่ารายอำเภอจาก GISTDA ไม่ได้ในขณะนี้ · ไม่มีข้อมูลไม่ใช่อากาศสะอาด",
      evidenceEn: "GISTDA district readings are unavailable; missing readings are not an all-clear",
      actionTh: null,
      actionEn: null,
    };
  }
  const worst = gistda.worstAmphoe;
  const over50 = gistda.amphoe.filter((a) => finite(a.pm25) && a.pm25 >= 50).length;
  const level = worst?.severity ?? gistda.severity ?? "unknown";
  return {
    ...base,
    level,
    valueTh: worst
      ? `สูงสุด ${worst.ap_tn} ${worst.pm25} µg/m³ · เฉลี่ยจังหวัด ${gistda.provinceAveragePm25 ?? "—"}${over50 ? ` · ${over50} อำเภอ ≥50` : ""}`
      : `เฉลี่ยจังหวัด ${gistda.provinceAveragePm25 ?? "—"} µg/m³`,
    valueEn: worst
      ? `Highest ${worst.ap_en} ${worst.pm25} µg/m³; province avg ${gistda.provinceAveragePm25 ?? "—"}${over50 ? `; ${over50} districts ≥50` : ""}`
      : `Province avg ${gistda.provinceAveragePm25 ?? "—"} µg/m³`,
    evidenceTh: "อ่านจากดาวเทียม/โมเดลต่ออำเภอ · อำเภอที่อ่านไม่ได้เป็นค่าว่าง ไม่ใช่อากาศสะอาด",
    evidenceEn: "Satellite/model estimate per district; unreadable districts are null, not clean air",
    observedAt: newestStamp(gistda.amphoe as unknown as Array<Record<string, unknown>>, "dt"),
  };
}

function dustboyItem(dustboy: DustboyResponse | null): WatchItem {
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
  const max = finite(dustboy.basin.maxPm25) ? dustboy.basin.maxPm25 : null;
  const level: WatchLevel = max === null ? "unknown" : max < 25 ? "good" : max < 50 ? "watch" : max < 90 ? "alert" : "critical";
  return {
    ...base,
    level,
    valueTh: `${dustboy.basin.onlineCount}/${dustboy.basin.stationCount} สถานีออนไลน์ · สูงสุด (p95) ${max ?? "—"} µg/m³`,
    valueEn: `${dustboy.basin.onlineCount}/${dustboy.basin.stationCount} stations online; p95 max ${max ?? "—"} µg/m³`,
    evidenceTh: "ค่าสูงสุดใช้ p95 ที่คัดเซนเซอร์ผิดปกติแล้ว · เป็นการคัดกรอง ไม่ใช่เกณฑ์สุขภาพเฉลี่ย 24 ชม.",
    evidenceEn: "Max is the outlier-screened p95; screening value, not a 24-hour health grade",
    actionTh: level === "good" ? null : "ตรวจสอบอำเภอที่เซนเซอร์สูงและประกาศทางการ",
    actionEn: level === "good" ? null : "Check districts with elevated sensors and official notices",
    observedAt: newestStamp(dustboy.stations as unknown as Array<Record<string, unknown>>, "observedAt"),
  };
}

function aerosolItem(aerosol: AerosolResponse | null): WatchItem {
  const base = {
    id: "aerosol-cams",
    domain: "haze" as const,
    kind: "model" as const,
    systemTh: "คอลัมน์ละอองฝุ่น CAMS (AOD 550)",
    systemEn: "CAMS aerosol column (AOD 550)",
    source: "CAMS โมเดลบรรยากาศ · ชั้นคอลัมน์ทั้งหุบเขา",
    openMetric: "fire" as const,
  };
  if (!aerosol || aerosol.provenance !== "model") {
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
    observedAt: aerosol.generatedAt,
  };
}

function aeronetItem(aeronet: AeronetResponse | null): WatchItem {
  const base = {
    id: "aeronet",
    domain: "haze" as const,
    kind: "measured" as const,
    systemTh: "AERONET · AOD อ้างอิงภาคพื้นดิน",
    systemEn: "AERONET ground-truth AOD",
    source: "NASA AERONET · สถานีอุตุนิยมวิทยาเชียงใหม่ · Level 1.5",
    openMetric: null,
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
  const smoke = finite(aeronet.latest.angstrom440_870) && aeronet.latest.angstrom440_870! > 1;
  return {
    ...base,
    level: aodBand(aeronet.latest.aod500),
    valueTh: `AOD ${aeronet.latest.aod500} · Ångström ${aeronet.latest.angstrom440_870 ?? "—"}${smoke ? " · อนุภาคเล็ก ลักษณะควัน" : ""}`,
    valueEn: `AOD ${aeronet.latest.aod500}; Ångström ${aeronet.latest.angstrom440_870 ?? "—"}${smoke ? " — fine particles, smoke-like" : ""}`,
    evidenceTh: "ค่าเฉลี่ยรายวันจากเครื่องวัดแสงอาทิตย์ · แถบสีเป็นการแสดงผล ไม่ใช่เกณฑ์สุขภาพ · เป็นค่าอ้างอิงตรวจสอบดาวเทียม",
    evidenceEn: "Daily sun-photometer mean; colour bands are display only and this is the satellite-validation reference",
    actionTh: null,
    actionEn: null,
    observedAt: aeronet.latest.date,
  };
}

function jaxaItem(jaxa: JaxaAotResponse | null): WatchItem {
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
  return {
    ...base,
    // Presence, not a risk grade: the COG scene is imagery for analysis,
    // and the board never turns availability into an all-clear.
    level: "good" as WatchLevel,
    valueTh: `ซีนประจำวันที่ ${jaxa.resolvedFor} (ย้อน ${jaxa.walkedBackDays} วัน)`,
    valueEn: `Scene for ${jaxa.resolvedFor} (${jaxa.walkedBackDays} d walk-back)`,
    evidenceTh: "ความพร้อมของข้อมูล ไม่ใช่ระดับความเสี่ยง · พื้นที่ที่เมฆปิดในซีนเป็นค่าว่างตามที่ประกาศ ไม่ใช่อากาศใส",
    evidenceEn: "Data availability, not a risk level; cloud-covered scene pixels are declared no-observation, not clean air",
    actionTh: null,
    actionEn: null,
    observedAt: jaxa.item.observedFrom ?? jaxa.resolvedFor ?? null,
  };
}

function smokeItem(smoke: SmokeTrajectoryResponse | null): WatchItem {
  const base = {
    id: "smoke",
    domain: "haze" as const,
    kind: "model" as const,
    systemTh: "แนวการเคลื่อนที่ของควัน",
    systemEn: "Smoke trajectory",
    source: "FIRMS จุดความร้อนสด × ลมปัจจุบัน · การแพร่กระจายแบบเส้นตรง",
    openMetric: null,
  };
  if (!smoke || smoke.provenance !== "live") {
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
  const level: WatchLevel = s.hitsCnx > 0 ? "alert" : s.nearCnx > 0 ? "watch" : "good";
  return {
    ...base,
    level,
    valueTh: `ควันจาก ${s.total} จุดปล่อง · เข้าเขต CNX ${s.hitsCnx} · ใกล้เขต ${s.nearCnx} · ทิศ ${s.origin_th}`,
    valueEn: `Smoke from ${s.total} sources; reaches CNX ${s.hitsCnx}, near ${s.nearCnx}; ${s.origin_en}`,
    evidenceTh: smoke.methodology_th,
    evidenceEn: smoke.methodology_en,
    actionTh: level === "good" ? null : "ตรวจสอบแนวควันบนแผนที่และค่าฝุ่นภาคพื้นดินควบคู่กัน",
    actionEn: level === "good" ? null : "Check the plume lines on the map together with ground PM2.5",
    observedAt: smoke.generatedAt,
  };
}

function floodHubItem(floodhub: FloodHubResponse | null): WatchItem {
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
      evidenceTh: "FloodHub ไม่ตอบสนอง · ไม่มีข้อมูลไม่ใช่การยืนยันว่าไม่มีน้ำท่วม",
      evidenceEn: "FloodHub is not answering; absence of data is not absence of flooding",
      actionTh: null,
      actionEn: null,
      observedAt: null,
    };
  }
  const worstLevel = (worst: FloodHubSeverity | null): WatchLevel =>
    worst === "EXTREME" ? "critical" : worst === "SEVERE" ? "alert" : worst === "ABOVE_NORMAL" ? "watch" : "good";
  const level = floodhub.outlook === "flooding" ? worstLevel(floodhub.worst) : floodhub.outlook === "none-forecast" ? "good" : "unknown";
  return {
    ...base,
    level,
    valueTh: floodhub.outlook === "flooding"
      ? `คาดการณ์น้ำสูงกว่าปกติ ${floodhub.points.length} จุดตรวจ · ระดับสูงสุด ${floodhub.worst ?? "—"}`
      : floodhub.outlook === "none-forecast"
        ? "ไม่มีจุดตรวจที่คาดการณ์น้ำล้นตลิ่ง"
        : "สถานะพยากรณ์ไม่ทราบ",
    valueEn: floodhub.outlook === "flooding"
      ? `Above-normal water forecast at ${floodhub.points.length} gauge points; worst ${floodhub.worst ?? "—"}`
      : floodhub.outlook === "none-forecast"
        ? "No gauge point forecasts above-normal water"
        : "Forecast status unknown",
    evidenceTh: floodhub.note,
    evidenceEn: floodhub.note,
    actionTh: floodhub.outlook === "flooding" ? "ตรวจสอบจุดตรวจที่ระดับสูงและประกาศทางการริมน้ำ" : null,
    actionEn: floodhub.outlook === "flooding" ? "Check elevated gauge points and official notices along the river" : null,
    observedAt: newestStamp(floodhub.points as unknown as Array<Record<string, unknown>>, "issuedTime"),
  };
}

function hazeVisionItem(hazeVision: HazeVisionResponse | null): WatchItem {
  const base = {
    id: "haze-vision",
    domain: "haze" as const,
    kind: "vision" as const,
    systemTh: "กล้องวิสัยทัศน์หมอกควัน",
    systemEn: "Haze webcam vision",
    source: "เรลาย์วิเคราะห์ภาพกล้อง · เทียบ DustBoy อัตโนมัติ",
    openMetric: null,
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
  const cams = hazeVision.cameras;
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
    valueTh: `${cams.length} กล้อง · สันนิษฐานหมอก ${likely} · มีหมอกบางส่วน ${some} · ชัด ${clear}`,
    valueEn: `${cams.length} cameras; haze-likely ${likely}, some-haze ${some}, clear ${clear}`,
    evidenceTh: `${agreement} · คำตัดสินจากภาพเป็นการคัดกรอง ไม่ใช่การวัดฝุ่นโดยตรง`,
    evidenceEn: `${agreement}; image verdicts are screening, not direct measurement`,
    actionTh: likely + some > 0 ? "เปิดภาพกล้องจุดที่สันนิษฐานหมอกเพื่อยืนยันด้วยตา" : null,
    actionEn: likely + some > 0 ? "Open the flagged camera snapshots and verify visually" : null,
    observedAt: newestStamp(cams as unknown as Array<Record<string, unknown>>, "observedAt"),
  };
}

function rfdItem(rfd: RfdFiresResponse | null): WatchItem {
  const base = {
    id: "fires-rfd",
    domain: "fire" as const,
    kind: "satellite" as const,
    systemTh: "กรมอุทยานแห่งชาติ · จุดความร้อน 7 วัน",
    systemEn: "Royal Forest Department · 7-day hotspots",
    source: "wildfire.forest.go.th · รายงานภาคสนาม/ดาวเทียม",
    openMetric: "fire" as const,
  };
  if (!rfd || rfd.provenance !== "live") {
    return {
      ...base,
      level: "unknown" as WatchLevel,
      valueTh: "ไม่มีข้อมูลหน่วยงาน",
      valueEn: "Agency feed unavailable",
      evidenceTh: "ไม่มีข้อมูลจากกรมอุทยานฯ ไม่ได้แปลว่าไม่มีจุดความร้อน",
      evidenceEn: "No RFD data does not establish zero hotspots",
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

function riverItem(gauges: RiverGauge[]): WatchItem {
  const observedAt = newestStamp(gauges as unknown as Array<Record<string, unknown>>, "observedAt");
  return {
    id: "river-gauges",
    domain: "water",
    kind: "measured",
    systemTh: "สถานีวัดระดับน้ำแม่ปิง",
    systemEn: "Ping river gauges",
    source: "ThaiWater · ผ่านเรลาย์ 10 นาที",
    // Availability, not risk: the verdict on the water axis lives in the
    // water metric row fed by these gauges.
    level: observedAt ? "good" : "unknown",
    valueTh: `${gauges.length} สถานีรายงาน`,
    valueEn: `${gauges.length} gauges reporting`,
    evidenceTh: "การวัดต่อเนื่องที่ป้อนแถวน้ำและเครื่องชี้ขาดจังหวัดด้านบน · สถานีที่รายงานล้มเหลวจะหายไปเฉย ๆ ไม่ใช่กลายเป็นระดับ 0",
    evidenceEn: "Continuous collection feeding the water row above; a failed gauge disappears rather than reading zero",
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

  const systems: WatchItem[] = [
    ...metricItems(input.metrics),
    riverItem(input.riverGauges),
    rainItem(rainSummary),
    gistdaItem(input.gistda),
    dustboyItem(input.dustboy),
    aerosolItem(input.aerosol),
    aeronetItem(input.aeronet),
    jaxaItem(input.jaxa),
    smokeItem(input.smoke),
    floodHubItem(input.floodhub),
    hazeVisionItem(input.hazeVision),
    rfdItem(input.firesRfd),
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
    .sort((a, b) => rank[b.level] - rank[a.level] || domainOrder[a.domain] - domainOrder[b.domain]);

  return {
    systems,
    watch,
    attentionCount: watch.length,
    gapCount: systems.filter((item) => item.level === "unknown").length,
  };
}
