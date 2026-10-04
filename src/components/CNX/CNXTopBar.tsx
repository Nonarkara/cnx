"use client";

// CNX top bar — province identity + manual + story opener.
//
// Replaces the existing minimal CNXTopBar with a richer version that
// shows live flood/air/fires/social counters in the masthead.

import { useEffect, useState } from "react";
import { Bell, BookOpen, Database, FileText, FlaskConical, Moon, PhoneCall, Sun, Wind, LayoutDashboard, Map as MapIcon } from "lucide-react";
import { useDarkMode } from "../../hooks/useDarkMode";
import CNXLogoRow from "./CNXLogoRow";
import { lookupAircraft } from "../../lib/cnx/aircraft";
import CnxTimezoneStrip, { type TimezoneOrigin } from "./CNXTimezoneStrip";
import type {
  AirQualityResponse,
  CctvFeedResponse,
  CnxFiresResponse,
  CnxFloodResponse,
  CnxStoryResponse,
  OfficeNotice,
  SocialListeningResponse,
} from "../../types/cnx";
import type { CnxTwinResponse } from "../../lib/cnx/twin";
import type { DustboyResponse } from "../../lib/cnx/dustboy";
import type { AsmcResponse } from "../../lib/cnx/asmc";
import type { SmokeTrajectoryResponse } from "../../lib/cnx/smoke-trajectory";
import { HOTLINES } from "../../lib/cnx/verdict";
import type { FetchResult } from "../../lib/cnx/opensky";
import type { RfdFiresResponse } from "../../lib/cnx/fire-rfd";
import type { AerosolResponse } from "../../lib/cnx/aerosol";

interface TopBarProps {
  compact?: boolean;
  view: "overview" | "map";
  onChangeView: (view: "overview" | "map") => void;
  flood: CnxFloodResponse | null;
  air: AirQualityResponse | null;
  fires: CnxFiresResponse | null;
  firesRfd: RfdFiresResponse | null;
  aerosol: AerosolResponse | null;
  social: SocialListeningResponse | null;
  cctv: CctvFeedResponse | null;
  story: CnxStoryResponse | null;
  flights: FetchResult | null;
  scenarioId: string | null;
  topOrigins: TimezoneOrigin[];
  twin: CnxTwinResponse | null;
  dustboy: DustboyResponse | null;
  asmc: AsmcResponse | null;
  smoke: SmokeTrajectoryResponse | null;
  onOpenStory: () => void;
  onOpenManual: () => void;
  onOpenResearch: () => void;
  onOpenData: () => void;
  onOpenHaze: () => void;
  onOpenBrief: () => void;
  onOpenEmergency: () => void;
}

function Pill({
  label,
  value,
  level,
  title,
}: {
  label: string;
  value: string;
  level?: "good" | "watch" | "alert" | "critical" | "unknown";
  title?: string;
}) {
  const colour =
    level === "critical"
      ? "bg-[var(--danger)] text-white"
      : level === "alert"
      ? "bg-[#fb923c] text-black"
      : level === "watch"
      ? "bg-[#f99d1b] text-black"
      : "bg-[var(--bg-raised)] text-[var(--ink)] border border-[var(--line)]";
  return (
    // These are read, not tapped, so the touch-target rule does not apply —
    // legibility does. 9px/8px type is fine on a desk monitor and
    // unreadable on a phone held at arm's length, which is how the governor
    // will actually read a PM2.5 number. Step both up on small screens and
    // let the row wrap rather than shrink.
    <div
      title={title}
      className={`flex items-center gap-1.5 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] min-h-8 sm:min-h-0 text-[11px] sm:text-[9px] ${colour}`}
    >
      <span className="text-[8px] text-[var(--dim)] sm:text-[8px] text-[9px]">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Province-level verdict strip — the unified risk surface.
 *
 * This is the FIRST thing the operator sees after the masthead.
 * Bilingual headline + top reason + checklist + hotlines so the
 * wall reads as a war-room board, not a dashboard. Mirrors the
 * FloodDash / AirDash /api/twin verdict surface — see the sibling
 * repos and docs/TWIN-API.md for the contract.
 */
export function VerdictStrip({
  twin,
  onOpenEmergency,
  compact = false,
}: {
  twin: CnxTwinResponse;
  onOpenEmergency: () => void;
  compact?: boolean;
}) {
  const v = twin.verdict;
  const level = v.level;
  // Match the existing topbar pill palette so the strip reads as
  // part of the same chrome, not a foreign block.
  const colour =
    level === "danger"
      ? "border-[var(--danger)] bg-[var(--sun-dim)] text-[var(--danger)]"
      : level === "prepare"
      ? "border-[#fb923c] bg-[#fb923c]/10 text-[#fb923c]"
      : level === "watch"
      ? "border-[#f99d1b] bg-[#f99d1b]/10 text-[#f99d1b]"
      : "border-[var(--line)] bg-[var(--bg)] text-[var(--ink)]";
  const chipLabel =
    level === "danger"
      ? "DANGER"
      : level === "prepare"
      ? "PREPARE"
      : level === "watch"
      ? "WATCH"
      : "NO ELEVATED SIGNAL";
  const topReason = v.reasons[0];
  const caveats = v.reasons.filter((r) => r.isCaveat);
  const evidenceLabel = v.data_provenance === "live" ? "Current measured / modeled evidence" : v.data_provenance === "mixed" ? "Mixed evidence — check limitations" : "Current evidence incomplete";
  const action = level === "danger"
    ? "Follow official instructions for the affected area now. Verify the listed evidence gaps alongside response preparations."
    : level === "prepare"
    ? "Check official local instructions and prepare the relevant response; confirm any missing readings."
    : caveats.length > 0
    ? "Verify missing or old readings and check local official notices before deciding."
    : level === "safe"
    ? "Continue monitoring local gauges and official notices; this board is not an all-clear."
    : level === "watch"
    ? "Monitor the reported hazard and confirm conditions at the affected location."
    : "Check official instructions for the affected area and prepare the relevant response.";
  const actionTh = level === "danger"
    ? "ปฏิบัติตามคำสั่งทางการในพื้นที่ทันที และตรวจสอบข้อมูลที่ขาดควบคู่กัน"
    : level === "prepare"
    ? "ตรวจสอบประกาศในพื้นที่และเตรียมการรับมือ พร้อมยืนยันค่าที่ขาด"
    : caveats.length > 0
    ? "ยืนยันค่าที่ขาดหรือเก่าและตรวจสอบประกาศทางการก่อนตัดสินใจ"
    : level === "safe"
    ? "ติดตามสถานีวัดและประกาศในพื้นที่ต่อไป — ยังไม่ใช่การยืนยันว่าปลอดภัย"
    : "ติดตามความเสี่ยงที่รายงานและยืนยันสภาพจริงในพื้นที่";
  const evidence = <>
      {compact && <p className="mb-3 text-[12px] leading-relaxed">{v.head_en}</p>}
      {topReason && (
        <div className="flex flex-col gap-1 text-[12px] leading-relaxed">
          {[
            // Three observations, then every caveat. A blind flood axis is
            // the reason a wall is dangerous to read at a glance, so it must
            // never be the line that gets cut for space.
            ...v.reasons.filter((r) => !r.isCaveat && r !== topReason).slice(0, 2),
            ...v.reasons.filter((r) => r.isCaveat),
          ].map((reason) => (
            <div key={`${reason.domain}-${reason.evidence ?? reason.en}`} className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-mono uppercase tracking-[0.14em] opacity-60">
                {reason.isCaveat ? "Evidence gap" : reason.domain === "twins" ? "Combined hazards" : reason.domain}
              </span>
              <span className={reason.isCaveat ? "italic opacity-90" : undefined}>{reason.th}</span>
              <span className="font-mono opacity-70">— {reason.en}</span>
            </div>
          ))}
        </div>
      )}
      <p className="pt-1 text-[12px] font-semibold leading-relaxed">
        ขั้นตอนต่อไป: {actionTh}<br /><span className="font-normal opacity-90">Next step: {action}</span>
      </p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onOpenEmergency}
          className="min-h-11 border border-current px-4 py-1 text-[12px] font-bold hover:bg-[var(--bg-raised)]"
        >
          Official hotlines
        </button>
        <details className="min-w-0 flex-1 text-[12px]">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">Planning checklist &amp; evidence details</summary>
          <p className="mb-2 opacity-80">Suggested planning checks; actions and evacuation orders must follow the responsible authority.</p>
          <ul className="list-disc space-y-2 pl-5 leading-relaxed">
            {v.checklist.map((item) => <li key={item.en}>{item.th}<br /><span className="opacity-80">{item.en}</span></li>)}
          </ul>
          <p className="mt-3 text-[11px] opacity-70">Dashboard heuristic score {v.score}/100; {v.band} band. This is not an event probability or an official warning.</p>
          {v.reasons.filter((r) => r.evidence).map((reason) => <p key={reason.evidence} className="mt-1 break-words font-mono text-[10px] opacity-70">{reason.domain}: {reason.evidence}</p>)}
        </details>
      </div>
  </>;
  return (
    <div className={`flex flex-col gap-1 border-l-4 px-3 py-2 ${colour}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
          {compact && level === "safe" ? "สถานการณ์ · CONTEXT" : chipLabel}
        </span>
        <span className="text-[11px] leading-relaxed opacity-80">
          {evidenceLabel}
        </span>
        <span className={`${compact ? "hidden" : ""} ml-auto font-mono text-[9px] uppercase tracking-[0.14em] opacity-70`}>
          {twin.province_en} · ปภ. {HOTLINES.ddpm} · EMS {HOTLINES.ems}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="font-display text-[15px] font-bold leading-tight">{v.head_th}</div>
        <div className={`${compact ? "hidden" : ""} text-[12px] leading-relaxed opacity-90`}>
          {v.head_en}
        </div>
      </div>
      {compact ? <details className="text-[12px]"><summary className="min-h-11 cursor-pointer py-3 font-semibold">ตรวจเหตุผลและข้อจำกัด · Evidence</summary>{evidence}</details> : evidence}
    </div>
  );
}

/**
 * The bar's one-line verdict. The full reasoning moved onto the map as a
 * floating card (see CNXApp) so the map gets the height back, but the
 * province level must never leave the bar — it is the single number an
 * operator reads from across the room. Colour and word, nothing more.
 */
export function VerdictChip({ twin }: { twin: CnxTwinResponse }) {
  const v = twin.verdict;
  const level = v.level;
  const colour =
    level === "danger"
      ? "border-[var(--danger)] bg-[var(--danger)] text-white"
      : level === "prepare"
      ? "border-[#fb923c] bg-[#fb923c] text-black"
      : level === "watch"
      ? "border-[#f99d1b] bg-[#f99d1b] text-black"
      : "border-[var(--line)] bg-[var(--bg)] text-[var(--ink)]";
  const chipLabel =
    level === "danger"
      ? "DANGER"
      : level === "prepare"
        ? "PREPARE"
        : level === "watch"
          ? "WATCH"
          : "NO ELEVATED SIGNAL";
  return (
    <div
      className={`flex h-7 shrink-0 items-center gap-1.5 border px-2 ${colour}`}
      title={v.head_th || v.head_en || chipLabel}
    >
      <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em]">{chipLabel}</span>
      <span className="hidden max-w-[22ch] truncate font-mono text-[9px] uppercase tracking-[0.1em] opacity-80 sm:inline">
        {v.head_th || v.head_en || ""}
      </span>
    </div>
  );
}

export default function CnxTopBar(props: TopBarProps) {
  const { compact = false, view, onChangeView, flood, air, fires, firesRfd, aerosol, social, cctv, flights, topOrigins, twin, dustboy, asmc, smoke, onOpenStory, onOpenManual, onOpenResearch, onOpenData, onOpenHaze, onOpenBrief, onOpenEmergency } = props;
  const rfdReserveCount = firesRfd ? (firesRfd.byType.DNP ?? 0) + (firesRfd.byType.NRF ?? 0) : 0;
  const [isDark, toggleDark] = useDarkMode();
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Bangkok" }));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const officeNotice: OfficeNotice | undefined = air?.office ?? flood?.office;
  const widebodyCount = flights
    ? [...flights.airborne, ...flights.ground].filter((f) => ["heavy", "wide"].includes(lookupAircraft(f.typecode).size)).length
    : 0;

  return (
    // The bar is chrome, not content. It used to run ~180 px: a version
    // row of its own, a 19 px wordmark, a pill row that wrapped onto three
    // lines, and the full verdict block with every reason spelled out. On
    // a war-room display that is most of the vertical budget spent on
    // furniture while the map — the thing that carries the geography — got
    // the remainder. The bar is now one 32 px row plus a single-line pill
    // strip; full verdict reasoning sits above the news rail or mobile map.
    <header className={`relative z-30 flex shrink-0 flex-col border-b border-[var(--line)] bg-[var(--bg-raised)] ${compact ? "cnx-executive-header" : "cnx-operation-header"} px-4 py-2 sm:px-6`}>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <a href="/cnx" aria-label="CNX War Room home" className="cnx-brand-plate flex h-9 w-[72px] shrink-0 items-center justify-center px-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/cnx-mark.png" alt="" width={60} height={28} className="block h-7 w-[60px] object-contain" />
          </a>
          <div className="min-w-0 leading-none">
            <div className="font-display text-[13px] font-bold text-[var(--ink)]">
              เชียงใหม่ · <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--cool)]">War Room</span>
            </div>
          </div>
          <CNXLogoRow size={16} />
          <span
            className="shrink-0 bg-[var(--ink)] px-1 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] text-[var(--bg)]"
            title={`build ${process.env.NEXT_PUBLIC_GIT_SHA ?? "local"} · ${now}`}
          >
            v{process.env.NEXT_PUBLIC_APP_VERSION}
            {process.env.NEXT_PUBLIC_GIT_SHA ? `·${process.env.NEXT_PUBLIC_GIT_SHA.slice(0, 7)}` : ""}
          </span>
        </div>



        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          {officeNotice && (
            <button
              className="flex min-h-11 items-center gap-1.5 border border-[var(--danger)] bg-[var(--sun-dim)] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--danger)] sm:min-h-0 sm:px-2 sm:py-1 sm:text-[9px]"
              title={officeNotice.title}
            >
              <Bell className="h-3 w-3" />
              {officeNotice.level.toUpperCase()}
            </button>
          )}
          <button type="button" onClick={() => onChangeView(view === "map" ? "overview" : "map")} className="flex min-h-11 items-center gap-2 border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)]">{view === "map" ? <LayoutDashboard aria-hidden="true" className="h-4 w-4" /> : <MapIcon aria-hidden="true" className="h-4 w-4" />}<span lang="th">{view === "map" ? "ภาพรวมจังหวัด" : "ห้องปฏิบัติการ"}</span></button>
<button
            onClick={onOpenBrief}
            title="One-screen summary for the governor — copy to LINE or print"
            className="hidden min-h-11 items-center gap-1.5 border border-[var(--wada-counter)] sm:flex bg-[var(--wada-counter)] px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.04em] text-white hover:opacity-90 "
          >
            <FileText className="h-3 w-3" />
            <span lang="th"><span className="sm:hidden">สรุปผู้ว่าฯ</span><span className="hidden sm:inline">Brief ผู้ว่าฯ</span></span>
          </button>
<button
            onClick={onOpenEmergency}
            className="flex min-h-11 items-center gap-1.5 border border-[var(--danger)] bg-[var(--bg)] px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white "
          >
            <PhoneCall className="h-3 w-3" />
            <span lang="th" className="sm:hidden">ฉุกเฉิน</span><span className="hidden sm:inline">Emergency</span>
          </button>
          <details className="relative">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 border border-[var(--line)] px-3 text-[13px] font-semibold"><span className="sm:hidden">เมนู</span><span className="hidden sm:inline">เครื่องมือ</span> <span aria-hidden="true">⌄</span></summary>
            <div className="absolute right-0 top-full z-50 mt-2 grid w-64 gap-2 border border-[var(--line)] bg-[var(--bg-raised)] p-3 shadow-xl"><button type="button" onClick={onOpenBrief} className="min-h-11 border border-[var(--line)] px-3 text-left text-[13px] font-semibold sm:hidden">สรุปสำหรับผู้ว่าฯ</button><button
            onClick={onOpenData}
            className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] bg-[var(--bg)] px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.04em] hover:border-[var(--cool)] hover:bg-[var(--cool-dim)] "
          >
            <Database className="h-3 w-3" />
            Data
          </button><button
            onClick={onOpenHaze}
            className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] bg-[var(--bg)] px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.04em] hover:border-[var(--cool)] hover:bg-[var(--cool-dim)] "
          >
            <Wind className="h-3 w-3" />
            Haze
          </button><button
            onClick={onOpenStory}
            className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] bg-[var(--bg)] px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.04em] hover:border-[var(--sun)] hover:bg-[var(--sun-dim)] "
          >
            <BookOpen className="h-3 w-3" />
            Story
          </button><button
            onClick={onOpenManual}
            className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] bg-[var(--bg)] px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.04em] hover:border-[var(--cool)] hover:bg-[var(--cool-dim)] "
          >
            <BookOpen className="h-3 w-3" />
            Manual
          </button><button
            onClick={onOpenResearch}
            className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] bg-[var(--bg)] px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.04em] hover:border-[var(--sun)] hover:bg-[var(--sun-dim)] "
          >
            <FlaskConical className="h-3 w-3" />
            Research
          </button>
          <a href="/cnx/about#web-app" className="flex min-h-11 items-center border border-[var(--line)] px-3 text-[13px] font-semibold">เว็บแอป · Android &amp; iPhone</a>
      {!compact && <details className="border-t border-[var(--line)]">
        <summary className="min-h-11 cursor-pointer border border-[var(--line)] px-3 py-3 text-[12px] font-semibold">สถานะแหล่งข้อมูล · Feed status</summary>
        <div className="min-w-0 max-w-full border border-[var(--line)] p-3">{twin && <VerdictChip twin={twin} />}      <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Pill label="PM2.5" value={air?.provinceAvgPm25 != null ? `${air.provinceAvgPm25}` : "—"} level={air?.provinceAvgAqiLevel} />
        <Pill
          label={flood?.provenance === "scenario" ? "Scenario Ping" : "Ping model"}
          value={typeof flood?.pingCapacityFraction === "number" ? `${((flood?.pingCapacityFraction ?? 0) * 100).toFixed(0)}%` : "—"}
          title="Flood-model/scenario context; measured river levels are listed separately"
          level={flood?.provenance === "live" ? (flood.pingCapacityFraction ?? 0) > 0.85 ? "critical" : (flood.pingCapacityFraction ?? 0) > 0.7 ? "alert" : undefined : undefined}
        />
        <Pill
          label="DustBoy"
          title={
            dustboy?.provenance === "live"
              ? `Chiang Mai ${dustboy.basin.chiangMai.onlineCount} sensors with a reading under 3 h${
                  dustboy.basin.chiangMai.newestReadingAgeHours !== null
                    ? ` · newest ${dustboy.basin.chiangMai.newestReadingAgeHours} h old`
                    : ""
                } · upper-north avg ${dustboy.basin.avgPm25 ?? "—"} µg/m³`
              : dustboy?.note ?? undefined
          }
          value={
            dustboy?.provenance === "live" && dustboy.basin.chiangMai.avgPm25 !== null
              ? `${dustboy.basin.chiangMai.avgPm25} (${dustboy.basin.chiangMai.onlineCount})`
              : dustboy?.provenance === "live"
              ? "stale"
              : dustboy
              ? "offline"
              : "—"
          }
          level={
            dustboy?.provenance === "live" && dustboy.basin.chiangMai.avgPm25 !== null
              ? dustboy.basin.chiangMai.avgPm25 >= 90
                ? "critical"
                : dustboy.basin.chiangMai.avgPm25 >= 50
                ? "alert"
                : dustboy.basin.chiangMai.avgPm25 >= 25
                ? "watch"
                : undefined
              : undefined
          }
        />
        <Pill label="RFD" value={firesRfd?.provenance === "live" ? `${firesRfd.totalCount}` : "—"} title={firesRfd?.note ?? undefined} level={firesRfd?.provenance === "live" ? rfdReserveCount > 5 ? "critical" : firesRfd.totalCount > 0 ? "watch" : undefined : undefined} />
        <Pill
          label="FIRMS"
          // A rejected key is a configuration fault, not a data state, and
          // the operator should not have to guess which it is from a pill
          // that says "illustrated". surface the upstream's own words.
          title={
            fires?.provenance !== "scenario"
              ? fires?.liveSource === "open-24h"
                ? `NASA VIIRS open 24 h files (S-NPP, NOAA-20, NOAA-21), Chiang Mai bbox — cloud can hide fires.${fires.liveFailure ? ` Keyed API skipped: ${fires.liveFailure}.` : ""}`
                : "NASA VIIRS, Chiang Mai bbox, 24 h — cloud can hide fires from the satellite"
              : fires.liveFailure
              ? `Live pass unavailable: ${fires.liveFailure}. Showing illustrated hotspots.`
              : "Illustrated hotspots — not a satellite pass"
          }
          value={fires ? (fires.provenance === "live" ? `${fires.totalCount}` : "no live") : "—"}
          level={fires?.provenance === "live" && fires.totalCount > 30 ? "alert" : undefined}
        />
        <Pill
          label="Smoke"
          title={
            smoke?.provenance === "live"
              ? `${smoke.summary.origin_en} · ${smoke.summary.nearCnx} within 50 km · ${smoke.summary.hitsCnx} enter the province. ${smoke.methodology_en}`
              : smoke?.note ?? "Straight-line advection from a live VIIRS pass"
          }
          value={
            !smoke
              ? "—"
              : smoke.provenance !== "live"
              ? "no pass"
              : smoke.summary.nearCnx > 0
              ? `${smoke.summary.nearCnx} near`
              : smoke.summary.hitsCnx > 0
              ? `${smoke.summary.hitsCnx} in prov.`
              : smoke.summary.total === 0
              ? "none"
              : "clear"
          }
          level={
            smoke?.provenance === "live" && smoke.summary.nearCnx > 0
              ? "alert"
              : smoke?.provenance === "live" && smoke.summary.hitsCnx > 0
              ? "watch"
              : undefined
          }
        />
        {/* ASMC has no public API host yet (see lib/cnx/asmc.ts) — the pill
            only appears once a working ASMC_BASE + key return live data. */}
        {asmc?.provenance === "live" && <Pill
          label="ASMC"
          value={
            asmc
              ? asmc.provenance === "live"
                ? `${asmc.regions.reduce((a, r) => a + r.hotspots24h, 0)}`
                : "—"
              : "—"
          }
          level={
            asmc?.provenance === "live"
              ? asmc.assessment === "hazardous"
                ? "critical"
                : asmc.assessment === "unhealthy"
                ? "alert"
                : asmc.assessment === "moderate"
                ? "watch"
                : undefined
              : undefined
          }
        />}
        <Pill label="AOD" value={aerosol?.aod550?.toFixed(2) ?? "—"} level={aerosol?.level ?? undefined} title="Model grid · column aerosol optical depth, not ground PM2.5" />
        <Pill label="Aircraft" value={flights ? `${flights.airborne.length + flights.ground.length}` : "—"} />
        <Pill label="Widebody" value={flights ? `${widebodyCount}` : "—"} />
        <Pill label="CCTV" value={cctv ? `${cctv.reachableCount}/${cctv.totalCount}` : "—"} />
        <Pill label="News" value={social ? `${social.items.length}` : "—"} />
      </div>

      <CnxTimezoneStrip topOrigins={topOrigins} /></div>
      </details>}
</div>
          </details>
          <button
            onClick={toggleDark}
            aria-label="Toggle theme"
            className="flex h-11 w-11 items-center justify-center border border-[var(--line)] bg-[var(--bg)] hover:border-[var(--ink)] "
          >
            {isDark ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
          </button>
        </div>
      </div>

      <a href="/cnx/about#web-app" className="mt-1 w-fit text-[11px] sm:hidden leading-5 text-[var(--dim)] hover:text-[var(--cool)] hover:underline">
        Available on Android &amp; iPhone as a web app · Add to Home Screen
      </a>


    </header>
  );
}
