"use client";

import type { RainResponse } from "../../lib/cnx/rain";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronRight, FileText, Flame, Map, Phone, Plane, Radio, Waves, Wind, type LucideIcon } from "lucide-react";
import type { AirQualityResponse, CnxFiresResponse, SocialListeningResponse } from "../../types/cnx";
import type { DustboyResponse } from "../../lib/cnx/dustboy";
import type { CnxTwinResponse } from "../../lib/cnx/twin";
import type { RiverGauge } from "../../lib/cnx/river-level";
import type { FetchResult } from "../../lib/cnx/opensky";
import { buildExecutiveBrief, type ExecutiveMetric } from "../../lib/cnx/executive-brief";
import { useLang } from "../../hooks/useLang";
import type { Lang } from "../../lib/i18n";
import { metricUnit } from "./CNXMetricEvidence";

interface Props {
  air: AirQualityResponse | null;
  dustboy: DustboyResponse | null;
  fires: CnxFiresResponse | null;
  twin: CnxTwinResponse | null;
  riverGauges: RiverGauge[];
  flights: FetchResult | null;
  rain?: RainResponse | null;
  social: SocialListeningResponse | null;
  onOpenMap: () => void;
  onOpenMetric: (id: ExecutiveMetric["id"]) => void;
  onOpenBrief: () => void;
  onOpenEmergency: () => void;
  onOpenData: () => void;
}

const ICONS: Record<ExecutiveMetric["id"], LucideIcon> = { water: Waves, air: Wind, fire: Flame, mobility: Plane };
const TIME_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: "Asia/Bangkok", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
};
const SOURCE_TIME: Record<Lang, Intl.DateTimeFormat> = {
  th: new Intl.DateTimeFormat("th-TH", TIME_OPTS),
  en: new Intl.DateTimeFormat("en-GB", TIME_OPTS),
};

function sourceTime(value: string | null | undefined, lang: Lang): string | null {
  const date = Date.parse(value ?? "");
  if (!Number.isFinite(date)) return null;
  return lang === "en" ? `${SOURCE_TIME.en.format(date)} (Bangkok)` : `${SOURCE_TIME.th.format(date)} น. (กรุงเทพฯ)`;
}

function safeLink(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

function Metric({ metric, onOpen }: { metric: ExecutiveMetric; onOpen: () => void }) {
  const { lang, t } = useLang();
  const Icon = ICONS[metric.id];
  const concern = metric.state === "current" && ["watch", "alert", "critical"].includes(metric.level);
  const concernColour = metric.level === "critical" ? "text-[var(--sev-critical)]" : metric.level === "alert" ? "text-[var(--sev-alert)]" : "text-[var(--sev-watch)]";
  const state = metric.state === "stale" ? t("ข้อมูลเก่า", "Stale data") : metric.state === "unavailable" ? t("ข้อมูลไม่เพียงพอ", "Not enough data") : concern ? t("ควรติดตาม", "Needs attention") : metric.level === "unknown" ? t("ยังประเมินไม่ได้", "Cannot assess yet") : t("มีข้อมูล", "Data available");
  const date = sourceTime(metric.observedAt, lang);
  return (
    <article className="flex min-w-0 flex-col border-b border-[var(--line)] py-4 sm:px-4 xl:border-b-0 xl:border-r xl:last:border-r-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--cool)]" strokeWidth={1.5} />
        <h2 className="min-w-0 flex-1 text-[17px] font-semibold leading-snug">{t(metric.titleTh, metric.titleEn)}</h2>
        <span className={`text-[12px] ${concern ? `font-semibold ${concernColour}` : "text-[var(--dim)]"}`}>{state}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-[38px] font-medium leading-none tracking-[-0.05em] tabular-nums sm:text-[42px]">{metric.value}</span>
        <span className="text-[14px] text-[var(--dim)]">{metricUnit(metric.unit, lang)}</span>
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-[var(--dim)]">{t(metric.summaryTh, metric.summaryEn)}</p>
      <div className="mt-3">
        <p className="text-[12px] font-medium text-[var(--ink)]">{metric.source}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--dim)]">{date ? <>{t("สังเกตเมื่อ ", "Observed ")}<time dateTime={metric.observedAt ?? undefined}>{date}</time></> : metric.state === "current" && metric.id === "fire" && metric.value === "0" ? t("ไม่พบจุดตรวจจับที่จะระบุเวลาสังเกต · ดูกรอบเวลาของแหล่งข้อมูล", "No detection to time-stamp · see the source's time window") : t("ไม่มีเวลาสังเกตที่ยืนยันได้", "No verified observation time")}</p>
        <button type="button" onClick={onOpen} className="mt-2 inline-flex min-h-11 items-center gap-2 text-left text-[14px] font-semibold text-[var(--cool)]">
          <span>{metric.id === "air" ? t("ดูหลักฐานคุณภาพอากาศ", "View air-quality evidence") : t("ดูตำแหน่งและแหล่งข้อมูล", "View locations and sources")}</span><ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0" />
        </button>
      </div>
    </article>
  );
}

export default function CNXExecutiveOverview({ air, dustboy, fires, twin, riverGauges, flights, rain = null, social, onOpenMap, onOpenMetric, onOpenBrief, onOpenEmergency, onOpenData }: Props) {
  const { lang, t } = useLang();
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const brief = useMemo(() => buildExecutiveBrief({ air, dustboy, fires, twin, riverGauges, flights, rain, now: clock }), [air, dustboy, fires, twin, riverGauges, flights, rain, clock]);
  const news = (social?.items ?? []).filter((item) => item.tone !== "demo").slice(0, 4);
  const priority = { critical: 0, alert: 1, watch: 2, unknown: 3, good: 4 };
  const checks = brief.metrics.filter((metric) => metric.state !== "current" || metric.level === "unknown" || ["watch", "alert", "critical"].includes(metric.level))
    .sort((a, b) => priority[a.level] - priority[b.level]);
  const nextChecks = checks.length ? checks : brief.metrics.slice(0, 2);
  const districtMax = Math.max(1, ...brief.districts.map((district) => district.pm25));

  return (
    <section lang={lang} aria-label={t("ภาพรวมเชียงใหม่เพื่อการตัดสินใจ", "Chiang Mai overview for decisions")} className="mx-auto w-full max-w-[1600px] px-5 pb-8 pt-4 text-[var(--ink)] sm:px-8 lg:px-12">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="min-w-0 flex-1 basis-[36rem]">
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.025em] sm:text-[34px]">{t("เชียงใหม่ ในภาพเดียว", "Chiang Mai at a glance")}</h1>
          <p className="mt-2 max-w-[65ch] text-[16px] leading-relaxed">{t(brief.headlineTh, brief.headlineEn)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onOpenBrief} className="inline-flex min-h-11 items-center gap-2 bg-[var(--cool)] px-3 py-2 text-[14px] font-semibold text-[var(--bg)]"><FileText aria-hidden="true" className="h-4 w-4" />{t("สรุปผู้ว่าฯ", "Governor brief")}<ArrowUpRight aria-hidden="true" className="h-4 w-4" /></button>
          <button type="button" onClick={onOpenMap} className="inline-flex min-h-11 items-center gap-2 border border-[var(--line)] px-3 py-2 text-[14px] font-semibold hover:bg-[var(--bg-raised)]"><Map aria-hidden="true" className="h-4 w-4" />{t("เปิดแผนที่", "Open map")}</button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] sm:text-[14px]">
        <span className="inline-flex items-center gap-2"><Check aria-hidden="true" className="h-4 w-4 text-[var(--cool)]" />{t(`${brief.observedCount} ด้านมีหลักฐานในกรอบเวลา`, `${brief.observedCount} ${brief.observedCount === 1 ? "area has" : "areas have"} evidence within the time window`)}</span>
        <span className="inline-flex items-center gap-2 text-[var(--dim)]"><Radio aria-hidden="true" className="h-4 w-4" />{t(`${brief.unknownCount} ด้านยังประเมินระดับไม่ได้`, `${brief.unknownCount} ${brief.unknownCount === 1 ? "area" : "areas"} not yet assessable`)}</span>
        {brief.attentionCount > 0 && <span className="text-[var(--ink)]">{t(`${brief.attentionCount} ด้านควรติดตามเป็นพิเศษ`, `${brief.attentionCount} ${brief.attentionCount === 1 ? "area needs" : "areas need"} close attention`)}</span>}
      </div>

      <div className="mt-4 grid items-start border-y border-[var(--line)] sm:grid-cols-2 xl:grid-cols-4">
        {brief.metrics.map((metric) => <Metric key={metric.id} metric={metric} onOpen={() => onOpenMetric(metric.id)} />)}
      </div>

      <div className="mt-6 grid items-start gap-x-8 gap-y-6 lg:grid-cols-12">
        <section aria-labelledby="executive-priorities" className="lg:col-span-7">
          <div><p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--cool)]">{t("โต๊ะตัดสินใจ", "Decision desk")}</p><h2 id="executive-priorities" className="mt-1 text-[26px] font-semibold leading-snug sm:text-[28px]">{t("สิ่งที่ควรตรวจสอบต่อ", "What to check next")}</h2></div>
          <p className="mt-3 max-w-[38rem] text-[14px] leading-relaxed text-[var(--dim)]">{t("เริ่มจากด้านที่ต้องติดตามและข้อมูลที่ยังขาด ก่อนกำหนดการดำเนินงานร่วมกับหน่วยงานเจ้าของข้อมูล", "Start with the areas to watch and the evidence still missing, then plan the response with the agencies that own the data.")}</p>
          <ol className="mt-4 border-t border-[var(--line)]">
            {nextChecks.map((metric, index) => <li key={metric.id} className="grid grid-cols-[2rem_1fr] gap-3 border-b border-[var(--line)] py-4"><span className="pt-1 font-mono text-[15px] tabular-nums text-[var(--dim)]">0{index + 1}</span><div><h3 className="text-[17px] font-semibold">{t(metric.titleTh, metric.titleEn)}</h3><p className="mt-2 text-[15px] leading-relaxed text-[var(--dim)]">{t(metric.actionTh, metric.actionEn)}</p><button type="button" onClick={() => onOpenMetric(metric.id)} className="mt-2 inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold text-[var(--cool)]">{t("ตรวจหลักฐาน", "Check the evidence")}<ChevronRight aria-hidden="true" className="h-4 w-4" /></button></div></li>)}
          </ol>
          <button type="button" onClick={onOpenEmergency} className="mt-4 inline-flex min-h-11 items-center gap-2 border border-[var(--line)] px-3 py-2 text-[14px] font-semibold"><Phone aria-hidden="true" className="h-4 w-4 text-[var(--cool)]" />{t("ติดต่อหน่วยงานและหมายเลขฉุกเฉิน", "Agencies and emergency numbers")}<ArrowUpRight aria-hidden="true" className="h-4 w-4 text-[var(--dim)]" /></button>
        </section>

        <section aria-labelledby="executive-coverage" className="min-w-0 border-t border-[var(--line)] pt-4 lg:col-span-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--cool)]">{t("หลักฐานภาคพื้นดิน", "Ground evidence")}</p><h2 id="executive-coverage" className="mt-2 text-[25px] font-semibold leading-snug">{t("พื้นที่ที่เรามองเห็น", "Where we can see")}</h2>
          <div className="mt-5 flex items-baseline gap-3"><span className="font-mono text-[44px] leading-none tabular-nums">{brief.measuredDistrictCount}</span><span className="text-[14px] text-[var(--dim)]">{t("อำเภอมีข้อมูล DustBoy ที่ใช้ได้", brief.measuredDistrictCount === 1 ? "district with usable DustBoy data" : "districts with usable DustBoy data")}</span></div>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--dim)]">{t("เรียงจากค่า PM2.5 เฉลี่ยสูงสุดเฉพาะสถานีที่ใช้ได้ในเชียงใหม่ ไม่ใช่ตัวแทนทุกพื้นที่ของอำเภอ", "Ranked by highest average PM2.5 from usable Chiang Mai stations only; not representative of every part of a district.")}</p>
          {brief.districts.length === 0 ? <p className="mt-4 border-t border-[var(--line)] pt-3 text-[15px] leading-relaxed">{t("ยังไม่มีข้อมูลตรวจวัดรายอำเภอที่ผ่านเงื่อนไข จึงไม่จัดอันดับพื้นที่", "No district readings pass the checks yet, so no areas are ranked.")}</p> : <ol className="mt-4 space-y-4">{brief.districts.slice(0, 5).map((district, index) => <li key={district.th}><div className="flex items-baseline justify-between gap-3"><span className="text-[16px] font-semibold"><span className="mr-2 font-mono text-[12px] font-normal text-[var(--dim)]">0{index + 1}</span>{t(district.th, district.en)}</span><span className="shrink-0 font-mono text-[18px] tabular-nums">{district.pm25.toFixed(1)}<span className="ml-1 text-[11px] font-normal text-[var(--dim)]">µg/m³</span></span></div><div aria-hidden="true" className="mt-2 h-1 bg-[var(--line)]"><div className="h-full bg-[var(--cool)]" style={{ width: `${Math.max(2, Math.min(100, district.pm25 / districtMax * 100))}%` }} /></div><p className="mt-2 text-[12px] leading-relaxed text-[var(--dim)]">{t(`${district.sensors} สถานี`, `${district.sensors} ${district.sensors === 1 ? "station" : "stations"}`)} · {sourceTime(district.observedAt, lang) ?? t("ไม่ทราบเวลาสังเกต", "observation time unknown")}</p></li>)}</ol>}
          <button type="button" onClick={onOpenMap} className="mt-4 inline-flex min-h-11 items-center gap-2 text-left text-[14px] font-semibold text-[var(--cool)]"><span>{t("ดูสถานีและช่องว่างบนแผนที่", "See stations and gaps on the map")}</span><ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0" /></button>
        </section>
      </div>

      <section aria-labelledby="executive-news" className="mt-8 border-t border-[var(--line)] pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--cool)]">{t("บริบทสาธารณะ", "Public context")}</p><h2 id="executive-news" className="mt-2 text-[27px] font-semibold">{t("เสียงจากพื้นที่และสื่อ", "Local voices and media")}</h2></div><p className="max-w-[26rem] text-[14px] leading-relaxed text-[var(--dim)]">{t("รายการข่าวเป็นบริบท ไม่ใช่การยืนยันเหตุการณ์จากหน่วยงาน", "News items are context, not confirmation of events by an agency.")}</p></div>
        {news.length === 0 ? <p className="mt-4 border-y border-[var(--line)] py-4 text-[15px] text-[var(--dim)]">{social?.provenance === "unavailable" ? t("ยังเข้าถึงแหล่งข่าวไม่ได้ จึงไม่มีรายการข่าวให้ยืนยัน", "The news sources cannot be reached yet, so there are no items to verify.") : t("ยังไม่มีรายการข่าวที่แสดงได้", "No news items to show yet.")}</p> : <div className="mt-6 grid gap-x-8 md:grid-cols-2">{news.map((item) => { const href = safeLink(item.url); const date = sourceTime(item.publishedAt, lang); return <article key={`${item.id}:${item.url ?? ""}`} className="min-w-0 border-t border-[var(--line)] py-5"><div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--dim)]"><span className="font-medium text-[var(--cool)]">{item.source === "google-news" ? "Google News" : item.source === "gdelt" ? "GDELT" : item.source}</span><span>{date ? <time dateTime={item.publishedAt}>{date}</time> : t("ไม่ทราบเวลาเผยแพร่", "publication time unknown")}</span></div><h3 lang={item.lang} className="text-[17px] font-semibold leading-relaxed [overflow-wrap:anywhere]">{href ? <a href={href} target="_blank" rel="noreferrer" className="group inline-flex min-h-11 items-start gap-3 hover:text-[var(--cool)]"><span className="line-clamp-3" title={item.title}>{item.title}</span><ArrowUpRight aria-hidden="true" className="mt-1.5 h-4 w-4 shrink-0" /></a> : item.title}</h3></article>; })}</div>}
        {social?.unavailableReason && <details className="mt-3 text-[13px] leading-relaxed text-[var(--dim)]"><summary className="min-h-11 cursor-pointer py-3">{t("ข้อจำกัดการเข้าถึงแหล่งข่าว", "News source access limits")}</summary><p>{social.unavailableReason}</p></details>}
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] pt-4"><p className="max-w-[42rem] text-[14px] leading-relaxed text-[var(--dim)]">{t("แสดงแหล่งที่มา เวลาเมื่อมี และช่องว่างของข้อมูล ข้อมูลที่ขาดไม่ได้แปลว่าสถานการณ์ปลอดภัย", "Sources, times where available, and data gaps are shown. Missing data does not mean the situation is safe.")}</p><button type="button" onClick={onOpenData} className="inline-flex min-h-11 shrink-0 items-center gap-2 border border-[var(--line)] px-3 py-2 text-[14px] font-semibold text-[var(--cool)]">{t("เปิดคลังข้อมูล", "Open the data library")}<ArrowUpRight aria-hidden="true" className="h-4 w-4" /></button></div>
    </section>
  );
}
