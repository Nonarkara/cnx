"use client";

import type { ExecutiveMetric } from "../../lib/cnx/executive-brief";
import { useLang } from "../../hooks/useLang";
import type { Lang } from "../../lib/i18n";

const levels: Record<ExecutiveMetric["level"], [string, string]> = {
  good: ["ติดตามต่อเนื่อง", "Keep monitoring"],
  watch: ["เฝ้าระวัง", "Watch"],
  alert: ["ควรตรวจสอบเร่งด่วน", "Check urgently"],
  critical: ["ถึงเกณฑ์วิกฤต", "Critical threshold reached"],
  unknown: ["ยังประเมินไม่ได้", "Cannot assess yet"],
};
const DATE: Record<Lang, Intl.DateTimeFormat> = {
  th: new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }),
  en: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }),
};

// Metric units arrive from lib/cnx/executive-brief as one published string
// (some Thai, some English). Each known unit is listed once as a pair so
// the card shows it in the current mode; an unknown unit passes through.
const UNITS: [th: string, en: string, raw: string][] = [
  ["ม. เหนือตลิ่ง", "m above bank", "ม. เหนือตลิ่ง"],
  ["ม. ถึงตลิ่ง", "m · at bank level", "ม. ถึงตลิ่ง"],
  ["ม. ต่ำกว่าตลิ่ง", "m below bank", "ม. ต่ำกว่าตลิ่ง"],
  ["ม. เกินเกณฑ์วิกฤต", "m over the critical level", "ม. เกินเกณฑ์วิกฤต"],
  ["ม. ถึงเกณฑ์วิกฤต", "m · at the critical level", "ม. ถึงเกณฑ์วิกฤต"],
  ["ม. ก่อนเกณฑ์วิกฤต", "m below the critical level", "ม. ก่อนเกณฑ์วิกฤต"],
  ["ม. รทก.", "m MSL", "ม. รทก. / MSL"],
  ["มม. / 24 ชม. (สูงสุด)", "mm / 24 h (max)", "มม. / 24 ชม. (สูงสุด)"],
  ["จุด / 24 ชม.", "detections / 24 h", "detections / 24h"],
  ["ลำ", "aircraft", "aircraft"],
];

/** A metric's unit in the current language mode. */
export function metricUnit(unit: string, lang: Lang): string {
  const hit = UNITS.find((u) => u[2] === unit);
  return hit ? (lang === "en" ? hit[1] : hit[0]) : unit;
}

/** The selected desk explains the number before exposing detailed records. */
export default function CnxMetricEvidence({ metric }: { metric: ExecutiveMetric }) {
  const { lang, t } = useLang();
  const observed = Date.parse(metric.observedAt ?? "");
  const state = metric.state === "stale" ? t("ข้อมูลเก่า", "Stale data") : metric.state === "unavailable" ? t("ข้อมูลไม่เพียงพอ", "Not enough data") : t(...levels[metric.level]);
  return <section lang={lang} aria-label={t(`${metric.titleTh} · ความหมายและขั้นตอนถัดไป`, `${metric.titleEn} · what it means and what to do next`)} className="border-b border-[var(--line)] bg-[var(--bg-surface)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[15px] font-semibold">{t(`${metric.titleTh} · หลักฐานเพื่อปฏิบัติการ`, `${metric.titleEn} · operational evidence`)}</h2>
      <span className={`text-[12px] font-semibold ${metric.state === "current" && metric.level === "critical" ? "text-[var(--sev-critical)]" : metric.state === "current" && metric.level === "alert" ? "text-[var(--sev-alert)]" : "text-[var(--dim)]"}`}>{state}</span>
    </div>
    <p className="mt-2 text-[13px] leading-relaxed">{t(metric.summaryTh, metric.summaryEn)}</p>
    <p className="mt-3 border-l-2 border-[var(--cool)] pl-3 text-[13px] leading-relaxed"><strong>{t("ตรวจสอบต่อ: ", "Next check: ")}</strong>{t(metric.actionTh, metric.actionEn)}</p>
    <p className="mt-3 break-words text-[11px] leading-relaxed text-[var(--dim)]">{t("แหล่งข้อมูล: ", "Source: ")}{metric.source}<br />{Number.isFinite(observed) ? <>{t("เวลาสังเกต: ", "Observed: ")}<time dateTime={metric.observedAt!}>{DATE[lang].format(observed)}{t(" น. (กรุงเทพฯ)", " (Bangkok)")}</time></> : t("ยังไม่มีเวลาสังเกตที่ยืนยันได้", "No verified observation time yet")}</p>
  </section>;
}
