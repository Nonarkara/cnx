"use client";

// CNX top bar — province identity + manual + story opener.
//
// Replaces the existing minimal CNXTopBar with a richer version that
// shows live flood/air/fires/social counters in the masthead.

import { useEffect, useState } from "react";
import { Bell, BookOpen, Database, FlaskConical, Moon, PhoneCall, Sun, Wind } from "lucide-react";
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
      ? "bg-[#f59e0b] text-black"
      : "bg-[var(--bg-raised)] text-[var(--ink)] border border-[var(--line)]";
  return (
    <div title={title} className={`flex items-center gap-1.5 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] ${colour}`}>
      <span className="text-[8px] text-[var(--dim)]">{label}</span>
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
function VerdictStrip({
  twin,
  onOpenEmergency,
}: {
  twin: CnxTwinResponse;
  onOpenEmergency: () => void;
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
      ? "border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]"
      : "border-[var(--line)] bg-[var(--bg)] text-[var(--ink)]";
  const chipLabel =
    level === "danger"
      ? "DANGER"
      : level === "prepare"
      ? "PREPARE"
      : level === "watch"
      ? "WATCH"
      : "SAFE";
  const topReason = v.reasons[0];
  return (
    <div className={`flex flex-col gap-1 border-l-4 px-3 py-2 ${colour}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
          {chipLabel}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] opacity-70">
          score {v.score}/100 · band {v.band} · data {v.data_provenance}
        </span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] opacity-70">
          {twin.province_en} · ปภ. {HOTLINES.ddpm} · EMS {HOTLINES.ems}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 lg:flex-row lg:items-baseline lg:gap-3">
        <div className="font-display text-[15px] font-bold leading-tight">{v.head_th}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] opacity-80">
          {v.head_en}
        </div>
      </div>
      {topReason && (
        <div className="flex flex-col gap-0.5 text-[10px]">
          {[
            // Three observations, then every caveat. A blind flood axis is
            // the reason a wall is dangerous to read at a glance, so it must
            // never be the line that gets cut for space.
            ...v.reasons.filter((r) => !r.isCaveat).slice(0, 3),
            ...v.reasons.filter((r) => r.isCaveat),
          ].map((reason) => (
            <div key={`${reason.domain}-${reason.evidence ?? reason.en}`} className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-mono uppercase tracking-[0.14em] opacity-60">
                {reason.domain === "twins" ? "FloodDash × AirDash" : reason.domain}
              </span>
              <span className={reason.isCaveat ? "italic opacity-90" : undefined}>{reason.th}</span>
              <span className="font-mono opacity-70">— {reason.en}</span>
              {reason.evidence && (
                <span className="font-mono opacity-50">{reason.evidence}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {v.level !== "safe" && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            onClick={onOpenEmergency}
            className="border border-current px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] hover:bg-current hover:text-[var(--bg)]"
          >
            Hotlines
          </button>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] opacity-70">
            Checklist: {v.checklist.length} items — open Story for the full list
          </span>
        </div>
      )}
    </div>
  );
}

export default function CnxTopBar(props: TopBarProps) {
  const { flood, air, fires, firesRfd, aerosol, social, cctv, flights, topOrigins, twin, dustboy, asmc, smoke, onOpenStory, onOpenManual, onOpenResearch, onOpenData, onOpenHaze, onOpenEmergency } = props;
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
    <header className="relative z-30 flex shrink-0 flex-col gap-1.5 border-b border-[var(--line)] bg-[var(--bg-raised)] px-4 py-2">
      <div className="flex items-center gap-2">
        <span
          className="bg-[var(--ink)] px-2 py-0.5 font-mono text-[13px] font-bold tracking-[0.16em] text-[var(--bg)]"
          title={`build ${process.env.NEXT_PUBLIC_GIT_SHA ?? "local"}`}
        >
          v{process.env.NEXT_PUBLIC_APP_VERSION}
        </span>
        {process.env.NEXT_PUBLIC_GIT_SHA && (
          <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--dim)]">
            {process.env.NEXT_PUBLIC_GIT_SHA.slice(0, 7)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center bg-[var(--cool)] text-[14px] font-black text-white">
            CNX
          </div>
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--cool)]">
              Chiang Mai Province War Room
            </div>
            <div className="font-display text-[19px] font-bold leading-tight text-[var(--ink)]">
              เชียงใหม่ · ห้องบัญชาการ
            </div>
          </div>
          <CNXLogoRow size={22} />
        </div>

        <div className="flex shrink-0 items-center gap-2 lg:ml-auto">
          {officeNotice && (
            <button
              className="flex items-center gap-1.5 border border-[var(--danger)] bg-[var(--sun-dim)] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--danger)]"
              title={officeNotice.title}
            >
              <Bell className="h-3 w-3" />
              {officeNotice.level.toUpperCase()}
            </button>
          )}
          <span className="hidden font-mono text-[9px] text-[var(--dim)] lg:inline">{now}</span>
          <button
            onClick={onOpenStory}
            className="flex items-center gap-1.5 border border-[var(--line)] bg-[var(--bg)] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] hover:border-[var(--sun)] hover:bg-[var(--sun-dim)]"
          >
            <BookOpen className="h-3 w-3" />
            Story
          </button>
          <button
            onClick={onOpenManual}
            className="flex items-center gap-1.5 border border-[var(--line)] bg-[var(--bg)] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] hover:border-[var(--cool)] hover:bg-[var(--cool-dim)]"
          >
            <BookOpen className="h-3 w-3" />
            Manual
          </button>
          <button
            onClick={onOpenResearch}
            className="flex items-center gap-1.5 border border-[var(--line)] bg-[var(--bg)] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] hover:border-[var(--sun)] hover:bg-[var(--sun-dim)]"
          >
            <FlaskConical className="h-3 w-3" />
            Research
          </button>
          <button
            onClick={onOpenData}
            className="flex items-center gap-1.5 border border-[var(--line)] bg-[var(--bg)] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] hover:border-[var(--cool)] hover:bg-[var(--cool-dim)]"
          >
            <Database className="h-3 w-3" />
            Data
          </button>
          <button
            onClick={onOpenHaze}
            className="flex items-center gap-1.5 border border-[var(--line)] bg-[var(--bg)] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] hover:border-[var(--cool)] hover:bg-[var(--cool-dim)]"
          >
            <Wind className="h-3 w-3" />
            Haze
          </button>
          <button
            onClick={onOpenEmergency}
            className="flex items-center gap-1.5 border border-[var(--danger)] bg-[var(--bg)] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white"
          >
            <PhoneCall className="h-3 w-3" />
            Emergency
          </button>
          <button
            onClick={toggleDark}
            aria-label="Toggle theme"
            className="flex h-7 w-7 items-center justify-center border border-[var(--line)] bg-[var(--bg)] hover:border-[var(--ink)]"
          >
            {isDark ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Pill label="PM2.5" value={air?.provinceAvgPm25 ? `${air.provinceAvgPm25}` : "—"} level={air?.provinceAvgAqiLevel} />
        <Pill
          label="Ping"
          value={typeof flood?.pingCapacityFraction === "number" ? `${((flood?.pingCapacityFraction ?? 0) * 100).toFixed(0)}%` : "—"}
          level={(flood?.pingCapacityFraction ?? 0) > 0.85 ? "critical" : (flood?.pingCapacityFraction ?? 0) > 0.7 ? "alert" : undefined}
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
        <Pill label="RFD" value={firesRfd ? `${firesRfd.totalCount}` : "—"} level={rfdReserveCount > 5 ? "critical" : firesRfd && firesRfd.totalCount > 0 ? "watch" : undefined} />
        <Pill
          label="FIRMS"
          title={fires?.provenance === "scenario" ? "Illustrated hotspots — not a satellite pass" : "NASA VIIRS, Chiang Mai bbox, 24 h"}
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
        <Pill label="AOD" value={aerosol ? aerosol.aod550.toFixed(2) : "—"} level={aerosol?.level} />
        <Pill label="Aircraft" value={flights ? `${flights.airborne.length + flights.ground.length}` : "—"} />
        <Pill label="Widebody" value={flights ? `${widebodyCount}` : "—"} />
        <Pill label="CCTV" value={cctv ? `${cctv.reachableCount}/${cctv.totalCount}` : "—"} />
        <Pill label="News" value={social ? `${social.items.length}` : "—"} />
      </div>

      {twin && (
        <VerdictStrip twin={twin} onOpenEmergency={onOpenEmergency} />
      )}

      <CnxTimezoneStrip topOrigins={topOrigins} />
    </header>
  );
}