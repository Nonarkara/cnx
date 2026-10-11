// The board's own active warnings, in one shape, for the CAP export
// (cap.ts) and the warning log (warning-log-core.ts).
//
// Sources, nothing else:
//   - the 48-hour outlook (outlook.ts): forecast rain ≥ TMD heavy, forecast
//     PM2.5 ≥ the board's watch cut point — model, so "Expected/Possible";
//   - the province verdict (verdict.ts) when it is prepare or danger —
//     built from measurements, so "Immediate/Observed".
// Pure: no fetch, no clock (the caller passes `nowMs`).

import { airActionEn, airActionTh, rainActionEn, rainActionTh, type OutlookLevel, type ProvinceOutlook } from "./outlook";
import { ACTIONS_TH_EN, type VerdictCard, type VerdictLevel, type VerdictReason } from "./verdict";

export type WarningDomain = "rain" | "pm25" | "verdict";
export type WarningLevel = OutlookLevel;
export type CapCategory = "Met" | "Env" | "Fire";

export interface BoardWarning {
  /** `cnx-{domain}-{district}` — stable across levels; the CAP identifier adds a hash. */
  key: string;
  domain: WarningDomain;
  district: string;
  level: WarningLevel;
  /** The board's own word for the level (verdict: prepare/danger). */
  boardLevel: string;
  basis: "forecast" | "measured";
  category: CapCategory;
  areaTh: string;
  areaEn: string;
  /** District reference point; null for the province-wide verdict. */
  point: { lat: number; lon: number } | null;
  /** Forecast peak (ISO), or null when the warning is a measurement. */
  peakAt: string | null;
  /** How long the warning stands from the current hour. */
  windowHours: number;
  value: number;
  unit: "mm" | "ug/m3" | "score";
  provenance: string;
  eventTh: string;
  eventEn: string;
  headlineTh: string;
  headlineEn: string;
  descriptionTh: string;
  descriptionEn: string;
  instructionTh: string;
  instructionEn: string;
  /** One line for the warning log. */
  reasonEn: string;
}

export const PROVINCE_DISTRICT = "province";
export const VERDICT_KEY = `cnx-verdict-${PROVINCE_DISTRICT}`;
const RAIN_WINDOW_H = 24;
const PM25_WINDOW_H = 48;
/** A measured verdict stands until the duty officer's next 3-hourly look. */
const VERDICT_WINDOW_H = 3;

/** Outlook level → the verdict level whose general action applies. */
const ACTION_FOR: Record<WarningLevel, VerdictLevel> = { watch: "watch", alert: "prepare", critical: "danger" };
const VERDICT_TO_LEVEL: Partial<Record<VerdictLevel, WarningLevel>> = { prepare: "alert", danger: "critical" };
const VERDICT_TH: Record<VerdictLevel, string> = { safe: "ปกติ", watch: "เฝ้าระวัง", prepare: "เตรียมพร้อม", danger: "อันตราย" };
const REASON_CATEGORY: Record<VerdictReason["domain"], CapCategory> = { flood: "Met", twins: "Met", air: "Env", haze: "Env", fire: "Fire" };

export function districtSlug(nameEn: string): string {
  return nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const iso = (unixSec: number | null): string | null => (unixSec === null ? null : new Date(unixSec * 1000).toISOString());
const oneDp = (n: number) => Math.round(n * 10) / 10;

function rainWarnings(o: ProvinceOutlook): BoardWarning[] {
  return o.rain.map((r) => {
    const d = r.district;
    const veryHeavy = r.level === "alert";
    const mm = oneDp(d.rain24h);
    const measuredTh = r.measured24h !== null ? ` ฝนที่วัดได้แล้วในอำเภอ 24 ชม.: ${oneDp(r.measured24h)} มม. (แสดงประกอบ ไม่ได้บวกรวม)` : "";
    const measuredEn = r.measured24h !== null ? ` Rain already measured in the district, 24 h: ${oneDp(r.measured24h)} mm (context, not added).` : "";
    const general = ACTIONS_TH_EN[ACTION_FOR[r.level]];
    return {
      key: `cnx-rain-${districtSlug(d.nameEn)}`,
      domain: "rain",
      district: districtSlug(d.nameEn),
      level: r.level,
      boardLevel: r.level,
      basis: "forecast",
      category: "Met",
      areaTh: `อำเภอ${d.nameTh} จังหวัดเชียงใหม่`,
      areaEn: `${d.nameEn} District, Chiang Mai`,
      point: r.point,
      peakAt: iso(d.peakRainAt),
      windowHours: RAIN_WINDOW_H,
      value: mm,
      unit: "mm",
      provenance: "model",
      eventTh: veryHeavy ? "ฝนตกหนักมาก (พยากรณ์)" : "ฝนตกหนัก (พยากรณ์)",
      eventEn: veryHeavy ? "Forecast very heavy rain" : "Forecast heavy rain",
      headlineTh: `${veryHeavy ? "คาดฝนหนักมาก" : "คาดฝนหนัก"} อ.${d.nameTh} ${mm} มม. ใน 24 ชม.`,
      headlineEn: `${veryHeavy ? "Very heavy" : "Heavy"} rain forecast for ${d.nameEn}: ${mm} mm in 24 h`,
      descriptionTh: `ยอดฝนพยากรณ์ 24 ชม. ข้างหน้าที่จุดกลางอำเภอ ${mm} มม. (เกณฑ์กรมอุตุฯ: หนัก ≥35.1 หนักมาก ≥90.1) แบบจำลอง Open-Meteo กริด ~30 กม. — พายุเฉพาะหุบเขาอาจแรงกว่านี้${measuredTh}`,
      descriptionEn: `Forecast 24 h total at the district point: ${mm} mm (TMD classes: heavy ≥35.1, very heavy ≥90.1). Open-Meteo model, ~30 km grid — a valley storm can exceed this.${measuredEn}`,
      instructionTh: `${rainActionTh(r)}\n${general.th}`,
      instructionEn: `${rainActionEn(r)}\n${general.en}`,
      reasonEn: `Forecast 24 h rain ${mm} mm at the ${d.nameEn} district point`,
    };
  });
}

function airWarnings(o: ProvinceOutlook): BoardWarning[] {
  return o.air.map((a) => {
    const d = a.district;
    const peak = Math.round(a.peak);
    const general = ACTIONS_TH_EN[ACTION_FOR[a.level]];
    return {
      key: `cnx-pm25-${districtSlug(d.nameEn)}`,
      domain: "pm25",
      district: districtSlug(d.nameEn),
      level: a.level,
      boardLevel: a.level,
      basis: "forecast",
      category: "Env",
      areaTh: `อำเภอ${d.nameTh} จังหวัดเชียงใหม่`,
      areaEn: `${d.nameEn} District, Chiang Mai`,
      point: a.point,
      peakAt: iso(a.peakAt),
      windowHours: PM25_WINDOW_H,
      value: peak,
      unit: "ug/m3",
      provenance: "model",
      eventTh: "ฝุ่น PM2.5 สูง (พยากรณ์)",
      eventEn: "Forecast high PM2.5",
      headlineTh: `คาด PM2.5 สูงสุด ${peak} µg/m³ ที่ อ.${d.nameTh} ใน 48 ชม.`,
      headlineEn: `PM2.5 forecast to peak at ${peak} µg/m³ in ${d.nameEn} within 48 h`,
      descriptionTh: `ค่าสูงสุดจากแบบจำลอง CAMS (~40 กม.) ใน 48 ชม. ข้างหน้า เกณฑ์ของบอร์ด: เฝ้าระวัง ≥25 เตือน ≥50 วิกฤต ≥90 µg/m³ — แบบจำลองมักต่ำกว่าค่าวัดจริงในหุบเขาช่วงเผา ดูค่าวัด DustBoy/PCD ประกอบ`,
      descriptionEn: `48 h peak from the CAMS model (~40 km). Board cut points: watch ≥25, alert ≥50, critical ≥90 µg/m³. The model often under-reads valley smoke — read with DustBoy/PCD measurements.`,
      instructionTh: `${airActionTh(a)}\n${general.th}`,
      instructionEn: `${airActionEn(a)}\n${general.en}`,
      reasonEn: `Forecast PM2.5 peak ${peak} µg/m³ at the ${d.nameEn} district point`,
    };
  });
}

/** First reason that is an observation, not a caveat about missing data. */
export function leadReason(v: VerdictCard): VerdictReason | null {
  return v.reasons.find((r) => !r.isCaveat) ?? v.reasons[0] ?? null;
}

function verdictWarning(v: VerdictCard | null): BoardWarning[] {
  const level = v ? VERDICT_TO_LEVEL[v.level] : undefined;
  // A scenario-only verdict is not a measurement and is never exported.
  if (!v || !level || v.data_provenance === "scenario") return [];
  const reasons = v.reasons.filter((r) => !r.isCaveat).slice(0, 3);
  const lead = leadReason(v);
  return [{
    key: VERDICT_KEY,
    domain: "verdict",
    district: PROVINCE_DISTRICT,
    level,
    boardLevel: v.level,
    basis: "measured",
    category: lead ? REASON_CATEGORY[lead.domain] : "Met",
    areaTh: "จังหวัดเชียงใหม่",
    areaEn: "Chiang Mai Province",
    point: null,
    peakAt: null,
    windowHours: VERDICT_WINDOW_H,
    value: v.score,
    unit: "score",
    provenance: v.data_provenance,
    eventTh: `ระดับจังหวัด: ${VERDICT_TH[v.level]}`,
    eventEn: `Province level: ${v.level}`,
    headlineTh: v.head_th,
    headlineEn: v.head_en,
    descriptionTh: `คะแนนรวม ${v.score}/100 · ${reasons.map((r) => r.th).join(" · ") || "ไม่มีเหตุผลประกอบ"}`,
    descriptionEn: `Composite score ${v.score}/100 · ${reasons.map((r) => r.en).join(" · ") || "no reasons given"}`,
    instructionTh: ACTIONS_TH_EN[v.level].th,
    instructionEn: ACTIONS_TH_EN[v.level].en,
    reasonEn: lead?.en ?? `Province verdict ${v.level}`,
  }];
}

/** Every active board warning: outlook items ≥ watch, then the verdict if ≥ prepare. */
export function boardWarnings(outlook: ProvinceOutlook, verdict: VerdictCard | null): BoardWarning[] {
  return [...verdictWarning(verdict), ...rainWarnings(outlook), ...airWarnings(outlook)];
}
