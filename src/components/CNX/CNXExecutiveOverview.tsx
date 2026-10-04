"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Check, ChevronRight, FileText, Flame, Map, Phone, Plane, Radio, Waves, Wind, type LucideIcon } from "lucide-react";
import type { AirQualityResponse, CnxFiresResponse, SocialListeningResponse } from "../../types/cnx";
import type { DustboyResponse } from "../../lib/cnx/dustboy";
import type { CnxTwinResponse } from "../../lib/cnx/twin";
import type { RiverGauge } from "../../lib/cnx/river-level";
import type { FetchResult } from "../../lib/cnx/opensky";
import { buildExecutiveBrief, type ExecutiveMetric } from "../../lib/cnx/executive-brief";

interface Props {
  air: AirQualityResponse | null;
  dustboy: DustboyResponse | null;
  fires: CnxFiresResponse | null;
  twin: CnxTwinResponse | null;
  riverGauges: RiverGauge[];
  flights: FetchResult | null;
  social: SocialListeningResponse | null;
  onOpenMap: () => void;
  onOpenBrief: () => void;
  onOpenEmergency: () => void;
  onOpenData: () => void;
  onOpenHaze: () => void;
}

const ICONS: Record<ExecutiveMetric["id"], LucideIcon> = { water: Waves, air: Wind, fire: Flame, mobility: Plane };
const SOURCE_TIME = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});

function sourceTime(value: string | null | undefined): string | null {
  const date = Date.parse(value ?? "");
  return Number.isFinite(date) ? `${SOURCE_TIME.format(date)} น. (กรุงเทพฯ)` : null;
}

function safeLink(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

function Metric({ metric, onOpen }: { metric: ExecutiveMetric; onOpen: () => void }) {
  const Icon = ICONS[metric.id];
  const concern = metric.state === "current" && ["watch", "alert", "critical"].includes(metric.level);
  const state = metric.state === "stale" ? "ข้อมูลเก่า" : metric.state === "unavailable" ? "ข้อมูลไม่เพียงพอ" : concern ? "ควรติดตาม" : metric.level === "unknown" ? "ยังประเมินไม่ได้" : "มีข้อมูล";
  const date = sourceTime(metric.observedAt);
  return (
    <article className="flex min-w-0 flex-col border-b border-[var(--line)] py-6 sm:px-6 xl:border-b-0 xl:border-r xl:last:border-r-0">
      <div className="flex items-start justify-between gap-3">
        <Icon aria-hidden="true" className="h-6 w-6 shrink-0 text-[var(--cool)]" strokeWidth={1.5} />
        <span className={`rounded-full border px-2.5 py-1 text-[12px] ${metric.state !== "current" ? "border-[var(--line)] text-[var(--dim)]" : concern ? "border-[var(--sun)] bg-[var(--sun-dim)] text-[var(--ink)]" : "border-[var(--line)] text-[var(--dim)]"}`}>{state}</span>
      </div>
      <h2 lang="th" className="mt-5 text-[17px] font-semibold leading-snug">{metric.titleTh}</h2>
      <p className="mt-1 text-[12px] uppercase tracking-[0.1em] text-[var(--dim)]">{metric.titleEn}</p>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-[38px] font-medium leading-none tracking-[-0.05em] tabular-nums sm:text-[42px]">{metric.value}</span>
        <span className="text-[14px] text-[var(--dim)]">{metric.unit}</span>
      </div>
      <p lang="th" className="mt-4 text-[14px] leading-relaxed text-[var(--dim)]">{metric.summaryTh}</p>
      <div className="mt-auto pt-5">
        <p className="text-[12px] font-medium text-[var(--ink)]">{metric.source}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--dim)]">{date ? <>สังเกตเมื่อ <time dateTime={metric.observedAt ?? undefined}>{date}</time></> : metric.state === "current" && metric.id === "fire" && metric.value === "0" ? "ไม่พบจุดตรวจจับที่จะระบุเวลาสังเกต · ดูกรอบเวลาของแหล่งข้อมูล" : "ไม่มีเวลาสังเกตที่ยืนยันได้"}</p>
        <button type="button" onClick={onOpen} className="mt-4 flex min-h-11 w-full items-center justify-between gap-2 border-t border-[var(--line)] pt-3 text-left text-[14px] font-semibold text-[var(--cool)]">
          <span lang="th">{metric.id === "air" ? "ดูหลักฐานคุณภาพอากาศ" : "ดูตำแหน่งและแหล่งข้อมูล"}</span><ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0" />
        </button>
      </div>
    </article>
  );
}

/** An abstract river rhythm, not a map, observation or geographic boundary. */
function RiverRhythm() {
  return (
    <svg aria-hidden="true" viewBox="0 0 360 380" fill="none" className="h-full w-full" focusable="false">
      <circle cx="195" cy="182" r="130" stroke="white" strokeOpacity="0.12" />
      <circle cx="195" cy="182" r="91" stroke="white" strokeOpacity="0.12" />
      <path d="M-20 87C75 8 163 33 140 117C115 208 312 173 254 262C230 299 287 331 372 345" stroke="var(--sun)" strokeWidth="2.5" />
      <path d="M-20 103C66 32 141 55 119 120C92 211 284 195 236 261C205 305 259 350 356 363" stroke="white" strokeOpacity="0.28" />
      <path d="M-20 120C55 58 119 77 98 125C69 215 256 216 214 261C185 295 225 366 333 380" stroke="white" strokeOpacity="0.12" />
      <path d="M65 180H320M195 52V311" stroke="white" strokeOpacity="0.09" strokeDasharray="3 7" />
      <circle cx="195" cy="182" r="5" fill="var(--sun)" />
      <path d="M191 178L199 186M199 178L191 186" stroke="var(--wada-counter,#12354e)" />
    </svg>
  );
}

export default function CNXExecutiveOverview({ air, dustboy, fires, twin, riverGauges, flights, social, onOpenMap, onOpenBrief, onOpenEmergency, onOpenData, onOpenHaze }: Props) {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const brief = useMemo(() => buildExecutiveBrief({ air, dustboy, fires, twin, riverGauges, flights, now: clock }), [air, dustboy, fires, twin, riverGauges, flights, clock]);
  const news = (social?.items ?? []).filter((item) => item.tone !== "demo").slice(0, 4);
  const priority = { critical: 0, alert: 1, watch: 2, unknown: 3, good: 4 };
  const checks = brief.metrics.filter((metric) => metric.state !== "current" || metric.level === "unknown" || ["watch", "alert", "critical"].includes(metric.level))
    .sort((a, b) => priority[a.level] - priority[b.level]);
  const nextChecks = checks.length ? checks : brief.metrics.slice(0, 2);
  const districtMax = Math.max(1, ...brief.districts.map((district) => district.pm25));

  return (
    <section aria-label="ภาพรวมเชียงใหม่เพื่อการตัดสินใจ" className="mx-auto w-full max-w-[1600px] px-5 pb-12 pt-5 text-[var(--ink)] sm:px-8 sm:pt-6 lg:px-12">
      <div className="relative grid overflow-hidden rounded-[2px] bg-[var(--wada-counter,#12354e)] text-white lg:grid-cols-12">
        <div className="relative z-10 px-6 py-5 sm:px-8 sm:py-7 lg:col-span-8 lg:px-10 lg:py-7">
          <div className="mb-3 flex items-center gap-3"><span className="h-px w-10 bg-[var(--sun)]" /><p lang="th" className="text-[13px] tracking-wide text-white/75">ข้อมูลเพื่อการตัดสินใจของจังหวัด</p></div>
          <h1 lang="th" className="font-display text-[28px] font-semibold leading-[1.22] tracking-[-0.025em] sm:text-[42px] lg:text-[46px]">เชียงใหม่ ในภาพเดียว</h1>
          <p lang="th" className="mt-3 max-w-[40rem] text-[16px] leading-relaxed text-white/90 sm:text-[19px]">{brief.headlineTh}</p>
          <p className="mt-2 hidden max-w-[36rem] text-[13px] leading-relaxed text-white/65 sm:block">{brief.headlineEn}</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button type="button" onClick={onOpenBrief} className="inline-flex min-h-12 items-center justify-center gap-3 bg-[var(--sun)] px-5 py-3 text-[15px] font-semibold text-[#111]"><FileText aria-hidden="true" className="h-5 w-5" />เปิดรายงานสำหรับผู้ว่าฯ<ArrowUpRight aria-hidden="true" className="h-4 w-4" /></button>
            <button type="button" onClick={onOpenMap} className="inline-flex min-h-12 items-center justify-center gap-3 border border-white/35 px-5 py-3 text-[15px] font-semibold text-white hover:bg-white/10"><Map aria-hidden="true" className="h-5 w-5" />สำรวจบนแผนที่</button>
          </div>
        </div>
        <div className="relative hidden min-h-[260px] lg:col-span-4 lg:block"><div className="absolute inset-0 -left-12"><RiverRhythm /></div><p lang="th" className="absolute bottom-12 right-10 text-[12px] tracking-[0.12em] text-white/60">วัด · ตรวจสอบ · ตัดสินใจ</p></div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] sm:text-[14px]">
        <span className="inline-flex items-center gap-2"><Check aria-hidden="true" className="h-4 w-4 text-[var(--cool)]" />{brief.observedCount} ด้านมีหลักฐานในกรอบเวลา</span>
        <span className="inline-flex items-center gap-2 text-[var(--dim)]"><Radio aria-hidden="true" className="h-4 w-4" />{brief.unknownCount} ด้านยังประเมินระดับไม่ได้</span>
        {brief.attentionCount > 0 && <span className="border-l border-[var(--line)] pl-6 text-[var(--ink)]">{brief.attentionCount} ด้านควรติดตามเป็นพิเศษ</span>}
      </div>

      <div className="mt-7 grid border-y border-[var(--line)] sm:grid-cols-2 xl:grid-cols-4">
        {brief.metrics.map((metric) => <Metric key={metric.id} metric={metric} onOpen={metric.id === "air" ? onOpenHaze : onOpenMap} />)}
      </div>

      <div className="mt-12 grid gap-x-12 gap-y-12 lg:grid-cols-12">
        <section aria-labelledby="executive-priorities" className="lg:col-span-7">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--cool)]">Decision desk</p><h2 id="executive-priorities" lang="th" className="mt-2 text-[26px] font-semibold leading-snug sm:text-[30px]">สิ่งที่ควรตรวจสอบต่อ</h2></div><ArrowDownRight aria-hidden="true" className="mt-7 h-7 w-7 shrink-0 text-[var(--sun)]" /></div>
          <p lang="th" className="mt-3 max-w-[38rem] text-[14px] leading-relaxed text-[var(--dim)]">เริ่มจากด้านที่ต้องติดตามและข้อมูลที่ยังขาด ก่อนกำหนดการดำเนินงานร่วมกับหน่วยงานเจ้าของข้อมูล</p>
          <ol className="mt-6 border-t border-[var(--line)]">
            {nextChecks.map((metric, index) => <li key={metric.id} className="grid grid-cols-[2rem_1fr] gap-4 border-b border-[var(--line)] py-5"><span className="pt-1 font-mono text-[15px] tabular-nums text-[var(--dim)]">0{index + 1}</span><div><h3 lang="th" className="text-[17px] font-semibold">{metric.titleTh}</h3><p lang="th" className="mt-2 text-[15px] leading-relaxed text-[var(--dim)]">{metric.actionTh}</p><button type="button" onClick={metric.id === "air" ? onOpenHaze : onOpenMap} className="mt-2 inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold text-[var(--cool)]">ตรวจหลักฐาน<ChevronRight aria-hidden="true" className="h-4 w-4" /></button></div></li>)}
          </ol>
          <button type="button" onClick={onOpenEmergency} className="mt-6 inline-flex min-h-12 items-center gap-3 border border-[var(--line)] px-4 py-3 text-[14px] font-semibold"><Phone aria-hidden="true" className="h-4 w-4 text-[var(--cool)]" />ติดต่อหน่วยงานและหมายเลขฉุกเฉิน<ArrowUpRight aria-hidden="true" className="h-4 w-4 text-[var(--dim)]" /></button>
        </section>

        <section aria-labelledby="executive-coverage" className="min-w-0 border border-[var(--line)] bg-[var(--bg-surface)] p-6 sm:p-7 lg:col-span-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--cool)]">Ground evidence</p><h2 id="executive-coverage" lang="th" className="mt-2 text-[25px] font-semibold leading-snug">พื้นที่ที่เรามองเห็น</h2>
          <div className="mt-5 flex items-baseline gap-3"><span className="font-mono text-[44px] leading-none tabular-nums">{brief.measuredDistrictCount}</span><span lang="th" className="text-[14px] text-[var(--dim)]">อำเภอมีข้อมูล DustBoy ที่ใช้ได้</span></div>
          <p lang="th" className="mt-3 text-[14px] leading-relaxed text-[var(--dim)]">เรียงจากค่า PM2.5 เฉลี่ยสูงสุดเฉพาะสถานีที่ใช้ได้ในเชียงใหม่ ไม่ใช่ตัวแทนทุกพื้นที่ของอำเภอ</p>
          {brief.districts.length === 0 ? <p lang="th" className="mt-8 border-t border-[var(--line)] pt-5 text-[15px] leading-relaxed">ยังไม่มีข้อมูลตรวจวัดรายอำเภอที่ผ่านเงื่อนไข จึงไม่จัดอันดับพื้นที่</p> : <ol className="mt-6 space-y-5">{brief.districts.slice(0, 5).map((district, index) => <li key={district.th}><div className="flex items-baseline justify-between gap-3"><span lang="th" className="text-[16px] font-semibold"><span className="mr-2 font-mono text-[12px] font-normal text-[var(--dim)]">0{index + 1}</span>{district.th}</span><span className="shrink-0 font-mono text-[18px] tabular-nums">{district.pm25.toFixed(1)}<span className="ml-1 text-[11px] font-normal text-[var(--dim)]">µg/m³</span></span></div><div aria-hidden="true" className="mt-2 h-1 bg-[var(--line)]"><div className="h-full bg-[var(--cool)]" style={{ width: `${Math.max(2, Math.min(100, district.pm25 / districtMax * 100))}%` }} /></div><p className="mt-2 text-[12px] leading-relaxed text-[var(--dim)]">{district.sensors} สถานี · {sourceTime(district.observedAt) ?? "ไม่ทราบเวลาสังเกต"}</p></li>)}</ol>}
          <button type="button" onClick={onOpenMap} className="mt-6 flex min-h-11 w-full items-center justify-between gap-3 border-t border-[var(--line)] pt-4 text-left text-[14px] font-semibold text-[var(--cool)]"><span lang="th">ดูสถานีและช่องว่างบนแผนที่</span><ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0" /></button>
        </section>
      </div>

      <section aria-labelledby="executive-news" className="mt-12 border-t border-[var(--line)] pt-7">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--cool)]">Public context</p><h2 id="executive-news" lang="th" className="mt-2 text-[27px] font-semibold">เสียงจากพื้นที่และสื่อ</h2></div><p lang="th" className="max-w-[26rem] text-[14px] leading-relaxed text-[var(--dim)]">รายการข่าวเป็นบริบท ไม่ใช่การยืนยันเหตุการณ์จากหน่วยงาน</p></div>
        {news.length === 0 ? <p lang="th" className="mt-6 border-y border-[var(--line)] py-6 text-[15px] text-[var(--dim)]">{social?.provenance === "unavailable" ? "ยังเข้าถึงแหล่งข่าวไม่ได้ จึงไม่มีรายการข่าวให้ยืนยัน" : "ยังไม่มีรายการข่าวที่แสดงได้"}</p> : <div className="mt-6 grid gap-x-8 md:grid-cols-2">{news.map((item) => { const href = safeLink(item.url); const date = sourceTime(item.publishedAt); return <article key={`${item.id}:${item.url ?? ""}`} className="min-w-0 border-t border-[var(--line)] py-5"><div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--dim)]"><span className="font-medium text-[var(--cool)]">{item.source === "google-news" ? "Google News" : item.source === "gdelt" ? "GDELT" : item.source}</span><span>{date ? <time dateTime={item.publishedAt}>{date}</time> : "ไม่ทราบเวลาเผยแพร่"}</span></div><h3 lang={item.lang} className="text-[17px] font-semibold leading-relaxed [overflow-wrap:anywhere]">{href ? <a href={href} target="_blank" rel="noreferrer" className="group inline-flex min-h-11 items-start gap-3 hover:text-[var(--cool)]"><span className="line-clamp-3" title={item.title}>{item.title}</span><ArrowUpRight aria-hidden="true" className="mt-1.5 h-4 w-4 shrink-0" /></a> : item.title}</h3></article>; })}</div>}
        {social?.unavailableReason && <details className="mt-3 text-[13px] leading-relaxed text-[var(--dim)]"><summary className="min-h-11 cursor-pointer py-3">ข้อจำกัดการเข้าถึงแหล่งข่าว</summary><p>{social.unavailableReason}</p></details>}
      </section>

      <div className="mt-10 flex flex-col gap-4 border-t border-[var(--line)] pt-6 sm:flex-row sm:items-center sm:justify-between"><p lang="th" className="max-w-[42rem] text-[14px] leading-relaxed text-[var(--dim)]">แสดงแหล่งที่มา เวลาเมื่อมี และช่องว่างของข้อมูล ข้อมูลที่ขาดไม่ได้แปลว่าสถานการณ์ปลอดภัย</p><button type="button" onClick={onOpenData} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-3 border border-[var(--line)] px-4 py-3 text-[14px] font-semibold text-[var(--cool)]">เปิดคลังข้อมูล<ArrowUpRight aria-hidden="true" className="h-4 w-4" /></button></div>
    </section>
  );
}
