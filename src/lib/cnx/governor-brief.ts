// Governor brief — the province in four lines, the districts to call, and a
// Thai summary ready to paste into LINE. Pure: it only reshapes feeds the
// board already has, so every number keeps its source and age, and a feed
// that is missing says "no data" instead of reading as calm.

import type { BurnSeasonDoc } from "./burn-season";
import type { DustboyStation } from "./dustboy";

export type BriefLevel = "good" | "watch" | "alert" | "critical" | "unknown";

export interface BriefTile {
  key: "air" | "fire" | "water" | "visitors";
  titleTh: string;
  level: BriefLevel;
  /** One plain-Thai line, then an English gloss. */
  th: string;
  en: string;
  source: string;
  observedAt: string | null;
}

export interface BriefDistrict {
  th: string;
  en: string;
  pm25: number | null;
  sensors: number;
  burnedLastSeasonRai: number | null;
  forestShare: number | null;
}

/** Thai PCD PM2.5 bands (24-h, µg/m³): 0–15 very good, –25 good,
 *  –37.5 moderate, –75 starts to affect health, >75 affects health. */
export function pm25Band(v: number): { level: BriefLevel; th: string } {
  if (v <= 15) return { level: "good", th: "ดีมาก" };
  if (v <= 25) return { level: "good", th: "ดี" };
  if (v <= 37.5) return { level: "watch", th: "ปานกลาง" };
  if (v <= 75) return { level: "alert", th: "เริ่มมีผลกระทบต่อสุขภาพ" };
  return { level: "critical", th: "มีผลกระทบต่อสุขภาพ" };
}

/** DustBoy station names carry the district loosely ("เมือง", a doubled
 *  tone mark in "พร้้าว"); map them onto HII's 25 official names. */
export function canonicalDistrict(raw: string, official: string[]): string | null {
  const clean = (s: string) => s.normalize("NFC").replace(/([่-๋])\1+/g, "$1").replace(/\s+/g, "");
  const r = clean(raw);
  if (!r) return null;
  if (r === "เมือง" || r === "อ.เมือง") return official.find((o) => o === "เมืองเชียงใหม่") ?? null;
  return official.find((o) => clean(o) === r) ?? null;
}

export function districtTable(stations: DustboyStation[], burn: BurnSeasonDoc | null): BriefDistrict[] {
  const official = burn?.districtsLatest ?? [];
  const names = official.map((d) => d.th);
  const readings = new Map<string, number[]>();
  for (const s of stations) {
    if (s.province !== "เชียงใหม่" || s.pm25 === null || s.suspect) continue;
    const d = canonicalDistrict(s.district, names);
    if (d) readings.set(d, [...(readings.get(d) ?? []), s.pm25]);
  }
  const rows: BriefDistrict[] = official.map((d) => {
    const r = readings.get(d.th) ?? [];
    return {
      th: d.th,
      en: d.en,
      pm25: r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 10) / 10 : null,
      sensors: r.length,
      burnedLastSeasonRai: d.totalRai,
      forestShare: d.totalRai > 0 ? Math.round((d.forestRai / d.totalRai) * 100) : null,
    };
  });
  // Worst air first; districts without a sensor sink, ordered by burn history.
  return rows.sort((a, b) => (b.pm25 ?? -1) - (a.pm25 ?? -1) || (b.burnedLastSeasonRai ?? 0) - (a.burnedLastSeasonRai ?? 0));
}

export interface BriefInputs {
  now: Date;
  airGround: { avg: number | null; stations: number; observedAt: string | null; source: string };
  worstDistrict: BriefDistrict | null;
  fires: { live: boolean; count: number | null; observedAt: string | null; source: string };
  river: { th: string; en: string; level: BriefLevel; observedAt: string | null } | null;
  floodForecast: { outlook: "flooding" | "none-forecast" | "unknown"; points: number } | null;
  arrivals: { date: string; flights: number; international: number; estimatedVisitors: number } | null;
}

export function buildTiles(i: BriefInputs): BriefTile[] {
  const air: BriefTile =
    i.airGround.avg === null
      ? { key: "air", titleTh: "คุณภาพอากาศ", level: "unknown", th: "ไม่มีข้อมูลเซนเซอร์ภาคพื้นดินที่เป็นปัจจุบัน", en: "No current ground-sensor reading", source: i.airGround.source, observedAt: null }
      : (() => {
          const band = pm25Band(i.airGround.avg);
          const worst = i.worstDistrict?.pm25 != null ? ` · สูงสุด อ.${i.worstDistrict.th} ${i.worstDistrict.pm25}` : "";
          return {
            key: "air",
            titleTh: "คุณภาพอากาศ",
            level: band.level,
            th: `PM2.5 เฉลี่ย ${i.airGround.avg} มคก./ลบ.ม. (${band.th})${worst}`,
            en: `Ground PM2.5 average ${i.airGround.avg} µg/m³ across ${i.airGround.stations} sensors`,
            source: i.airGround.source,
            observedAt: i.airGround.observedAt,
          };
        })();

  const fire: BriefTile = !i.fires.live
    ? { key: "fire", titleTh: "ไฟป่า/จุดความร้อน", level: "unknown", th: "ไม่มีข้อมูลดาวเทียมรอบล่าสุด", en: "No live satellite pass", source: i.fires.source, observedAt: null }
    : {
        key: "fire",
        titleTh: "ไฟป่า/จุดความร้อน",
        level: (i.fires.count ?? 0) > 30 ? "alert" : (i.fires.count ?? 0) > 0 ? "watch" : "good",
        th: (i.fires.count ?? 0) === 0 ? "ไม่พบจุดความร้อนใน 24 ชม. (เมฆอาจบังได้)" : `พบจุดความร้อน ${i.fires.count} จุดใน 24 ชม.`,
        en: `${i.fires.count ?? 0} VIIRS hotspots in 24 h (cloud can hide fires)`,
        source: i.fires.source,
        observedAt: i.fires.observedAt,
      };

  const forecast =
    i.floodForecast?.outlook === "flooding"
      ? " · Google คาดการณ์น้ำล้นตลิ่ง"
      : i.floodForecast?.outlook === "none-forecast"
        ? " · Google ไม่คาดการณ์น้ำท่วม (ไม่ใช่การยืนยันว่าปลอดภัย)"
        : "";
  const water: BriefTile = i.river
    ? {
        key: "water",
        titleTh: "น้ำ",
        level: i.floodForecast?.outlook === "flooding" && i.river.level === "good" ? "watch" : i.river.level,
        th: `${i.river.th}${forecast}`,
        en: i.river.en,
        source: "ThaiWater (P.1) · Google Flood Hub",
        observedAt: i.river.observedAt,
      }
    : { key: "water", titleTh: "น้ำ", level: "unknown", th: `ไม่มีข้อมูลระดับน้ำที่วัดได้จริง${forecast}`, en: "No measured river level", source: "ThaiWater", observedAt: null };

  const visitors: BriefTile = i.arrivals
    ? {
        key: "visitors",
        titleTh: "นักท่องเที่ยว",
        level: "good",
        th: `เที่ยวบินเข้าเชียงใหม่ ${i.arrivals.flights} เที่ยว (ต่างประเทศ ${i.arrivals.international}) ประมาณ ${i.arrivals.estimatedVisitors.toLocaleString("en-US")} คน — ${thaiDate(i.arrivals.date)}`,
        en: `${i.arrivals.flights} arrivals (${i.arrivals.international} international), ~${i.arrivals.estimatedVisitors} passengers (estimate: seats × load factor)`,
        source: "OpenSky arrivals at VTCC",
        observedAt: null,
      }
    : { key: "visitors", titleTh: "นักท่องเที่ยว", level: "unknown", th: "ไม่มีข้อมูลเที่ยวบินขาเข้า", en: "No arrivals data", source: "OpenSky", observedAt: null };

  return [air, fire, water, visitors];
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** 2026-10-03 → "3 ต.ค. 2569". */
export function thaiDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return `${d} ${TH_MONTHS[m - 1]} ${y + 543}`;
}

const MARK: Record<BriefLevel, string> = { good: "🟢", watch: "🟡", alert: "🟠", critical: "🔴", unknown: "⚪" };

/** Plain text for a LINE group: dated, one line per hazard, top districts,
 *  sources, and the link. No markdown — LINE shows it literally. */
export function lineText(tiles: BriefTile[], districts: BriefDistrict[], now: Date, url: string): string {
  const bkk = new Date(now.getTime() + 7 * 3_600_000);
  const time = `${String(bkk.getUTCHours()).padStart(2, "0")}:${String(bkk.getUTCMinutes()).padStart(2, "0")} น.`;
  const worst = districts.filter((d) => d.pm25 !== null).slice(0, 3);
  return [
    `สรุปสถานการณ์จังหวัดเชียงใหม่ ${thaiDate(bkk.toISOString())} เวลา ${time}`,
    ...tiles.map((t) => `${MARK[t.level]} ${t.titleTh}: ${t.th}`),
    ...(worst.length ? [`อำเภอที่ค่าฝุ่นสูงสุด: ${worst.map((d) => `${d.th} ${d.pm25}`).join(" · ")}`] : []),
    `ที่มา: ${[...new Set(tiles.map((t) => t.source))].join(" · ")}`,
    `ดูต่อ: ${url}`,
  ].join("\n");
}
