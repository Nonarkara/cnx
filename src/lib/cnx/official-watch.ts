// CNX — the official-warning rows of the watch board.
//
// TMD's CAP warnings are the government's own statement, so they lead the
// board, above every model and measured row (EW4All Pillar 2: official
// forecasts take precedence). Three states, each a row that is always
// present — the official channel is never silently missing:
//   1. one row per TMD alert in force for Chiang Mai, coloured by its CAP
//      severity;
//   2. no alert → "no TMD warning in force for Chiang Mai", never "safe";
//   3. feed unread → unavailable, with the reason.

import type { WatchItem, WatchLevel } from "./watch-list";
import { getTwinEntity } from "./twin-manifest";
import { TMD_CAP_SOURCE, type CapSeverity, type OfficialAlert, type OfficialWarningsResponse } from "./tmd-cap-core";

export const OFFICIAL_SYSTEM_TH = "ประกาศทางการ · กรมอุตุนิยมวิทยา";
export const OFFICIAL_SYSTEM_EN = "Official warning · Thai Meteorological Department";
export const NO_OFFICIAL_WARNING_TH = "ไม่มีประกาศ TMD ที่มีผลสำหรับเชียงใหม่";
export const NO_OFFICIAL_WARNING_EN = "No TMD warning in force for Chiang Mai";
/** Ages retrieval using the declared feed SLO, not the lifetime of a CAP warning. */
export const OFFICIAL_WARNING_MAX_AGE_MS = getTwinEntity("official-warnings")!.staleAfterSec! * 1000;

function evidenceUrl(raw: string | null): string | undefined {
  try {
    const url = new URL(raw ?? "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch { return undefined; }
}

/** CAP severity → board level. An official warning in force is never below "watch". */
export const CAP_SEVERITY_LEVEL: Record<CapSeverity, WatchLevel> = {
  Extreme: "critical",
  Severe: "alert",
  Moderate: "watch",
  Minor: "watch",
  Unknown: "watch",
};

const SEVERITY_TH: Record<string, string> = { Extreme: "รุนแรงมาก", Severe: "รุนแรง", Moderate: "ปานกลาง", Minor: "เล็กน้อย", Unknown: "ไม่ระบุ" };
const URGENCY_TH: Record<string, string> = { Immediate: "ทันที", Expected: "คาดว่าจะเกิด", Future: "ล่วงหน้า", Past: "ผ่านไปแล้ว", Unknown: "ไม่ระบุ" };
const CERTAINTY_TH: Record<string, string> = { Observed: "เกิดขึ้นแล้ว", Likely: "น่าจะเกิด", Possible: "อาจเกิด", Unlikely: "ไม่น่าเกิด", Unknown: "ไม่ระบุ" };
const AREA_CHARS = 140;

const base = {
  domain: "water" as const,
  kind: "official" as const,
  systemTh: OFFICIAL_SYSTEM_TH,
  systemEn: OFFICIAL_SYSTEM_EN,
  source: TMD_CAP_SOURCE,
  openMetric: null,
};

function clip(text: string): string {
  return text.length > AREA_CHARS ? `${text.slice(0, AREA_CHARS).trimEnd()}…` : text;
}

/** "11 ต.ค. 06:00 – 18:00 น." / "11 Oct 06:00 – 18:00", Bangkok time. */
export function capWindow(effective: string | null, expires: string | null, lang: "th" | "en"): string {
  const fmt = (iso: string | null, withDate: boolean) => {
    const t = iso ? Date.parse(iso) : NaN;
    if (!Number.isFinite(t)) return null;
    return new Date(t).toLocaleString(lang === "th" ? "th-TH" : "en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...(withDate ? { day: "numeric", month: "short" } : {}),
    });
  };
  const sameDay = effective && expires && effective.slice(0, 10) === expires.slice(0, 10);
  const from = fmt(effective, true) ?? (lang === "th" ? "ไม่ระบุ" : "not stated");
  const to = fmt(expires, !sameDay) ?? (lang === "th" ? "ไม่ระบุ" : "not stated");
  return lang === "th" ? `${from} – ${to} น.` : `${from} – ${to}`;
}

function alertItem(alert: OfficialAlert, fetchedAt: string): WatchItem {
  const areaTh = alert.areaDesc_th ?? alert.areaDesc;
  const areaEn = alert.areaDesc_en ?? alert.areaDesc;
  const matchTh = alert.geocodeMatch ? "ประกาศระบุจังหวัดเชียงใหม่ (TH-50)" : "พื้นที่ประกาศ (รูปหลายเหลี่ยม) ครอบคลุมบางส่วนของจังหวัด";
  const matchEn = alert.geocodeMatch ? "The alert names Chiang Mai (TH-50)" : "The alert polygon reaches into the province";
  return {
    ...base,
    id: `tmd-${alert.identifier}`,
    level: CAP_SEVERITY_LEVEL[alert.severity],
    valueTh: `${alert.headline_th ?? "ประกาศเตือนภัยกรมอุตุนิยมวิทยา"} · มีผล ${capWindow(alert.effective, alert.expires, "th")}`,
    valueEn: `${alert.headline_en ?? alert.event} · in force ${capWindow(alert.effective, alert.expires, "en")}`,
    evidenceTh: `${matchTh} · ความรุนแรง ${SEVERITY_TH[alert.severity] ?? alert.severity} · ความเร่งด่วน ${URGENCY_TH[alert.urgency] ?? alert.urgency} · ความแน่นอน ${CERTAINTY_TH[alert.certainty] ?? alert.certainty} · พื้นที่: ${clip(areaTh)}`,
    evidenceEn: `${matchEn}. CAP severity ${alert.severity}, urgency ${alert.urgency}, certainty ${alert.certainty}. Area: ${clip(areaEn)}`,
    actionTh: alert.instruction_th ?? "ปฏิบัติตามคำแนะนำในประกาศของกรมอุตุนิยมวิทยา",
    actionEn: alert.instruction_en ?? "Follow the instructions in the TMD warning",
    observedAt: fetchedAt,
    evidenceUrl: evidenceUrl(alert.web),
  };
}

/** Shared map/board selection. Null means an unknown check; [] means a current empty check. */
export function currentOfficialAlerts(feed: OfficialWarningsResponse | null | undefined, now: number): OfficialAlert[] | null {
  const age = feed ? now - Date.parse(feed.fetchedAt) : NaN;
  if (!feed || feed.provenance !== "live" || !Number.isFinite(age) || age < -5 * 60_000 || age > OFFICIAL_WARNING_MAX_AGE_MS) return null;
  return feed.alerts.filter((alert) => !alert.expires || !(Date.parse(alert.expires) < now));
}

/** The official rows; always at least one. `feed` null/undefined = not read yet. */
export function officialWatchItems(feed: OfficialWarningsResponse | null | undefined, now: Date): WatchItem[] {
  const age = feed ? now.getTime() - Date.parse(feed.fetchedAt) : NaN;
  const stale = !!feed && feed.provenance === "live" && (!Number.isFinite(age) || age < -5 * 60_000 || age > OFFICIAL_WARNING_MAX_AGE_MS);
  const inForce = currentOfficialAlerts(feed, now.getTime());
  if (!feed || inForce === null) {
    return [
      {
        ...base,
        id: "tmd-official",
        level: "unknown",
        valueTh: "อ่านประกาศ TMD ไม่ได้ในขณะนี้",
        valueEn: "TMD warnings unavailable",
        evidenceTh: `${stale ? "การตรวจประกาศล่าสุดเก่าเกินกำหนดหรือเวลายืนยันไม่ได้ ต้องอ่านประกาศใหม่รวมถึงฉบับยกเลิก/แก้ไข" : feed ? feed.reason_th ?? "ฟีด CAP ของกรมอุตุนิยมวิทยาไม่ตอบ" : "ยังอ่านฟีด CAP ของกรมอุตุนิยมวิทยาไม่ได้"} — ไม่มีข้อมูลไม่ใช่การยืนยันว่าไม่มีประกาศ`,
        evidenceEn: `${stale ? "The last CAP check is stale or its time cannot be verified; recheck warnings, cancellations and updates" : feed ? feed.reason ?? "The TMD CAP feed did not answer" : "The TMD CAP feed has not been read yet"}. No data is not proof that no warning is in force.`,
        actionTh: null,
        actionEn: null,
        observedAt: stale && Number.isFinite(Date.parse(feed!.fetchedAt)) ? feed!.fetchedAt : null,
      },
    ];
  }
  if (inForce.length > 0) return inForce.map((a) => alertItem(a, feed.fetchedAt));
  return [
    {
      ...base,
      id: "tmd-official",
      level: "good",
      chipTh: "ไม่มีประกาศ",
      chipEn: "None in force",
      valueTh: NO_OFFICIAL_WARNING_TH,
      valueEn: NO_OFFICIAL_WARNING_EN,
      evidenceTh: `ตรวจประกาศ CAP ล่าสุด ${feed.documentsRead} ฉบับของกรมอุตุนิยมวิทยา ไม่มีฉบับใดที่มีผลครอบคลุมเชียงใหม่ — ไม่ใช่การยืนยันว่าปลอดภัย ยังต้องดูข้อมูลวัดจริงด้านล่าง`,
      evidenceEn: `Checked TMD's ${feed.documentsRead} latest CAP alerts; none in force covers Chiang Mai. Not an all-clear: the measured rows below still apply.`,
      actionTh: null,
      actionEn: null,
      observedAt: feed.fetchedAt,
    },
  ];
}
