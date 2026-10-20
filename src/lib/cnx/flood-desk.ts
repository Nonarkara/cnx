// The flood desk's answer, as pure functions over the five live parts.
//
// Each part keeps its own provenance and age; nothing is merged into one
// "flood" number. The rules, all from the honesty doctrine:
//   - A part that failed to load, or answered "unavailable", is shown as
//     unavailable with its reason — never as calm, never omitted.
//   - "No warning" lines are phrased as "not a guarantee", and the panel
//     never paints them green.
//   - The headline names the worst measured or forecast signal; if there
//     is none and any part is missing, it says the answer is incomplete.

import type { SeverityLevel } from "../../types/cnx";
import type { RiverGauge, RiverLevelResponse } from "./river-level";
import type { RainResponse } from "./rain";
import type { DamResponse } from "./dam";
import type { DamStation } from "./dam-core";
import { summariseFloodHub, type FloodHubResponse, type FloodHubSeverity } from "./floodhub";
import type { ProvinceOutlook } from "./outlook";
import { currentRainSummary } from "./rain-core";
import { damAgeDays, summariseDams, DAM_RELAY_MAX_AGE_MS, DAM_BAND_EN, DAM_BAND_TH } from "./dam-core";
import { outlookTime, outlookTimeEn } from "./outlook";
import { isCurrentGaugeReading } from "./verdict";

/** One fetched part: still loading, the request failed, or an answer (which may itself say "unavailable"). */
export type Feed<T> = { status: "loading" } | { status: "failed" } | { status: "ok"; data: T };

export type DeskKey = "river" | "dams" | "rain" | "forecast" | "floodhub";

export interface DeskLine {
  key: DeskKey;
  status: "ok" | "loading" | "unavailable";
  /** "unknown" whenever status is not "ok". */
  level: SeverityLevel;
  kind: "measured" | "report" | "model";
  titleTh: string;
  titleEn: string;
  th: string;
  en: string;
  sourceTh: string;
  sourceEn: string;
  /** What to age: an instant ("time") or a report day ("day", YYYY-MM-DD). */
  observedAt: string | null;
  ageMode: "time" | "day";
  staleAfterMs: number;
  /** A known subset may warn, but cannot clear unassessed current observations. */
  coverageIncomplete?: boolean;
}

export interface DeskAnswer {
  level: SeverityLevel;
  th: string;
  en: string;
  lines: DeskLine[];
  missing: number;
}

const HOUR = 3_600_000;
const RANK: Record<SeverityLevel, number> = { good: 0, unknown: 1, watch: 2, alert: 3, critical: 4 };
export const worst = (levels: SeverityLevel[]): SeverityLevel =>
  levels.reduce<SeverityLevel>((w, l) => (RANK[l] > RANK[w] ? l : w), "good");

const fmt = (n: number, digits = 1) => (Math.round(n * 10 ** digits) / 10 ** digits).toString();

type Meta = Pick<DeskLine, "key" | "kind" | "titleTh" | "titleEn" | "sourceTh" | "sourceEn" | "ageMode" | "staleAfterMs">;

function loading(meta: Meta): DeskLine {
  return { ...meta, status: "loading", level: "unknown", th: "กำลังอ่านข้อมูล…", en: "Loading…", observedAt: null };
}

function unavailable(meta: Meta, th: string, en: string): DeskLine {
  return { ...meta, status: "unavailable", level: "unknown", th, en, observedAt: null };
}

const FAILED_TH = "เชื่อมต่อไม่สำเร็จ — ไม่ใช่หลักฐานว่าปกติ";
const FAILED_EN = "Request failed — this is not evidence that conditions are normal.";

// ─── Rivers (measured) ───────────────────────────────────────────

const RIVER: Meta = {
  key: "river", kind: "measured", titleTh: "แม่น้ำ", titleEn: "Rivers",
  sourceTh: "ThaiWater สถานีวัดระดับน้ำ", sourceEn: "ThaiWater river gauges", ageMode: "time", staleAfterMs: 3 * HOUR,
};

const RIVER_RANK: Record<RiverGauge["severity"], number> = { good: 0, watch: 1, alert: 2, critical: 3 };

export function gradable(g: RiverGauge): boolean {
  return g.belowBankM !== null || g.headroomM !== null;
}

/** Closest to trouble first: severity, then metres below bank, then headroom to the critical level. */
export function tightestFirst(a: RiverGauge, b: RiverGauge): number {
  return (
    RIVER_RANK[b.severity] - RIVER_RANK[a.severity] ||
    (a.belowBankM ?? Number.POSITIVE_INFINITY) - (b.belowBankM ?? Number.POSITIVE_INFINITY) ||
    (a.headroomM ?? Number.POSITIVE_INFINITY) - (b.headroomM ?? Number.POSITIVE_INFINITY)
  );
}

export function bankPhrase(g: RiverGauge): { th: string; en: string } {
  if (g.headroomM !== null && g.headroomM <= 0) return { th: `เกินระดับวิกฤตที่ประกาศ ${fmt(-g.headroomM, 2)} ม.`, en: `${fmt(-g.headroomM, 2)} m above the published critical level` };
  if (g.belowBankM !== null) {
    if (g.belowBankM > 0) return { th: `ต่ำกว่าตลิ่ง ${fmt(g.belowBankM, 2)} ม.`, en: `${fmt(g.belowBankM, 2)} m below bank` };
    if (g.belowBankM === 0) return { th: "ถึงระดับตลิ่ง", en: "at bank level" };
    return { th: `สูงกว่าตลิ่ง ${fmt(-g.belowBankM, 2)} ม.`, en: `${fmt(-g.belowBankM, 2)} m above bank` };
  }
  if (g.headroomM !== null) return { th: `ห่างระดับวิกฤต ${fmt(g.headroomM, 2)} ม.`, en: `${fmt(g.headroomM, 2)} m below the critical level` };
  return { th: "ไม่มีข้อมูลตลิ่ง", en: "no bank data" };
}

export function gaugeName(g: RiverGauge): { th: string; en: string } {
  const code = g.code ? ` (${g.code})` : "";
  return { th: `${g.nameTh}${code}`, en: `${g.nameEn ?? g.nameTh}${code}` };
}

export function riverLine(feed: Feed<RiverLevelResponse>, nowMs: number): DeskLine {
  if (feed.status === "loading") return loading(RIVER);
  if (feed.status === "failed") return unavailable(RIVER, `อ่านระดับน้ำไม่ได้ · ${FAILED_TH}`, `River levels could not be read. ${FAILED_EN}`);
  const d = feed.data;
  if (d.provenance !== "live") {
    return unavailable(RIVER, "แหล่งข้อมูลระดับน้ำไม่ตอบ — ไม่ใช่หลักฐานว่าน้ำปกติ", `River-level feed unavailable: ${d.unavailableReason ?? "no reason given"}. Not evidence the river is normal.`);
  }
  const current = d.gauges.filter((g) => isCurrentGaugeReading(g.observedAt, nowMs));
  if (current.length === 0) return unavailable(RIVER, "ไม่มีค่าระดับน้ำภายใน 3 ชม. — สภาพน้ำปัจจุบันยังไม่ทราบ", "No gauge reading from the last 3 hours — current river conditions are unknown.");
  const graded = current.filter(gradable).sort(tightestFirst);
  const ungraded = current.length - graded.length;
  const coverageTh = `${graded.length}/${current.length} สถานีปัจจุบันมีเกณฑ์อ้างอิง${ungraded ? ` · อีก ${ungraded} สถานีไม่มีเกณฑ์ จึงประเมินไม่ได้` : ""}`;
  const coverageEn = `${graded.length}/${current.length} current gauges have thresholds${ungraded ? `; ${ungraded} without thresholds cannot be assessed` : ""}`;
  if (graded.length === 0) {
    return { ...RIVER, status: "ok", level: "unknown", coverageIncomplete: true, th: `${coverageTh} — ประเมินไม่ได้`, en: `${coverageEn} — cannot be graded.`, observedAt: current[0].observedAt };
  }
  const top = graded[0];
  const near = graded.filter((g) => g.severity === "alert" || g.severity === "critical");
  const name = gaugeName(top);
  const bank = bankPhrase(top);
  return {
    ...RIVER,
    status: "ok",
    level: top.severity,
    coverageIncomplete: ungraded > 0,
    th: (near.length
      ? `${near.length} สถานีถึงระดับเตือนสูงหรือวิกฤต — ${name.th} ${bank.th}`
      : `สถานีที่ประเมินได้ไม่ถึงระดับเตือนสูง · ใกล้เกณฑ์ที่สุด ${name.th} ${bank.th}`) + ` · ${coverageTh}`,
    en: (near.length
      ? `${near.length} gauge${near.length > 1 ? "s" : ""} at alert or critical level — ${name.en} ${bank.en}`
      : `No graded gauge reaches alert level · closest: ${name.en}, ${bank.en}`) + ` · ${coverageEn}`,
    observedAt: top.observedAt,
  };
}

// ─── Reservoirs (daily report) ───────────────────────────────────

const DAMS: Meta = {
  key: "dams", kind: "report", titleTh: "เขื่อนและอ่างเก็บน้ำ", titleEn: "Dams and reservoirs",
  sourceTh: "ThaiWater · รายงานประจำวันกรมชลประทาน", sourceEn: "ThaiWater · RID daily report", ageMode: "day", staleAfterMs: 2 * 24 * HOUR,
};

const pct = (s: DamStation) => (s.pctNormal === null ? "—" : `${fmt(s.pctNormal, 0)}%`);

export function damLine(feed: Feed<DamResponse>, nowMs = Date.now()): DeskLine {
  if (feed.status === "loading") return loading(DAMS);
  if (feed.status === "failed") return unavailable(DAMS, `อ่านข้อมูลเขื่อนไม่ได้ · ${FAILED_TH}`, `Reservoir data could not be read. ${FAILED_EN}`);
  const cached = feed.data;
  if (cached.provenance !== "live") {
    return unavailable(DAMS, "ไม่มีรายงานเขื่อนล่าสุด — ปริมาณน้ำในอ่างยังไม่ทราบ ไม่ใช่ว่าปกติ", cached.unavailableReason ?? "Reservoir report unavailable — storage is unknown, not normal.");
  }
  const age = nowMs - Date.parse(cached.collectedAt ?? cached.generatedAt);
  if (!Number.isFinite(age) || age < -5 * 60_000 || age > DAM_RELAY_MAX_AGE_MS) {
    return unavailable(DAMS, "การเก็บข้อมูลเขื่อนเก่าหรือยืนยันเวลาไม่ได้ — ปริมาณน้ำปัจจุบันยังไม่ทราบ", "Reservoir collection is stale or its time cannot be verified — current storage is unknown.");
  }
  // Re-grade the retained rows with today's Bangkok report-day cutoff;
  // a fresh neighbour must not keep an expired overflowing dam alive.
  const d = summariseDams([...cached.large, ...cached.medium], nowMs);
  if (d.large.length + d.medium.length === 0) {
    return unavailable(DAMS, "ไม่มีรายงานเขื่อนที่ยังอยู่ในช่วงอายุที่กำหนด — ปริมาณน้ำปัจจุบันยังไม่ทราบ", "No reservoir report remains within its report-day allowance — current storage is unknown.");
  }
  // Large dams set the level; a full medium reservoir raises attention to watch at most.
  const mediumFull = d.medium.filter((m) => m.band === "over" || m.band === "near-full");
  const level = worst([...d.large.map((s) => s.severity), mediumFull.length ? "watch" : "good"]);
  const largeFull = d.large.filter((s) => s.band === "over" || s.band === "near-full");
  const spill = d.spilling[0];
  const spillTh = spill ? ` · ${spill.nameTh} ระบายผ่านทางน้ำล้น` : "";
  const spillEn = spill ? ` · ${spill.nameEn || spill.nameTh} spilling` : "";
  const mediumTh = mediumFull.length ? ` · อ่างขนาดกลางใกล้/เกินระดับเก็บกัก ${mediumFull.length} แห่ง` : "";
  const mediumEn = mediumFull.length ? ` · ${mediumFull.length} medium reservoir${mediumFull.length > 1 ? "s" : ""} near or above normal storage` : "";
  const top = largeFull[0] ?? d.large[0];
  const base = top
    ? largeFull.length
      ? { th: `${top.nameTh} ${pct(top)} ของระดับเก็บกักปกติ (${DAM_BAND_TH[top.band]})`, en: `${top.nameEn || top.nameTh} at ${pct(top)} of normal storage (${DAM_BAND_EN[top.band].toLowerCase()})` }
      : { th: `เขื่อนหลักไม่มีแห่งใดเกิน 90% · มากสุด ${top.nameTh} ${pct(top)}`, en: `No large dam above 90% · fullest: ${top.nameEn || top.nameTh} ${pct(top)}` }
    : { th: "ไม่มีรายงานเขื่อนขนาดใหญ่วันนี้", en: "No large-dam report today" };
  return { ...DAMS, status: "ok", level, th: `${base.th}${mediumTh}${spillTh}`, en: `${base.en}${mediumEn}${spillEn}`, observedAt: d.newestDate };
}

// ─── Rain gauges (measured) ──────────────────────────────────────

const RAIN: Meta = {
  key: "rain", kind: "measured", titleTh: "ฝนที่วัดได้ 24 ชม.", titleEn: "Measured rain, 24 h",
  sourceTh: "ThaiWater สถานีวัดฝน", sourceEn: "ThaiWater rain gauges", ageMode: "time", staleAfterMs: 6 * HOUR,
};

export function rainLine(feed: Feed<RainResponse>, nowMs: number): DeskLine {
  if (feed.status === "loading") return loading(RAIN);
  if (feed.status === "failed") return unavailable(RAIN, `อ่านข้อมูลฝนไม่ได้ · ${FAILED_TH}`, `Rain gauges could not be read. ${FAILED_EN}`);
  const summary = currentRainSummary(feed.data, nowMs);
  if (!summary) {
    return unavailable(RAIN, "ไม่มีค่าฝนปัจจุบันจากสถานีวัด — ไม่ใช่ว่าฝนไม่ตก", feed.data.provenance === "live" ? "No current gauge reading — rainfall is unknown, not zero." : feed.data.note);
  }
  const top = summary.districts[0];
  if (top) {
    const very = top.band === "very-heavy";
    const more = summary.districts.length - 1;
    return {
      ...RAIN, status: "ok", level: very ? "alert" : "watch",
      th: `ฝน${very ? "หนักมาก" : "หนัก"}: อ.${top.th} ${fmt(top.max)} มม.${more > 0 ? ` · ฝนหนักอีก ${more} อำเภอ` : ""}`,
      en: `${very ? "Very heavy" : "Heavy"} rain: ${top.en || top.th} ${fmt(top.max)} mm${more > 0 ? ` · ${more} more district${more > 1 ? "s" : ""} with heavy rain` : ""}`,
      observedAt: summary.wettest?.observedAt ?? null,
    };
  }
  const w = summary.wettest;
  return {
    ...RAIN, status: "ok", level: "good",
    th: `ไม่มีสถานีวัดฝนหนัก (≥35 มม.)${w ? ` · มากสุด อ.${w.amphoeTh} ${fmt(w.rain24h)} มม.` : ""}`,
    en: `No gauge with heavy rain (≥35 mm)${w ? ` · wettest: ${w.amphoeEn || w.amphoeTh} ${fmt(w.rain24h)} mm` : ""}`,
    observedAt: w?.observedAt ?? null,
  };
}

// ─── Forecast rain, 48 h model ───────────────────────────────────

const FORECAST: Meta = {
  key: "forecast", kind: "model", titleTh: "ฝนพยากรณ์ 24 ชม.", titleEn: "Forecast rain, 24 h",
  sourceTh: "Open-Meteo (แบบจำลอง)", sourceEn: "Open-Meteo (model)", ageMode: "time", staleAfterMs: 6 * HOUR,
};

export function forecastLine(outlook: ProvinceOutlook | null | undefined): DeskLine {
  if (!outlook?.available) {
    return unavailable(FORECAST, "ยังไม่มีข้อมูลพยากรณ์ฝน — ไม่ใช่การพยากรณ์ว่าฝนไม่ตก", "No rain forecast yet — not a dry forecast.");
  }
  const top = outlook.rain[0];
  if (top) {
    const more = outlook.rain.length - 1;
    const very = top.level !== "watch";
    return {
      ...FORECAST, status: "ok", level: top.level,
      th: `คาดฝน${very ? "หนักมาก" : "หนัก"}: อ.${top.district.nameTh} ${fmt(top.district.rain24h, 0)} มม. หนักสุดช่วง ${outlookTime(top.district.peakRainAt)}${more > 0 ? ` · อีก ${more} อำเภอ` : ""}`,
      en: `${very ? "Very heavy" : "Heavy"} rain forecast: ${top.district.nameEn} ${fmt(top.district.rain24h, 0)} mm, peak ${outlookTimeEn(top.district.peakRainAt)}${more > 0 ? ` · ${more} more district${more > 1 ? "s" : ""}` : ""}`,
      observedAt: outlook.fetchedAt,
    };
  }
  const w = outlook.wettest;
  return {
    ...FORECAST, status: "ok", level: "good",
    th: `ไม่มีอำเภอที่คาดฝนหนัก ≥35 มม.${w ? ` (มากสุด ${w.nameTh} ${fmt(w.rain24h, 0)} มม.)` : ""} — ไม่ใช่การรับประกันว่าไม่มีพายุเฉพาะจุด`,
    en: `No district forecast ≥35 mm${w ? ` (most: ${w.nameEn} ${fmt(w.rain24h, 0)} mm)` : ""} — not a guarantee against a local storm.`,
    observedAt: outlook.fetchedAt,
  };
}

// ─── Google Flood Hub (river model) ──────────────────────────────

const FLOODHUB: Meta = {
  key: "floodhub", kind: "model", titleTh: "พยากรณ์น้ำท่วมแม่น้ำ", titleEn: "River flood forecast",
  sourceTh: "Google Flood Hub (แบบจำลอง)", sourceEn: "Google Flood Hub (model)", ageMode: "time", staleAfterMs: 30 * HOUR,
};

const FH: Record<FloodHubSeverity, { level: SeverityLevel; th: string; en: string }> = {
  EXTREME: { level: "critical", th: "แบบจำลองคาดน้ำท่วมรุนแรงมากที่แม่น้ำปิง", en: "Model forecasts extreme flooding on the Ping" },
  SEVERE: { level: "alert", th: "แบบจำลองคาดน้ำท่วมรุนแรงที่แม่น้ำปิง", en: "Model forecasts severe flooding on the Ping" },
  ABOVE_NORMAL: { level: "watch", th: "แบบจำลองคาดน้ำสูงกว่าปกติที่แม่น้ำปิง", en: "Model forecasts above-normal water on the Ping" },
  NO_FLOODING: { level: "good", th: "แบบจำลองไม่คาดน้ำท่วมจากแม่น้ำ — ไม่รวมน้ำป่าและน้ำท่วมในเมือง", en: "Model forecasts no river flooding — flash and urban flooding are not covered" },
  UNKNOWN: { level: "unknown", th: "ไม่มีการพยากรณ์", en: "No forecast" },
};

const newestIssued = (fh: FloodHubResponse): string | null =>
  fh.points.reduce<string | null>((n, p) => (p.issuedTime && (!n || Date.parse(p.issuedTime) > Date.parse(n)) ? p.issuedTime : n), null);

export function floodHubLine(feed: Feed<FloodHubResponse>, nowMs = Date.now()): DeskLine {
  if (feed.status === "loading") return loading(FLOODHUB);
  if (feed.status === "failed") return unavailable(FLOODHUB, `อ่าน Flood Hub ไม่ได้ · ${FAILED_TH}`, `Flood Hub could not be read. ${FAILED_EN}`);
  if (feed.data.provenance !== "live") {
    return unavailable(FLOODHUB, "Google Flood Hub ไม่มีการพยากรณ์ — ไม่ใช่การพยากรณ์ว่าไม่มีน้ำท่วม", `Flood Hub unavailable: ${feed.data.note}`);
  }
  // Reuse the source's issuance/window rules, not a cached worst severity.
  // Future forecast windows remain valid; expired windows and old issues do not.
  const fh = summariseFloodHub(feed.data.points, feed.data.points.map(p => ({
    gaugeId: p.gaugeId, severity: p.severity, forecastTrend: p.trend,
    issuedTime: p.issuedTime ?? undefined,
    forecastTimeRange: { start: p.forecastStart ?? undefined, end: p.forecastEnd ?? undefined },
  })), new Date(nowMs).toISOString());
  if (!fh.worst || fh.worst === "UNKNOWN") {
    return unavailable(FLOODHUB, "Google Flood Hub ไม่มีช่วงพยากรณ์ปัจจุบัน — ไม่ใช่การยืนยันว่าไม่มีน้ำท่วม", "No current Flood Hub issuance and forecast window — this does not establish no flooding.");
  }
  const known = fh.points.filter(p => p.severity !== "UNKNOWN");
  const coverageIncomplete = known.length < fh.points.length;
  const coverageTh = coverageIncomplete ? ` · ใช้ได้ ${known.length}/${fh.points.length} จุด` : "";
  const coverageEn = coverageIncomplete ? `; ${known.length}/${fh.points.length} points current` : "";
  if (fh.outlook === "unknown") {
    return { ...FLOODHUB, status: "ok", level: "unknown", coverageIncomplete,
      th: `ช่วงพยากรณ์ปัจจุบันมีข้อมูลไม่ครบ${coverageTh} — ไม่ใช่การยืนยันว่าไม่มีน้ำท่วม`,
      en: `Incomplete current forecast coverage${coverageEn} — not confirmation of no flooding`,
      observedAt: newestIssued({ ...fh, points: known }),
    };
  }
  const s = FH[fh.worst];
  const rising = fh.points.filter((p) => p.trend === "RISE").length;
  return {
    ...FLOODHUB, status: "ok", level: s.level, coverageIncomplete,
    th: `${s.th}${coverageTh}${rising ? ` · ${rising} จุดแนวโน้มสูงขึ้น` : ""}`,
    en: `${s.en}${coverageEn}${rising ? ` · ${rising} point${rising > 1 ? "s" : ""} rising` : ""}`,
    observedAt: newestIssued({ ...fh, points: fh.points.filter(p => p.severity !== "UNKNOWN") }),
  };
}

// ─── The answer ──────────────────────────────────────────────────

export interface DeskInputs {
  river: Feed<RiverLevelResponse>;
  dams: Feed<DamResponse>;
  rain: Feed<RainResponse>;
  floodHub: Feed<FloodHubResponse>;
  outlook: ProvinceOutlook | null | undefined;
}

export function buildDeskAnswer(inputs: DeskInputs, nowMs: number): DeskAnswer {
  const lines = [
    riverLine(inputs.river, nowMs),
    damLine(inputs.dams, nowMs),
    rainLine(inputs.rain, nowMs),
    forecastLine(inputs.outlook),
    floodHubLine(inputs.floodHub, nowMs),
  ];
  const missing = lines.filter((l) => l.status !== "ok" || l.level === "unknown" || l.coverageIncomplete).length;
  const signals = lines.filter((l) => l.status === "ok" && RANK[l.level] >= RANK.watch).sort((a, b) => RANK[b.level] - RANK[a.level]);
  if (signals.length) {
    const top = signals[0];
    const others = signals.length - 1;
    return {
      level: top.level,
      th: `${top.titleTh}: ${top.th}${others ? ` · และอีก ${others} สัญญาณ` : ""}`,
      en: `${top.titleEn}: ${top.en}${others ? ` · and ${others} more signal${others > 1 ? "s" : ""}` : ""}`,
      lines,
      missing,
    };
  }
  if (missing) {
    return {
      level: "unknown",
      th: `ยังตอบได้ไม่ครบ — ${missing} แหล่งข้อมูลไม่พร้อม ส่วนที่มีไม่พบสัญญาณ ซึ่งไม่ใช่การยืนยันว่าปลอดภัย`,
      en: `Incomplete — ${missing} source${missing > 1 ? "s" : ""} unavailable. What did answer shows no signal, which is not confirmation of safety.`,
      lines,
      missing,
    };
  }
  return {
    level: "good",
    th: "ไม่พบสัญญาณน้ำท่วมจากทุกแหล่งขณะนี้ — ไม่ใช่การรับประกันความปลอดภัย",
    en: "No flood signal from any source right now — not a guarantee of safety.",
    lines,
    missing,
  };
}

// ─── Age, in the reader's language ───────────────────────────────

export function ageText(line: Pick<DeskLine, "observedAt" | "ageMode" | "staleAfterMs">, nowMs: number, lang: "th" | "en"): { text: string; stale: boolean } | null {
  if (!line.observedAt) return null;
  const th = lang === "th";
  if (line.ageMode === "day") {
    const days = damAgeDays(line.observedAt, nowMs);
    if (days === null) return { text: th ? "วันที่อ่านไม่ได้" : "date unreadable", stale: true };
    const text = days <= 0 ? (th ? "รายงานวันนี้" : "today's report") : days === 1 ? (th ? "รายงานเมื่อวาน" : "yesterday's report") : th ? `รายงาน ${days} วันก่อน` : `report ${days} days old`;
    return { text, stale: days * 24 * HOUR >= line.staleAfterMs };
  }
  const ms = nowMs - Date.parse(line.observedAt);
  if (!Number.isFinite(ms)) return { text: th ? "เวลาอ่านไม่ได้" : "timestamp unreadable", stale: true };
  if (ms < -5 * 60_000) return { text: th ? "เวลาอยู่ในอนาคต" : "timestamp in the future", stale: true };
  const min = Math.max(0, Math.round(ms / 60_000));
  const text =
    min < 1 ? (th ? "เมื่อสักครู่" : "just now")
    : min < 120 ? (th ? `${min} นาทีที่แล้ว` : `${min} min ago`)
    : min < 48 * 60 ? (th ? `${Math.round(min / 60)} ชม.ที่แล้ว` : `${Math.round(min / 60)} h ago`)
    : th ? `${Math.round(min / 1440)} วันที่แล้ว` : `${Math.round(min / 1440)} d ago`;
  const stale = ms > line.staleAfterMs;
  return { text: stale ? (th ? `เก่า · ${text}` : `stale · ${text}`) : text, stale };
}
