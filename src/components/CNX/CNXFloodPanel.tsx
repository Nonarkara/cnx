"use client";

// CNX flood / air / fires panel — the "model" desk tab.
//
// The flood sub-tab is the flood desk (CNXFloodDesk): it composes five live
// parts, each fetched on its own and shown with its own source and age —
//   /api/cnx/river-level  measured river gauges
//   /api/cnx/dam          reservoir storage (RID daily report)
//   /api/cnx/rain         measured rain gauges
//   /api/cnx/floodhub     Google Flood Hub river forecast (model)
//   outlook prop          48 h district rain forecast (model), built in CNXApp
// The old /api/cnx/flood scenario is shown only in drill mode
// (?scenario=<id>), labelled "ซ้อมแผน / DRILL" — see flood.ts.

import { useEffect, useState } from "react";
import { Droplets, Wind, Flame } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import { useLang } from "../../hooks/useLang";
import { ageText, type Feed } from "../../lib/cnx/flood-desk";
import type { RiverLevelResponse } from "../../lib/cnx/river-level";
import type { DamResponse } from "../../lib/cnx/dam";
import type { RainResponse } from "../../lib/cnx/rain";
import type { FloodHubResponse } from "../../lib/cnx/floodhub";
import type { ProvinceOutlook } from "../../lib/cnx/outlook";
import { newest } from "./CNXDataAge";
import { FloodDesk } from "./CNXFloodDesk";
import type { CnxFloodResponse, AirQualityResponse, CnxFiresResponse, SeverityLevel } from "../../types/cnx";

type Tab = "flood" | "air" | "fires";
type T = (th: string, en: string | null | undefined) => string;

const MIN = 60_000;

const SEVERITY_CLASSES: Record<SeverityLevel, string> = {
  // "unknown" must never inherit the green of a confirmed cool reading.
  unknown: "border border-[var(--line)] text-status-unknown",
  good: "sev-fill-good",
  watch: "sev-fill-watch",
  alert: "sev-fill-alert",
  critical: "sev-fill-critical",
};

function severityLabel(t: T, s: SeverityLevel): string {
  return { good: t("ปกติ", "OK"), watch: t("เฝ้าระวัง", "Watch"), alert: t("เตือนภัย", "Alert"), critical: t("วิกฤต", "Critical"), unknown: t("ไม่ทราบ", "Unknown") }[s];
}

/** One part of the desk: polls, and remembers a failure as a failure — not as "nothing to report". */
function useFeed<D>(url: string, everyMs: number): Feed<D> {
  const [feed, setFeed] = useState<Feed<D>>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchJsonOrNull<D>(url);
      if (cancelled) return;
      // A failed refresh keeps the last answer: it carries its own
      // observation time, so its age keeps counting and goes stale on screen.
      setFeed((prev) => (next ? { status: "ok", data: next } : prev.status === "ok" ? prev : { status: "failed" }));
    };
    void load();
    const timer = window.setInterval(() => void load(), everyMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [url, everyMs]);
  return feed;
}

function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), MIN);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

interface PanelProps {
  flood: CnxFloodResponse | null;
  air: AirQualityResponse | null;
  fires: CnxFiresResponse | null;
  outlook?: ProvinceOutlook | null;
}

export default function CnxFloodPanel({ flood, air, fires, outlook = null }: PanelProps) {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("flood");
  const tabs = [
    { id: "flood", Icon: Droplets, label: t("น้ำท่วม", "Flood"), count: undefined },
    { id: "air", Icon: Wind, label: t("อากาศ", "Air"), count: air?.stations.length },
    { id: "fires", Icon: Flame, label: t("ไฟ", "Fires"), count: fires?.provenance === "live" ? fires.totalCount : undefined },
  ] as const;

  return (
    <div className="flex h-full flex-col overflow-hidden border-b border-[var(--line)] bg-[var(--bg-raised)]">
      <div role="tablist" className="flex shrink-0 border-b border-[var(--line)]">
        {tabs.map((x, i) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] ${
              i < tabs.length - 1 ? "border-r border-[var(--line)]" : ""
            } ${tab === x.id ? "bg-[var(--bg)] text-[var(--ink)]" : "text-[var(--dim)] hover:text-[var(--ink)]"}`}
          >
            <x.Icon className="h-3 w-3" aria-hidden="true" />
            {x.label}
            {typeof x.count === "number" && <span className="font-mono text-[11px] tabular-nums text-[var(--dim)]">{x.count}</span>}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "flood" && <FloodTab flood={flood} outlook={outlook} />}
        {tab === "air" && <AirTab data={air} t={t} />}
        {tab === "fires" && <FiresTab data={fires} t={t} />}
      </div>
    </div>
  );
}

function FloodTab({ flood, outlook }: { flood: CnxFloodResponse | null; outlook: ProvinceOutlook | null }) {
  const river = useFeed<RiverLevelResponse>("/api/cnx/river-level", 5 * MIN);
  const dams = useFeed<DamResponse>("/api/cnx/dam", 30 * MIN);
  const rain = useFeed<RainResponse>("/api/cnx/rain", 5 * MIN);
  const floodHub = useFeed<FloodHubResponse>("/api/cnx/floodhub", 30 * MIN);
  const nowMs = useClock();
  return <FloodDesk flood={flood} river={river} dams={dams} rain={rain} floodHub={floodHub} outlook={outlook} nowMs={nowMs} />;
}

function AirTab({ data, t }: { data: AirQualityResponse | null; t: T }) {
  if (!data) return <div className="p-3 text-[12px] text-[var(--dim)]">{t("กำลังอ่านคุณภาพอากาศ…", "Loading air quality…")}</div>;
  return (
    <div className="px-3 py-2">
      <div className="mb-2 flex items-center justify-between border-b border-[var(--line)] pb-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--dim)]">{t("ค่าเฉลี่ย PM2.5 ทั้งจังหวัด", "Province average PM2.5")}</span>
        <div className="text-right">
          <div className="font-mono text-[18px] font-bold tabular-nums text-[var(--ink)]">{data.provinceAvgPm25 ?? "—"}</div>
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dim)]">µg/m³</div>
        </div>
      </div>
      <ul className="space-y-1">
        {data.stations.map((s) => (
          <li key={s.stationId} className="grid grid-cols-[1fr,auto] items-center gap-2 border-b border-[var(--line)] py-1 last:border-b-0">
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold text-[var(--ink)]">{s.name}</div>
              <div className="font-mono text-[11px] text-[var(--dim)]">PM10 {s.pm10?.toFixed(0) ?? "—"} · O₃ {s.o3?.toFixed(0) ?? "—"}</div>
            </div>
            {/* A missing reading is unknown, not a green zero. */}
            <span className={`px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${SEVERITY_CLASSES[typeof s.pm25 === "number" ? (s.aqiLevel ?? "unknown") : "unknown"]}`}>
              {typeof s.pm25 === "number" ? s.pm25.toFixed(0) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FiresTab({ data, t }: { data: CnxFiresResponse | null; t: T }) {
  const { lang } = useLang();
  const nowMs = useClock();
  if (!data) return <div className="p-3 text-[12px] text-[var(--dim)]">{t("กำลังอ่านจุดความร้อน…", "Loading fires…")}</div>;
  if (data.provenance !== "live") {
    return (
      <div className="p-3 text-[12px] leading-relaxed text-[var(--dim)]">
        {t("NASA FIRMS ไม่ส่งข้อมูลรอบล่าสุด — ไม่แสดงจุดตัวอย่างเป็นการตรวจพบ", "NASA FIRMS did not return a live pass. Illustrated hotspots are not listed as detections.")}
      </div>
    );
  }
  // Age of the newest detection, not of our response. Zero detections is a
  // real answer and says so, never a silent number.
  const observedAt = newest(data.hotspots, "detectedAt");
  const age = ageText({ observedAt: typeof observedAt === "number" ? new Date(observedAt).toISOString() : observedAt, ageMode: "time", staleAfterMs: 6 * 3_600_000 }, nowMs, lang);
  return (
    <div className="px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-[var(--line)] pb-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--dim)]">{t("จุดความร้อน FIRMS 24 ชม.", "FIRMS hotspots, 24 h")}</div>
          <div className={`font-mono text-[11px] ${age?.stale ? "text-status-watch" : "text-[var(--dim)]"}`}>
            VIIRS · {age ? age.text : t("ไม่มีการตรวจพบในช่วงนี้", "no detection in window")}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[18px] font-bold tabular-nums text-[var(--ink)]">{data.totalCount}</div>
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dim)]">
            {t("ในป่า", "forest")} {Math.round((data.forestShare ?? 0) * 100)}%
          </div>
        </div>
      </div>
      <ul className="space-y-1">
        {data.hotspots.slice(0, 8).map((h) => (
          <li key={h.id} className="grid grid-cols-[1fr,auto,auto] items-center gap-2 border-b border-[var(--line)] py-1 last:border-b-0">
            <div className="min-w-0">
              <div className="truncate font-mono text-[11px] text-[var(--ink)]">{h.id.slice(0, 16)}</div>
              <div className="font-mono text-[11px] text-[var(--dim)]">{h.latitude.toFixed(3)}, {h.longitude.toFixed(3)}</div>
            </div>
            <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">{h.brightness === null ? "—" : `${h.brightness.toFixed(0)}K`}</span>
            <span className={`px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] ${SEVERITY_CLASSES[h.severity]}`}>{severityLabel(t, h.severity)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
