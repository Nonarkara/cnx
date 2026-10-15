// The next 48 hours, district by district: where the model expects heavy
// rain or bad air, when it peaks, and which official shelters are in that
// district — so a warning arrives with somewhere to send people.
//
// Rules, all borrowed rather than invented:
//   - Rain levels are the TMD 24-hour classes applied to the forecast
//     24-hour total (heavy ≥ 35.1 mm → watch, very heavy ≥ 90.1 → alert).
//   - PM2.5 levels are the board's own cut points (wind-field-core).
//   - A forecast can raise attention; it never lowers a level a measurement
//     set, and "no forecast warning" is never written as "safe".
//   - Rain already measured in the district is shown beside the forecast as
//     context — it is not added to it to make a new threshold.

import { rainBand, type RainSummary } from "./rain-core";
import { sameAmphoe, sheltersInDistrict, type Shelter } from "./shelters";
import { bilinear, districtOutlook, pm25Level, type DistrictOutlook, type Pm25Level } from "./wind-field-core";
import type { ForecastFieldResponse } from "./wind-field";
import { CNX_DISTRICT_POINTS } from "./wind-field-points";
import type { WatchItem } from "./watch-list";

export type OutlookLevel = "watch" | "alert" | "critical";

export interface RainOutlook {
  district: DistrictOutlook;
  level: OutlookLevel;
  /** Heaviest gauge reading in the district over the past 24 h, if any. */
  measured24h: number | null;
  shelters: Shelter[];
  shelterCapacity: number;
  point: { lat: number; lon: number };
}

export interface AirOutlook {
  district: DistrictOutlook;
  level: OutlookLevel;
  peak: number;
  peakAt: number;
  point: { lat: number; lon: number };
}

export interface ProvinceOutlook {
  available: boolean;
  fetchedAt: string | null;
  rain: RainOutlook[];
  air: AirOutlook[];
  /** Wettest district even when nothing reaches a warning (for the calm line). */
  wettest: DistrictOutlook | null;
  dirtiest: DistrictOutlook | null;
  hasPm25: boolean;
}

const RAIN_LEVEL: Partial<Record<ReturnType<typeof rainBand>, OutlookLevel>> = { heavy: "watch", "very-heavy": "alert" };
const AIR_LEVEL: Record<Pm25Level, OutlookLevel | null> = { good: null, watch: "watch", alert: "alert", critical: "critical" };
const RANK: Record<OutlookLevel, number> = { watch: 1, alert: 2, critical: 3 };

const timeFmt = new Intl.DateTimeFormat("th-TH", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
export function outlookTime(unixSec: number | null): string {
  return unixSec === null ? "—" : `${timeFmt.format(new Date(unixSec * 1000))} น.`;
}

function pointOf(nameTh: string): { lat: number; lon: number } {
  const p = CNX_DISTRICT_POINTS.find((d) => d.nameTh === nameTh);
  return p ? { lat: p.lat, lon: p.lon } : { lat: 18.788, lon: 98.985 };
}

/** Re-age retained client data and recompute peaks from future frames only. */
export function currentForecast(forecast: ForecastFieldResponse | null, nowMs: number): ForecastFieldResponse | null {
  if (!forecast) return null;
  const field = forecast.field;
  const fetched = Date.parse(forecast.fetchedAt ?? "");
  const future = field?.times.map((t, i) => ({ t, i })).filter(({ t }) => t > nowMs / 1000) ?? [];
  const invalid = forecast.provenance !== "model" || !field || !Number.isFinite(fetched)
    || fetched > nowMs + 5 * 60_000 || nowMs - fetched > 6 * 3_600_000 || future.length === 0;
  // A missing rain cell is not a dry forecast. Keep the province summary
  // unknown if its remaining first-day evidence is incomplete.
  const firstDay = future.filter(({ t }) => t <= nowMs / 1000 + 24 * 3600);
  const incomplete = !invalid && (firstDay.length < 24 || firstDay.some(({ t }, i) =>
    t - (i ? firstDay[i - 1].t : nowMs / 1000) > 3600)
    || CNX_DISTRICT_POINTS.some((p) => firstDay
    .some(({ i }) => bilinear(field!.grid, field!.precip[i] ?? [], p.lon, p.lat) === null)));
  if (invalid || incomplete) return { ...forecast, field: null, outlook: [], provenance: "unavailable", note: "Forecast evidence expired or incomplete; a current outlook cannot be confirmed." };
  const pmComplete = field!.pm25 !== null && CNX_DISTRICT_POINTS.every(p => future.every(({ i }) =>
    bilinear(field!.grid, field!.pm25![i] ?? [], p.lon, p.lat) !== null));
  const usableField = pmComplete ? field! : { ...field!, pm25: null };
  return { ...forecast, field: usableField, outlook: districtOutlook(usableField, CNX_DISTRICT_POINTS, nowMs / 1000) };
}

export function buildOutlook(forecast: ForecastFieldResponse | null, shelters: readonly Shelter[], rain: RainSummary | null): ProvinceOutlook {
  if (!forecast?.field || forecast.outlook.length === 0) {
    return { available: false, fetchedAt: forecast?.fetchedAt ?? null, rain: [], air: [], wettest: null, dirtiest: null, hasPm25: false };
  }
  const measured = (nameTh: string) => rain?.districts.find((d) => sameAmphoe(d.th, nameTh))?.max ?? null;
  const rainItems: RainOutlook[] = forecast.outlook
    .flatMap((d) => {
      const level = RAIN_LEVEL[rainBand(d.rain24h)];
      if (!level) return [];
      const list = sheltersInDistrict(shelters, d.nameTh);
      return [{
        district: d,
        level,
        measured24h: measured(d.nameTh),
        shelters: list,
        shelterCapacity: list.reduce((sum, s) => sum + (s.capacity ?? 0), 0),
        point: pointOf(d.nameTh),
      }];
    })
    .sort((a, b) => RANK[b.level] - RANK[a.level] || b.district.rain24h - a.district.rain24h);
  const airItems: AirOutlook[] = forecast.outlook
    .flatMap((d) => {
      if (d.pm25Peak === null || d.pm25PeakAt === null) return [];
      const level = AIR_LEVEL[pm25Level(d.pm25Peak)];
      return level ? [{ district: d, level, peak: d.pm25Peak, peakAt: d.pm25PeakAt, point: pointOf(d.nameTh) }] : [];
    })
    .sort((a, b) => b.peak - a.peak);
  const byRain = [...forecast.outlook].sort((a, b) => b.rain24h - a.rain24h);
  const byPm = forecast.outlook.filter((d) => d.pm25Peak !== null).sort((a, b) => (b.pm25Peak ?? 0) - (a.pm25Peak ?? 0));
  return {
    available: true,
    fetchedAt: forecast.fetchedAt,
    rain: rainItems,
    air: airItems,
    wettest: byRain[0] ?? null,
    dirtiest: byPm[0] ?? null,
    hasPm25: forecast.field.pm25 !== null && forecast.outlook.some(d => d.pm25Peak !== null),
  };
}

/** One sentence of action for a rain outlook row — names a real shelter. */
export function rainActionTh(r: RainOutlook): string {
  const when = outlookTime(r.district.peakRainAt);
  const top = r.shelters[0];
  const shelterLine = top
    ? `ศูนย์พักพิงในรายชื่อ: ${top.nameTh}${top.capacity ? ` (${top.capacity.toLocaleString("th-TH")} คน)` : ""}${r.shelters.length > 1 ? ` และอีก ${r.shelters.length - 1} แห่ง รวม ~${r.shelterCapacity.toLocaleString("th-TH")} คน` : ""}`
    : "ไม่มีศูนย์พักพิงในรายชื่อทางการของอำเภอนี้ — ประสานอำเภอเพื่อยืนยันศูนย์ที่เปิดและเข้าถึงได้";
  return r.level === "alert"
    ? `เตรียมเปิดศูนย์พักพิงและแจ้งพื้นที่ลาดชัน/ริมห้วยใน อ.${r.district.nameTh} ให้พร้อมอพยพก่อน ${when} · ${shelterLine} · ยืนยันการเปิดใช้งาน เส้นทางเข้า และที่ว่างกับอำเภอก่อนส่งคน`
    : `แจ้งผู้นำชุมชน อ.${r.district.nameTh} เฝ้าระวังน้ำป่า/ดินถล่มช่วง ${when} · ${shelterLine} · ยืนยันการเปิดใช้งาน เส้นทางเข้า และที่ว่างกับอำเภอก่อนส่งคน`;
}

const timeFmtEn = new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
export function outlookTimeEn(unixSec: number | null): string {
  return unixSec === null ? "—" : timeFmtEn.format(new Date(unixSec * 1000));
}

export function rainActionEn(r: RainOutlook): string {
  const when = outlookTimeEn(r.district.peakRainAt);
  const top = r.shelters[0];
  const shelterLine = top
    ? `Listed shelter: ${top.nameTh}${top.capacity ? ` (${top.capacity.toLocaleString("en-US")} people)` : ""}${r.shelters.length > 1 ? ` and ${r.shelters.length - 1} more, ~${r.shelterCapacity.toLocaleString("en-US")} people in all` : ""}`
    : "No shelter on the official list for this district — ask district staff to confirm an open, accessible centre";
  return r.level === "alert"
    ? `Prepare to open shelters and ready slope and stream-side areas of ${r.district.nameEn} to evacuate before ${when} · ${shelterLine} · Confirm opening, access and available capacity with district staff before directing people there`
    : `Tell community leaders in ${r.district.nameEn} to watch for flash floods and landslides around ${when} · ${shelterLine} · Confirm opening, access and available capacity with district staff before directing people there`;
}

export function airActionEn(a: AirOutlook): string {
  return `Advise at-risk groups (children, older people, heart and lung patients) in ${a.district.nameEn} to limit outdoor activity around ${outlookTimeEn(a.peakAt)}, and prepare clean-air rooms`;
}

export function airActionTh(a: AirOutlook): string {
  return `แจ้งกลุ่มเสี่ยง (เด็ก ผู้สูงอายุ ผู้ป่วยโรคหัวใจ/ทางเดินหายใจ) ใน อ.${a.district.nameTh} ลดกิจกรรมกลางแจ้งช่วง ${outlookTime(a.peakAt)} และเตรียมห้องปลอดฝุ่น`;
}

const MODEL_SOURCE = "Open-Meteo (โมเดลพยากรณ์) · PM2.5: CAMS";

/** Two inventory rows for the watch board: forecast rain and forecast PM2.5. */
export function outlookWatchItems(o: ProvinceOutlook): WatchItem[] {
  const top = o.rain[0];
  const rainItem: WatchItem = !o.available
    ? {
        id: "forecast-rain", domain: "water", kind: "model", systemTh: "ฝนพยากรณ์ 24 ชม. · รายอำเภอ", systemEn: "Forecast rain, 24 h, by district",
        source: MODEL_SOURCE, level: "unknown", valueTh: "ไม่มีข้อมูลพยากรณ์", valueEn: "No forecast", evidenceTh: "แบบจำลองไม่ตอบ — ไม่ใช่การพยากรณ์ว่าฝนไม่ตก", evidenceEn: "The model did not answer — not a dry forecast.",
        actionTh: null, actionEn: null, observedAt: null, openMetric: null,
      }
    : top
      ? {
          id: "forecast-rain", domain: "water", kind: "model", systemTh: "ฝนพยากรณ์ 24 ชม. · รายอำเภอ", systemEn: "Forecast rain, 24 h, by district",
          source: MODEL_SOURCE, level: top.level,
          valueTh: `${o.rain.slice(0, 3).map((r) => `${r.district.nameTh} ${r.district.rain24h.toFixed(0)} มม.`).join(" · ")}${o.rain.length > 3 ? ` +${o.rain.length - 3} อำเภอ` : ""}`,
          valueEn: o.rain.slice(0, 3).map((r) => `${r.district.nameEn} ${r.district.rain24h.toFixed(0)} mm`).join(" · "),
          evidenceTh: "ยอดฝนพยากรณ์ 24 ชม. ข้างหน้าที่จุดกลางอำเภอ (กริด ~30 กม.) เกณฑ์ฝนหนักของกรมอุตุฯ — พายุเฉพาะหุบเขาอาจแรงกว่านี้",
          evidenceEn: "Forecast 24 h totals at district points (~30 km grid), TMD heavy-rain classes; a valley storm can exceed this.",
          actionTh: rainActionTh(top), actionEn: rainActionEn(top), observedAt: o.fetchedAt, openMetric: "water",
        }
      : {
          id: "forecast-rain", domain: "water", kind: "model", systemTh: "ฝนพยากรณ์ 24 ชม. · รายอำเภอ", systemEn: "Forecast rain, 24 h, by district",
          source: MODEL_SOURCE, level: "good",
          valueTh: `ไม่มีอำเภอที่คาดฝนหนัก ≥35 มม.${o.wettest ? ` (มากสุด ${o.wettest.nameTh} ${o.wettest.rain24h.toFixed(0)} มม.)` : ""}`,
          valueEn: `No district forecast ≥35 mm${o.wettest ? ` (most: ${o.wettest.nameEn} ${o.wettest.rain24h.toFixed(0)} mm)` : ""}`,
          evidenceTh: "แบบจำลองไม่คาดฝนหนักระดับอำเภอ — ไม่ใช่การยืนยันว่าไม่มีพายุเฉพาะจุด", evidenceEn: "No district-scale heavy rain forecast — not a guarantee against a local storm.",
          actionTh: null, actionEn: null, observedAt: o.fetchedAt, openMetric: null,
        };
  const air = o.air[0];
  const airItem: WatchItem = !o.available || !o.hasPm25
    ? {
        id: "forecast-pm25", domain: "air", kind: "model", systemTh: "PM2.5 พยากรณ์ 48 ชม. · CAMS", systemEn: "Forecast PM2.5, 48 h · CAMS",
        source: MODEL_SOURCE, level: "unknown", valueTh: "ไม่มีข้อมูลพยากรณ์ฝุ่น", valueEn: "No PM2.5 forecast", evidenceTh: "แบบจำลอง CAMS ไม่ตอบ — ไม่ใช่การพยากรณ์ว่าอากาศดี", evidenceEn: "CAMS did not answer — not a clean-air forecast.",
        actionTh: null, actionEn: null, observedAt: null, openMetric: null,
      }
    : air
      ? {
          id: "forecast-pm25", domain: "air", kind: "model", systemTh: "PM2.5 พยากรณ์ 48 ชม. · CAMS", systemEn: "Forecast PM2.5, 48 h · CAMS",
          source: MODEL_SOURCE, level: air.level,
          valueTh: `สูงสุด ${air.peak} µg/m³ ที่ ${air.district.nameTh} ${outlookTime(air.peakAt)}${o.air.length > 1 ? ` · ${o.air.length} อำเภอเกินเกณฑ์` : ""}`,
          valueEn: `Peak ${air.peak} µg/m³ at ${air.district.nameEn}`,
          evidenceTh: "ค่าจากแบบจำลอง CAMS (~40 กม.) มักต่ำกว่าค่าวัดจริงในหุบเขาช่วงเผา — ใช้ดูแนวโน้มและเวลา ไม่ใช่ค่าที่วัดได้",
          evidenceEn: "CAMS model (~40 km) often under-reads valley smoke in burning season — a trend and timing, not a measurement.",
          actionTh: airActionTh(air), actionEn: airActionEn(air), observedAt: o.fetchedAt, openMetric: "air",
        }
      : {
          id: "forecast-pm25", domain: "air", kind: "model", systemTh: "PM2.5 พยากรณ์ 48 ชม. · CAMS", systemEn: "Forecast PM2.5, 48 h · CAMS",
          source: MODEL_SOURCE, level: "good",
          valueTh: `ไม่คาดว่าเกิน 25 µg/m³${o.dirtiest?.pm25Peak !== null && o.dirtiest ? ` (สูงสุด ${o.dirtiest.nameTh} ${o.dirtiest.pm25Peak})` : ""}`,
          valueEn: "No district forecast above 25 µg/m³",
          evidenceTh: "แบบจำลองมักประเมินควันในหุบเขาต่ำไป — ดูค่าวัดจาก DustBoy/PCD ประกอบเสมอ", evidenceEn: "The model tends to under-read valley smoke — always read with DustBoy/PCD measurements.",
          actionTh: null, actionEn: null, observedAt: o.fetchedAt, openMetric: null,
        };
  return [rainItem, airItem];
}
