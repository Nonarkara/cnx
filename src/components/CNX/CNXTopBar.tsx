"use client";

// CNX top bar — province identity + manual + story opener.
//
// Replaces the existing minimal CNXTopBar with a richer version that
// shows live flood/air/fires/social counters in the masthead.

import { useEffect, useState } from "react";
import { Bell, BookOpen, Database, FileText, FlaskConical, Moon, PhoneCall, Sun, Wind, LayoutDashboard, Map as MapIcon } from "lucide-react";
import { useDarkMode } from "../../hooks/useDarkMode";
import { useLang } from "../../hooks/useLang";
import CNXLogoRow from "./CNXLogoRow";
import { lookupAircraft } from "../../lib/cnx/aircraft";
import CnxTimezoneStrip, { type TimezoneOrigin } from "./CNXTimezoneStrip";
import CnxFeedFreshness from "./CNXFeedFreshness";
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
      ? "sev-fill-critical"
      : level === "alert"
      ? "sev-fill-alert"
      : level === "watch"
      ? "sev-fill-watch"
      : "bg-[var(--bg-raised)] text-[var(--ink)] border border-[var(--line)]";
  return (
    // These are read, not tapped, so the touch-target rule does not apply —
    // legibility does. The governor reads a PM2.5 number on a phone held at
    // arm's length, so nothing here drops below the 11px floor; the row
    // wraps rather than shrinks. On a filled level the label takes the
    // fill's own text colour — quiet ink on a signal fill fails contrast.
    <div
      title={title}
      className={`flex min-h-8 items-center gap-1.5 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.14em] sm:min-h-0 ${colour}`}
    >
      <span className={level === "critical" || level === "alert" || level === "watch" ? "" : "text-[var(--dim)]"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

type Pair = [th: string, en: string];

const CHIP_LABEL: Record<CnxTwinResponse["verdict"]["level"], Pair> = {
  danger: ["อันตราย", "DANGER"],
  prepare: ["เตรียมพร้อม", "PREPARE"],
  watch: ["เฝ้าระวัง", "WATCH"],
  safe: ["ไม่มีสัญญาณยกระดับ", "NO ELEVATED SIGNAL"],
};
const DOMAIN_LABEL: Record<CnxTwinResponse["verdict"]["reasons"][number]["domain"], Pair> = {
  flood: ["น้ำ", "Flood"],
  air: ["อากาศ", "Air"],
  fire: ["ไฟป่า", "Fire"],
  haze: ["หมอกควัน", "Haze"],
  twins: ["ความเสี่ยงร่วม", "Combined hazards"],
};
const BAND_LABEL: Record<CnxTwinResponse["verdict"]["band"], Pair> = {
  normal: ["ปกติ", "normal"],
  watch: ["เฝ้าระวัง", "watch"],
  elevated: ["สูงขึ้น", "elevated"],
  high: ["สูง", "high"],
};

/**
 * The severity palette, shared by the strip and the band so the two can
 * never drift apart. It matches the topbar pill palette so the strip reads
 * as part of the same chrome, not a foreign block.
 */
function verdictColour(level: CnxTwinResponse["verdict"]["level"]): string {
  return level === "danger"
    ? "border-[var(--sev-critical)] bg-[var(--bg)] text-[var(--sev-critical)]"
    : level === "prepare"
    ? "border-[var(--sev-alert)] bg-[var(--bg)] text-[var(--sev-alert)]"
    : level === "watch"
    ? "border-[var(--sev-watch)] bg-[var(--bg)] text-[var(--sev-watch)]"
    : "border-[var(--line)] bg-[var(--bg)] text-[var(--ink)]";
}

/**
 * The reasoning behind the verdict: the observations, the evidence gaps, the
 * next step, the official hotlines and the planning checklist.
 *
 * Split out of the strip so the board's band can open exactly this — and
 * only this — in a panel over the map, without repeating the chip and the
 * headline the band already shows. In flow it would push the board, and the
 * map, out of shape; the band floats it for that reason.
 */
function VerdictEvidence({
  twin,
  t,
  onOpenEmergency,
}: {
  twin: CnxTwinResponse;
  t: (th: string, en: string | null | undefined) => string;
  onOpenEmergency: () => void;
}) {
  const v = twin.verdict;
  const topReason = v.reasons[0];
  const caveats = v.reasons.filter((r) => r.isCaveat);
  const action: Pair = v.level === "danger"
    ? ["ปฏิบัติตามคำสั่งทางการในพื้นที่ทันที และตรวจสอบข้อมูลที่ขาดควบคู่กัน", "Follow official instructions for the affected area now. Verify the listed evidence gaps alongside response preparations."]
    : v.level === "prepare"
    ? ["ตรวจสอบประกาศในพื้นที่และเตรียมการรับมือ พร้อมยืนยันค่าที่ขาด", "Check official local instructions and prepare the relevant response; confirm any missing readings."]
    : caveats.length > 0
    ? ["ยืนยันค่าที่ขาดหรือเก่าและตรวจสอบประกาศทางการก่อนตัดสินใจ", "Verify missing or old readings and check local official notices before deciding."]
    : v.level === "safe"
    ? ["ติดตามสถานีวัดและประกาศในพื้นที่ต่อไป — ยังไม่ใช่การยืนยันว่าปลอดภัย", "Continue monitoring local gauges and official notices; this board is not an all-clear."]
    : ["ติดตามความเสี่ยงที่รายงานและยืนยันสภาพจริงในพื้นที่", "Monitor the reported hazard and confirm conditions at the affected location."];
  return (
    <>
      {/* Province and the emergency numbers travel with the reasoning: the
          band above the board carries the level and the headline, so the
          authority and the hotline must still be one read away. */}
      <p className="font-mono text-[11px] uppercase tracking-[0.14em]">
        {t(`${twin.province_th} · ปภ. ${HOTLINES.ddpm} · การแพทย์ฉุกเฉิน ${HOTLINES.ems}`, `${twin.province_en} · DDPM ${HOTLINES.ddpm} · EMS ${HOTLINES.ems}`)}
      </p>
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
              <span className="font-mono uppercase tracking-[0.14em]">
                {reason.isCaveat ? t("ช่องว่างหลักฐาน", "Evidence gap") : t(...DOMAIN_LABEL[reason.domain])}
              </span>
              <span className={reason.isCaveat ? "italic" : undefined}>{t(reason.th, reason.en)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="pt-1 text-[12px] font-semibold leading-relaxed">
        {t(`ขั้นตอนต่อไป: ${action[0]}`, `Next step: ${action[1]}`)}
      </p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onOpenEmergency}
          className="min-h-11 border border-current px-4 py-1 text-[12px] font-bold hover:bg-[var(--bg-raised)]"
        >
          {t("สายด่วนทางการ", "Official hotlines")}
        </button>
        <details className="min-w-0 flex-1 text-[12px]">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">{t("รายการตรวจเพื่อวางแผนและรายละเอียดหลักฐาน", "Planning checklist & evidence details")}</summary>
          <p className="mb-2">{t("รายการตรวจที่แนะนำสำหรับการวางแผน การปฏิบัติและคำสั่งอพยพต้องเป็นไปตามหน่วยงานที่รับผิดชอบ", "Suggested planning checks; actions and evacuation orders must follow the responsible authority.")}</p>
          <ul className="list-disc space-y-2 pl-5 leading-relaxed">
            {v.checklist.map((item) => <li key={item.en}>{t(item.th, item.en)}</li>)}
          </ul>
          <p className="mt-3 text-[11px]">{t(
            `คะแนนประเมินของแดชบอร์ด ${v.score}/100 ระดับ${t(...BAND_LABEL[v.band])} ไม่ใช่ความน่าจะเป็นของเหตุการณ์หรือคำเตือนทางการ`,
            `Dashboard heuristic score ${v.score}/100; ${v.band} band. This is not an event probability or an official warning.`,
          )}</p>
          {/* Evidence strings are machine readings (e.g. pm25=48) — shown as recorded. */}
          {v.reasons.filter((r) => r.evidence).map((reason) => <p key={reason.evidence} className="mt-1 break-words font-mono text-[11px]">{t(...DOMAIN_LABEL[reason.domain])}: {reason.evidence}</p>)}
        </details>
      </div>
    </>
  );
}

/**
 * The province verdict as a full-width band above the board.
 *
 * Why a band, and not the strip: the strip is a tall column — its headline
 * wraps to seven lines in a 220 px column — and it used to sit in the news
 * rail, where it took 273 px of a 539 px rail and left the news list a 30 px
 * window onto 2 152 px of headlines while the footer still claimed 24 items.
 * A band is wide, so the headline is one or two lines and the news rail
 * gets its column back.
 *
 * Why not on the map: a verdict overlay covers the map's own layer control.
 * That defect was already paid for once — see docs/SHIP-AUDIT.md, "Desktop
 * verdict overlay covered map controls" — so the map's controls stay
 * exposed here.
 */
export function VerdictBand({ twin, onOpenEmergency }: { twin: CnxTwinResponse; onOpenEmergency: () => void }) {
  const { lang, t } = useLang();
  const v = twin.verdict;
  const colour = verdictColour(v.level);
  const provenance = v.data_provenance === "live"
    ? t("หลักฐานจากการวัด / แบบจำลองปัจจุบัน", "Current measured / modeled evidence")
    : v.data_provenance === "mixed"
    ? t("หลักฐานผสม — ตรวจข้อจำกัด", "Mixed evidence — check limitations")
    : t("หลักฐานปัจจุบันยังไม่ครบ", "Current evidence incomplete");
  return (
    <div lang={lang} data-surface="cnx-verdict-band" className={`relative flex flex-col items-start gap-y-1 border-b border-l-4 ${colour} px-3 py-2 sm:flex-row sm:items-center sm:gap-x-4 sm:px-4`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.18em]">
          {t(...CHIP_LABEL[v.level])}
        </span>
        <span className="shrink-0 text-[11px] leading-relaxed">{provenance}</span>
      </div>
      <p className="w-full min-w-0 flex-1 text-[13px] font-semibold leading-snug sm:w-auto">{t(v.head_th, v.head_en)}</p>
      <details className="shrink-0">
        <summary className="min-h-11 cursor-pointer border border-[var(--line)] px-3 py-2 text-[12px] font-semibold hover:bg-[var(--bg-raised)]">
          {t("ตรวจเหตุผลและข้อจำกัด", "Evidence and limits")}
        </summary>
        {/* Anchored to the BAND, not to the summary: at 390 the summary wraps
            to a second line, and a panel anchored to it opened at x = -180 —
            half of every line off-screen. It also clears the map's own
            control row (CNXMap's layer control on the left, the symbol key
            and the flight badge on the right), because an overlay that
            covers the map's controls is a defect this board already paid
            for once — see docs/SHIP-AUDIT.md. The offset is
            --cnx-map-control-clear (globals.css), which carries the
            derivation: the map's control row ends 78 px below the map's top
            edge and the panel keeps 16 px from it. */}
        <div className="absolute right-0 top-full z-40 mt-[var(--cnx-map-control-clear)] max-h-[calc(100dvh_-_11rem)] w-[min(34rem,calc(100vw_-_2rem))] overflow-y-auto border border-[var(--line)] bg-[var(--bg-raised)] p-3 text-[var(--ink)]">
          <VerdictEvidence twin={twin} t={t} onOpenEmergency={onOpenEmergency} />
        </div>
      </details>
    </div>
  );
}

/**
 * The bar's one-line verdict chip. The board's full reasoning lives in the
 * band above the map (see VerdictBand) and the map's own controls stay
 * exposed — a verdict overlay on the map was already paid for once, see
 * docs/SHIP-AUDIT.md. But the province level must never leave the bar — it
 * is the single number an operator reads from across the room. Colour and
 * word, nothing more.
 */
export function VerdictChip({ twin }: { twin: CnxTwinResponse }) {
  const { t } = useLang();
  const v = twin.verdict;
  const level = v.level;
  const colour =
    level === "danger"
      ? "sev-fill-critical border-[var(--sev-critical)]"
      : level === "prepare"
      ? "sev-fill-alert border-[var(--sev-alert)]"
      : level === "watch"
      ? "sev-fill-watch border-[var(--sev-watch)]"
      : "border-[var(--line)] bg-[var(--bg)] text-[var(--ink)]";
  const chipLabel = t(...CHIP_LABEL[level]);
  const head = t(v.head_th, v.head_en);
  return (
    <div
      className={`flex h-7 shrink-0 items-center gap-1.5 border px-2 ${colour}`}
      title={head || chipLabel}
    >
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em]">{chipLabel}</span>
      <span className="hidden max-w-[22ch] truncate font-mono text-[11px] uppercase tracking-[0.1em] sm:inline">
        {head}
      </span>
    </div>
  );
}

export default function CnxTopBar(props: TopBarProps) {
  const { compact = false, view, onChangeView, flood, air, fires, firesRfd, aerosol, social, cctv, flights, topOrigins, twin, dustboy, asmc, smoke, onOpenStory, onOpenManual, onOpenResearch, onOpenData, onOpenHaze, onOpenBrief, onOpenEmergency } = props;
  const rfdReserveCount = firesRfd ? (firesRfd.byType.DNP ?? 0) + (firesRfd.byType.NRF ?? 0) : 0;
  const [isDark, toggleDark] = useDarkMode();
  const { lang, setLang, t } = useLang();
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const locale = lang === "en" ? "en-GB" : "th-TH";
    const tick = () => setNow(new Date().toLocaleString(locale, { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Bangkok" }));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [lang]);

  const officeNotice: OfficeNotice | undefined = air?.office ?? flood?.office;
  const widebodyCount = flights
    ? [...flights.airborne, ...flights.ground].filter((f) => ["heavy", "wide"].includes(lookupAircraft(f.typecode).size)).length
    : 0;

  return (
    // Keep chrome content-sized: the map owns the vertical budget.
    <header lang={lang} className={`relative z-30 flex shrink-0 flex-col border-b border-[var(--line)] bg-[var(--bg-raised)] ${compact ? "cnx-executive-header" : "cnx-operation-header"} px-3 py-1 sm:px-4`}>
      <div className="flex items-center gap-1 lg:gap-3">
        <div className="flex shrink-0 items-center gap-2">
          <a href="/cnx" aria-label={t("หน้าแรก CNX ศูนย์ปฏิบัติการ", "CNX War Room home")} className="cnx-brand-plate flex h-8 w-11 sm:w-[52px] xl:w-[72px] shrink-0 items-center justify-center px-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/cnx-mark.png" alt="" width={60} height={28} className="block h-6 w-full xl:h-7 xl:w-[60px] object-contain" />
          </a>
          <div className="hidden leading-none xl:block">
            <div className="font-display text-[13px] font-bold text-[var(--ink)]">
              {t("เชียงใหม่", "Chiang Mai")} · <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--cool)]">{t("ศูนย์ปฏิบัติการ", "War Room")}</span>
            </div>
          </div>
          <div className="hidden xl:block"><CNXLogoRow size={16} /></div>
          <span
            className="hidden shrink-0 xl:inline bg-[var(--ink)] px-1 py-0.5 font-mono text-[11px] font-bold tracking-[0.12em] text-[var(--bg)]"
            title={`build ${process.env.NEXT_PUBLIC_GIT_SHA ?? "local"} · ${now}`}
          >
            v{process.env.NEXT_PUBLIC_APP_VERSION}
            {process.env.NEXT_PUBLIC_LIVE_PREVIEW === "1" && <span title={t("หน้าเว็บทดลองในเครื่อง ใช้ข้อมูลสาธารณะที่เผยแพร่แล้ว", "Local frontend preview using deployed public data")}> · {t("ทดลอง", "PREVIEW")}</span>}
            {process.env.NEXT_PUBLIC_GIT_SHA ? `·${process.env.NEXT_PUBLIC_GIT_SHA.slice(0, 7)}` : ""}
          </span>
        </div>


        <div className="cnx-header-actions ml-auto flex min-w-0 items-center gap-1">
          {officeNotice && (
            <details className="sm:relative">
              <summary aria-label={t("ประกาศหน่วยงาน", "Agency notice")} className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 border border-[var(--sev-critical)] bg-[var(--bg)] px-3 text-[12px] font-semibold text-[var(--sev-critical)]">
              <Bell className="h-3 w-3" />
              <span className="hidden lg:inline">{t("ประกาศหน่วยงาน", "Agency notice")}</span> ⌄
              </summary>
              <div className="absolute left-0 top-full z-50 mt-2 w-[min(20rem,85vw)] border border-[var(--ink)] bg-[var(--bg-raised)] p-4 text-[13px] leading-relaxed">
                <p className="font-semibold">{officeNotice.title}</p>
                {officeNotice.detail && <p className="mt-2">{officeNotice.detail}</p>}
                <p className="mt-2 text-[var(--dim)]">{officeNotice.source}</p>
                {officeNotice.url && /^https?:\/\//i.test(officeNotice.url) && <a href={officeNotice.url} target="_blank" rel="noreferrer" className="mt-2 flex min-h-11 items-center text-[var(--cool)] underline">{t("ตรวจสอบประกาศต้นฉบับ", "Check the original notice")} ↗</a>}
              </div>
            </details>
          )}
          <button type="button" onClick={() => onChangeView(view === "map" ? "overview" : "map")} aria-label={view === "map" ? t("ภาพรวมจังหวัด", "Province overview") : t("แผนที่ · ห้องปฏิบัติการ", "Map · Operations room")} className="flex min-h-11 items-center gap-2 border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)]">{view === "map" ? <LayoutDashboard aria-hidden="true" className="h-4 w-4" /> : <MapIcon aria-hidden="true" className="h-4 w-4" />}<span className="hidden sm:inline lg:hidden">{view === "map" ? t("ภาพรวม", "Overview") : t("แผนที่", "Map")}</span><span className="hidden lg:inline">{view === "map" ? t("ภาพรวมจังหวัด", "Province overview") : t("ห้องปฏิบัติการ", "Operations room")}</span></button>
<button
            onClick={onOpenBrief}
            aria-label={t("สรุปผู้ว่าฯ", "Governor brief")}
            title={t("สรุปหน้าเดียวสำหรับผู้ว่าฯ — คัดลอกส่ง LINE หรือพิมพ์", "One-screen summary for the governor — copy to LINE or print")}
            className="hidden min-h-11 items-center gap-1.5 border border-[var(--wada-counter)] sm:flex bg-[var(--wada-counter)] px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.04em] text-white hover:opacity-90 "
          >
            <FileText className="h-3 w-3" />
              <span className="hidden lg:inline">{t("สรุปผู้ว่าฯ", "Governor brief")}</span>
          </button>
<button
            onClick={onOpenEmergency}
            aria-label={t("ติดต่อฉุกเฉิน", "SOS — Emergency contacts")}
            className="flex min-h-11 items-center gap-1.5 border border-[var(--danger)] bg-[var(--bg)] px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-[var(--bg)] "
          >
            <PhoneCall className="h-3 w-3" />
            <span className="lg:hidden">{t("ฉุกเฉิน", "SOS")}</span><span className="hidden lg:inline">{t("ติดต่อฉุกเฉิน", "Emergency contacts")}</span>
          </button>
          {/* Per-feed freshness against each feed's declared SLO (twin manifest). */}
          <CnxFeedFreshness />
          <details className="sm:relative">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 border border-[var(--line)] px-3 text-[13px] font-semibold"><span className="sm:hidden">{t("เมนู", "Menu")}</span><span className="hidden sm:inline">{t("เครื่องมือ", "Tools")}</span> <span aria-hidden="true">⌄</span></summary>
            <div className="absolute inset-x-3 top-full z-50 mt-2 grid max-h-[70dvh] gap-2 overflow-y-auto sm:inset-x-auto sm:right-0 sm:w-64 border border-[var(--ink)] bg-[var(--bg-raised)] p-3"><button type="button" onClick={onOpenBrief} className="min-h-11 border border-[var(--line)] px-3 text-left text-[13px] font-semibold sm:hidden">{t("สรุปสำหรับผู้ว่าฯ", "Governor brief")}</button><button
            onClick={onOpenData}
            className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] bg-[var(--bg)] px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.04em] hover:border-[var(--cool)] hover:bg-[var(--cool-dim)] "
          >
            <Database className="h-3 w-3" />
            {t("คลังข้อมูล", "Data library")}
          </button><button
            onClick={onOpenHaze}
            className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] bg-[var(--bg)] px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.04em] hover:border-[var(--cool)] hover:bg-[var(--cool-dim)] "
          >
            <Wind className="h-3 w-3" />
            {t("ตรวจสอบฝุ่นและภาพกล้อง", "Haze and camera check")}
          </button><button
            onClick={onOpenStory}
            className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] bg-[var(--bg)] px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.04em] hover:border-[var(--cool)] hover:bg-[var(--cool-dim)] "
          >
            <BookOpen className="h-3 w-3" />
            {t("เรื่องราวจังหวัด", "Province story")}
          </button><button
            onClick={onOpenManual}
            className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] bg-[var(--bg)] px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.04em] hover:border-[var(--cool)] hover:bg-[var(--cool-dim)] "
          >
            <BookOpen className="h-3 w-3" />
            {t("วิธีใช้งาน", "How to use")}
          </button><button
            onClick={onOpenResearch}
            className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] bg-[var(--bg)] px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.04em] hover:border-[var(--cool)] hover:bg-[var(--cool-dim)] "
          >
            <FlaskConical className="h-3 w-3" />
            {t("แหล่งข้อมูลและข้อจำกัด", "Sources and limits")}
          </button>
          <button
            type="button"
            onClick={() => setLang(lang === "th" ? "en" : "th")}
            aria-label={lang === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย"}
            title={lang === "th" ? "English" : "ภาษาไทย"}
            className="flex min-h-11 gap-2 items-center justify-center border border-[var(--line)] bg-[var(--bg)] px-2 text-[13px] font-semibold hover:border-[var(--ink)]"
          >
            {lang === "th" ? "English" : "ภาษาไทย"}
          </button>
          <button
            onClick={toggleDark}
            aria-label={t("สลับโหมดสว่าง/มืด", "Toggle theme")}
            className="flex min-h-11 gap-2 px-2 items-center justify-center border border-[var(--line)] bg-[var(--bg)] hover:border-[var(--ink)] "
          >
            {isDark ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
            {t("สลับโหมดสว่าง/มืด", "Toggle theme")}
          </button>
          <a href="/cnx/about#web-app" className="flex min-h-11 items-center border border-[var(--line)] px-3 text-[13px] font-semibold">{t("เว็บแอป Android และ iPhone", "Web app · Android & iPhone")}</a>
      {!compact && <details className="border-t border-[var(--line)]">
        <summary className="min-h-11 cursor-pointer border border-[var(--line)] px-3 py-3 text-[12px] font-semibold">{t("สถานะแหล่งข้อมูล", "Feed status")}</summary>
        <div className="min-w-0 max-w-full border border-[var(--line)] p-3">{twin && <VerdictChip twin={twin} />}      <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Pill label="PM2.5" value={air?.provinceAvgPm25 != null ? `${air.provinceAvgPm25}` : "—"} level={air?.provinceAvgAqiLevel} />
        {/* Drill only (?scenario=): the flood payload carries no figures otherwise. Never coloured — it is not a measurement. */}
        {flood?.provenance === "scenario" && (
          <Pill
            label={t("ซ้อมแผน · ปิง", "DRILL · Ping")}
            value={typeof flood.pingCapacityFraction === "number" ? `${(flood.pingCapacityFraction * 100).toFixed(0)}%` : "—"}
            title={t("ตัวเลขจำลองสำหรับซ้อมแผน ไม่ใช่ค่าที่วัดได้", "Simulated drill figure, not a measurement")}
          />
        )}
        <Pill
          label="DustBoy"
          title={
            dustboy?.provenance === "live"
              ? t(
                  `เชียงใหม่ ${dustboy.basin.chiangMai.onlineCount} เซนเซอร์ที่มีค่าภายใน 3 ชม.${
                    dustboy.basin.chiangMai.newestReadingAgeHours !== null
                      ? ` · ล่าสุด ${dustboy.basin.chiangMai.newestReadingAgeHours} ชม.ก่อน`
                      : ""
                  } · เฉลี่ยภาคเหนือตอนบน ${dustboy.basin.avgPm25 ?? "—"} µg/m³`,
                  `Chiang Mai ${dustboy.basin.chiangMai.onlineCount} sensors with a reading under 3 h${
                    dustboy.basin.chiangMai.newestReadingAgeHours !== null
                      ? ` · newest ${dustboy.basin.chiangMai.newestReadingAgeHours} h old`
                      : ""
                  } · upper-north avg ${dustboy.basin.avgPm25 ?? "—"} µg/m³`,
                )
              : dustboy?.note ?? undefined
          }
          value={
            dustboy?.provenance === "live" && dustboy.basin.chiangMai.avgPm25 !== null
              ? `${dustboy.basin.chiangMai.avgPm25} (${dustboy.basin.chiangMai.onlineCount})`
              : dustboy?.provenance === "live"
              ? t("ข้อมูลเก่า", "stale")
              : dustboy
              ? t("ออฟไลน์", "offline")
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
                ? t(
                    `ไฟล์เปิด 24 ชม. ของ NASA VIIRS (S-NPP, NOAA-20, NOAA-21) กรอบพื้นที่เชียงใหม่ — เมฆอาจบดบังไฟ${fires.liveFailure ? ` ข้าม API ที่ใช้คีย์: ${fires.liveFailure}` : ""}`,
                    `NASA VIIRS open 24 h files (S-NPP, NOAA-20, NOAA-21), Chiang Mai bbox — cloud can hide fires.${fires.liveFailure ? ` Keyed API skipped: ${fires.liveFailure}.` : ""}`,
                  )
                : t("NASA VIIRS กรอบพื้นที่เชียงใหม่ 24 ชม. — เมฆอาจบดบังไฟจากดาวเทียม", "NASA VIIRS, Chiang Mai bbox, 24 h — cloud can hide fires from the satellite")
              : fires.liveFailure
              ? t(`ไม่มีรอบดาวเทียมสด: ${fires.liveFailure} แสดงจุดความร้อนตัวอย่าง`, `Live pass unavailable: ${fires.liveFailure}. Showing illustrated hotspots.`)
              : t("จุดความร้อนตัวอย่าง — ไม่ใช่รอบดาวเทียมจริง", "Illustrated hotspots — not a satellite pass")
          }
          value={fires ? (fires.provenance === "live" ? `${fires.totalCount}` : t("ไม่มีข้อมูลสด", "no live")) : "—"}
          level={fires?.provenance === "live" && fires.totalCount > 30 ? "alert" : undefined}
        />
        <Pill
          label={t("ควัน", "Smoke")}
          title={
            smoke?.provenance === "live"
              ? t(
                  `${smoke.summary.origin_th} · ${smoke.summary.nearCnx} เส้นภายใน 50 กม. · ${smoke.summary.hitsCnx} เส้นเข้าจังหวัด ${smoke.methodology_th}`,
                  `${smoke.summary.origin_en} · ${smoke.summary.nearCnx} within 50 km · ${smoke.summary.hitsCnx} enter the province. ${smoke.methodology_en}`,
                )
              : smoke?.note ?? t("การพัดพาแนวตรงจากรอบ VIIRS สด", "Straight-line advection from a live VIIRS pass")
          }
          value={
            !smoke
              ? "—"
              : smoke.provenance !== "live"
              ? t("ไม่มีรอบ", "no pass")
              : smoke.summary.nearCnx > 0
              ? t(`ใกล้ ${smoke.summary.nearCnx}`, `${smoke.summary.nearCnx} near`)
              : smoke.summary.hitsCnx > 0
              ? t(`ในจังหวัด ${smoke.summary.hitsCnx}`, `${smoke.summary.hitsCnx} in prov.`)
              : smoke.summary.total === 0
              ? t("ไม่มี", "none")
              : t("ไม่เข้าใกล้", "clear")
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
        <Pill label="AOD" value={aerosol?.aod550?.toFixed(2) ?? "—"} level={aerosol?.level ?? undefined} title={t("กริดแบบจำลอง · ความลึกเชิงแสงของละอองลอยทั้งคอลัมน์ ไม่ใช่ PM2.5 ภาคพื้นดิน", "Model grid · column aerosol optical depth, not ground PM2.5")} />
        <Pill label={t("อากาศยาน", "Aircraft")} value={flights ? `${flights.airborne.length + flights.ground.length}` : "—"} />
        <Pill label={t("ลำตัวกว้าง", "Widebody")} value={flights ? `${widebodyCount}` : "—"} />
        <Pill label="CCTV" value={cctv ? `${cctv.reachableCount}/${cctv.totalCount}` : "—"} />
        <Pill label={t("ข่าว", "News")} value={social ? `${social.items.length}` : "—"} />
      </div>

      <CnxTimezoneStrip topOrigins={topOrigins} /></div>
      </details>}
</div>
          </details>

        </div>
      </div>



    </header>
  );
}
