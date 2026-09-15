"use client";

// CNX top bar — province identity + manual + story opener.
//
// Replaces the existing minimal CNXTopBar with a richer version that
// shows live flood/air/fires/social counters in the masthead.

import { useEffect, useState } from "react";
import { Bell, BookOpen, Moon, Sun } from "lucide-react";
import { useDarkMode } from "../../hooks/useDarkMode";
import type {
  AirQualityResponse,
  CctvFeedResponse,
  CnxFiresResponse,
  CnxFloodResponse,
  CnxStoryResponse,
  OfficeNotice,
  SocialListeningResponse,
} from "../../types/cnx";
import type { FetchResult } from "../../lib/cnx/opensky";

interface TopBarProps {
  flood: CnxFloodResponse | null;
  air: AirQualityResponse | null;
  fires: CnxFiresResponse | null;
  social: SocialListeningResponse | null;
  cctv: CctvFeedResponse | null;
  story: CnxStoryResponse | null;
  flights: FetchResult | null;
  scenarioId: string | null;
  onOpenStory: () => void;
  onOpenManual: () => void;
}

function Pill({
  label,
  value,
  level,
}: {
  label: string;
  value: string;
  level?: "good" | "watch" | "alert" | "critical";
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
    <div className={`flex items-center gap-1.5 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] ${colour}`}>
      <span className="text-[8px] text-[var(--dim)]">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export default function CnxTopBar(props: TopBarProps) {
  const { flood, air, fires, social, cctv, flights, onOpenStory, onOpenManual } = props;
  const [isDark, toggleDark] = useDarkMode();
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Bangkok" }));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const officeNotice: OfficeNotice | undefined = air?.office ?? flood?.office;
  const widebodyCount = flights ? (flights.airborne.length + flights.ground.length) : 0;

  return (
    <header className="relative z-30 flex h-[64px] shrink-0 items-center border-b border-[var(--line)] bg-[var(--bg-raised)] px-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center bg-[var(--cool)] text-[14px] font-black text-white">
          CNX
        </div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--cool)]">
            Chiang Mai Province War Room
          </div>
          <div className="font-mono text-[12px] font-bold text-[var(--ink)]">
            เชียงใหม่ · v1
          </div>
        </div>
      </div>

      <div className="ml-6 flex flex-1 flex-wrap items-center gap-1.5">
        <Pill label="PM2.5" value={air?.provinceAvgPm25 ? `${air.provinceAvgPm25}` : "—"} level={air?.provinceAvgAqiLevel} />
        <Pill
          label="Ping"
          value={typeof flood?.pingCapacityFraction === "number" ? `${((flood?.pingCapacityFraction ?? 0) * 100).toFixed(0)}%` : "—"}
          level={(flood?.pingCapacityFraction ?? 0) > 0.85 ? "critical" : (flood?.pingCapacityFraction ?? 0) > 0.7 ? "alert" : undefined}
        />
        <Pill label="FIRMS" value={fires ? `${fires.totalCount}` : "—"} level={fires && fires.totalCount > 30 ? "alert" : undefined} />
        <Pill label="Aircraft" value={flights ? `${flights.airborne.length + flights.ground.length}` : "—"} />
        <Pill label="Widebody" value={flights ? `${widebodyCount}` : "—"} />
        <Pill label="CCTV" value={cctv ? `${cctv.reachableCount}/${cctv.totalCount}` : "—"} />
        <Pill label="News" value={social ? `${social.items.length}` : "—"} />
      </div>

      <div className="flex shrink-0 items-center gap-2">
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
          onClick={toggleDark}
          aria-label="Toggle theme"
          className="flex h-7 w-7 items-center justify-center border border-[var(--line)] bg-[var(--bg)] hover:border-[var(--ink)]"
        >
          {isDark ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
        </button>
      </div>
    </header>
  );
}