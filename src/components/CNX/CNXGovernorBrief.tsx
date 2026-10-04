"use client";

// Governor brief — one screen a governor can read in 30 seconds and forward
// to a LINE group: four hazards in plain Thai with source and age, the
// districts to call (worst air now, with last season's burned area beside
// it), and "copy for LINE" / print. Logic lives in lib/cnx/governor-brief.ts.

import { useEffect, useMemo, useState } from "react";
import { Copy, Printer, X } from "lucide-react";
import { useModalDialog } from "../../hooks/useModalDialog";
import { fetchJsonOrNull } from "../../lib/client-requests";
import type { ArrivalsResponse } from "../../lib/cnx/arrivals";
import type { BurnSeasonDoc } from "../../lib/cnx/burn-season";
import type { DustboyResponse } from "../../lib/cnx/dustboy";
import type { FloodHubResponse } from "../../lib/cnx/floodhub";
import { buildTiles, districtTable, isBriefObservationCurrent, lineText, pm25Band, type BriefLevel } from "../../lib/cnx/governor-brief";
import { buildExecutiveBrief } from "../../lib/cnx/executive-brief";
import type { FetchResult } from "../../lib/cnx/opensky";
import type { RiverGauge } from "../../lib/cnx/river-level";
import type { CnxTwinResponse } from "../../lib/cnx/twin";
import type { AirQualityResponse, CnxFiresResponse } from "../../types/cnx";
import { DataAge } from "./CNXDataAge";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  air: AirQualityResponse | null;
  dustboy: DustboyResponse | null;
  fires: CnxFiresResponse | null;
  twin: CnxTwinResponse | null;
  riverGauges: RiverGauge[];
  flights: FetchResult | null;
}

const LEVEL_CLS: Record<BriefLevel, string> = {
  good: "border-[var(--success)]",
  watch: "border-[#f59e0b]",
  alert: "border-[#fb923c]",
  critical: "border-[var(--danger)]",
  unknown: "border-[var(--line)]",
};
const LEVEL_TH: Record<BriefLevel, string> = { good: "ปกติ", watch: "เฝ้าระวัง", alert: "แจ้งเตือน", critical: "วิกฤต", unknown: "ไม่มีข้อมูล" };

export default function CnxGovernorBrief({ isOpen, onClose, air, dustboy, fires, twin, riverGauges, flights }: Props) {
  const dialogRef = useModalDialog(isOpen, onClose);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [isOpen]);
  const [arrivals, setArrivals] = useState<ArrivalsResponse | null>(null);
  const [floodhub, setFloodhub] = useState<FloodHubResponse | null>(null);
  const [burn, setBurn] = useState<BurnSeasonDoc | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    const opts = { signal: controller.signal };
    void fetchJsonOrNull<ArrivalsResponse>("/api/cnx/arrivals", opts).then((d) => d && setArrivals(d));
    void fetchJsonOrNull<FloodHubResponse>("/api/cnx/floodhub", opts).then((d) => d && setFloodhub(d));
    void fetchJsonOrNull<BurnSeasonDoc>("/data/cnx/burn-season.json", opts).then((d) => d && setBurn(d));
    return () => controller.abort();
  }, [isOpen]);

  const brief = useMemo(() => {
    const now = new Date(isOpen ? Math.max(clock, Date.now()) : clock);
    const executive = buildExecutiveBrief({ air, dustboy, fires, twin, riverGauges, flights, now });
    const historicalDistricts = districtTable(dustboy?.provenance === "live" ? dustboy.stations : [], burn, now);
    const districts = historicalDistricts.length ? historicalDistricts : executive.districts.map((d) => ({ ...d, burnedLastSeasonRai: null, forestShare: null }));
    const freshDust = dustboy?.provenance === "live" ? dustboy.stations.filter((s) => s.province === "เชียงใหม่" && s.pm25 !== null && !s.suspect && isBriefObservationCurrent(s.observedAt, now)) : [];
    const pcd = (air?.stations ?? []).filter((s) => s.source === "pcd" && typeof s.pm25 === "number" && isBriefObservationCurrent(s.observedAt, now));
    const airMetric = executive.metrics.find((m) => m.id === "air")!;
    const airGround = { avg: airMetric.state === "current" ? Number(airMetric.value) : null, stations: pcd.length || freshDust.length, observedAt: airMetric.observedAt, source: airMetric.source };
    const water = executive.metrics.find((m) => m.id === "water")!;
    const river = water.state === "current" ? { th: `${water.value} ${water.unit} · ${water.summaryTh}`, en: `${water.value} ${water.unit} · ${water.summaryEn}`, level: water.level, observedAt: water.observedAt, source: water.source } : null;
    const latestDetection = (fires?.hotspots ?? []).map((h) => h.detectedAt).filter((t) => Number.isFinite(Date.parse(t)) && Date.parse(t) <= now.getTime() + 300_000).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
    const yesterday = arrivals?.days[1];
    const tiles = buildTiles({
      now,
      airGround,
      worstDistrict: districts.find((d) => d.pm25 !== null) ?? null,
      fires: {
        live: fires?.provenance === "live" && isBriefObservationCurrent(fires.generatedAt, now),
        count: fires?.provenance === "live" ? fires.totalCount : null,
        observedAt: latestDetection,
        source: fires?.liveSource === "open-24h" ? "NASA VIIRS (open 24 h)" : "NASA FIRMS",
      },
      river,
      floodForecast: floodhub && floodhub.provenance === "live" ? { outlook: floodhub.outlook, points: floodhub.points.length } : null,
      arrivals: yesterday
        ? { date: yesterday.date, flights: yesterday.totalFlights, international: yesterday.internationalFlights, estimatedVisitors: yesterday.estimatedVisitors }
        : null,
    });
    const url = typeof window === "undefined" ? "https://cnx.nonarkara.org/cnx" : `${window.location.origin}/cnx`;
    const airTile = tiles.find((tile) => tile.key === "air");
    if (airTile) airTile.level = airMetric.level;
    const checks = executive.metrics.filter((m) => m.level !== "good");
    return { tiles, districts, checks, text: lineText(tiles, districts, now, url, checks.map((m) => `${m.titleTh}: ${m.actionTh}`)) };
  }, [air, dustboy, fires, twin, riverGauges, flights, arrivals, floodhub, burn, clock, isOpen]);

  if (!isOpen) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief.text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <div data-governor-brief="true" className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/60 p-4 print:static print:bg-white print:p-0" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Governor brief"
        className="relative my-6 w-full max-w-[1040px] rounded-lg border border-[var(--line)] bg-[var(--bg)] p-5 shadow-2xl sm:p-8 print:my-0 print:border-0 print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-start justify-between gap-5 border-b border-[var(--line)] pb-6 sm:flex-row">
          <div>
            <div className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--cool)]">Governor brief</div>
            <h2 lang="th" className="mt-1 text-[25px] font-semibold sm:text-[30px] text-[var(--ink)]">สรุปสถานการณ์จังหวัดเชียงใหม่</h2>
            <p lang="th" className="text-[12px] text-[var(--dim)]">{brief.text.split("\n")[0].replace("สรุปสถานการณ์จังหวัดเชียงใหม่ ", "")}</p>
          </div>
          <div className="flex w-full shrink-0 flex-wrap gap-2 print:hidden sm:w-auto">
            <button type="button" onClick={copy} className="cnx-primary-action flex min-h-11 items-center gap-2 rounded-md border px-4 text-[13px] font-semibold">
              <Copy className="h-3.5 w-3.5" />
              {copyState === "copied" ? "คัดลอกแล้ว" : "คัดลอกส่ง LINE"}
            </button>
            <button type="button" onClick={() => window.print()} className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] px-3 text-[12px]">
              <Printer className="h-3.5 w-3.5" /> พิมพ์
            </button>
            <button type="button" onClick={onClose} aria-label="Close governor brief" className="ml-auto flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--line)]">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <p role="status" className="mt-3 text-sm text-[var(--dim)] print:hidden">{copyState === "failed" ? "คัดลอกไม่สำเร็จ เปิดข้อความด้านล่างแล้วเลือกคัดลอกด้วยตนเอง · Copy failed; select the text below to copy manually." : copyState === "copied" ? "คัดลอกข้อความพร้อมแหล่งที่มาและเวลาอ้างอิงแล้ว" : "พร้อมส่งต่อทาง LINE หรือพิมพ์ โดยคงแหล่งที่มาและเวลาอ้างอิง"}</p>
        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          {brief.tiles.map((t) => (
            <div key={t.key} className={`border-l-4 ${LEVEL_CLS[t.level]} border-y border-r border-y-[var(--line)] border-r-[var(--line)] bg-[var(--bg-surface)] p-4`}>
              <div className="flex items-baseline justify-between gap-2">
                <span lang="th" className="text-[14px] font-bold text-[var(--ink)]">{t.titleTh}</span>
                <span lang="th" className="font-mono text-[10px] uppercase text-[var(--dim)]">{LEVEL_TH[t.level]}</span>
              </div>
              <p lang="th" className="mt-1 text-[17px] leading-relaxed text-[var(--ink)]">{t.th}</p>
              <p className="mt-2 text-[13px] text-[var(--dim)]">{t.en}</p>
              <p className="mt-3 text-[12px] text-[var(--dim)]">
                {/* DataAge prints the source itself; without a time, print it plainly. */}
                {t.observedAt ? <DataAge observedAt={t.observedAt} source={t.key === "fire" ? `${t.source} · latest detection` : t.source} staleAfterMs={t.key === "fire" ? 24 * 3600_000 : 3 * 3600_000} /> : t.source}
              </p>
            </div>
          ))}
        </section>

        {brief.checks.length > 0 && <section className="mt-6 border-t border-[var(--line)] pt-5">
          <h3 lang="th" className="text-lg font-semibold">ประเด็นที่ควรตรวจสอบต่อ</h3>
          <ol className="mt-3 space-y-3">{brief.checks.map((m) => <li key={m.id} className="text-sm leading-relaxed"><span className="font-semibold">{m.titleTh} · </span>{m.actionTh}</li>)}</ol>
        </section>}
        <section className="mt-6 overflow-x-auto">
          <h3 lang="th" className="text-[13px] font-bold text-[var(--ink)]">อำเภอที่ควรติดตาม · Districts to call</h3>
          <p className="text-[11px] text-[var(--dim)]">
            PM2.5 now = average of CMU DustBoy ground sensors in the district (suspect sensors excluded). Burned last season = HII
            Tamroypao, monthly sums (a field burned twice counts twice).
          </p>
          <table className="mt-2 w-full border-collapse text-[12px] tabular-nums">
            <thead>
              <tr className="text-left font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--dim)]">
                <th className="py-1 font-normal">อำเภอ</th>
                <th className="py-1 text-right font-normal">PM2.5 now</th>
                <th className="py-1 text-right font-normal">Sensors</th>
                <th className="py-1 text-right font-normal">Burned 2569 (rai)</th>
                <th className="py-1 text-right font-normal">Forest share</th>
              </tr>
            </thead>
            <tbody>
              {brief.districts.length === 0 && <tr><td colSpan={5} className="py-5 text-sm text-[var(--dim)]">ยังไม่มีข้อมูลรายอำเภอที่ผ่านเงื่อนไข · No qualifying district evidence.</td></tr>}
              {brief.districts.slice(0, 10).map((d) => (
                <tr key={d.th} className="border-t border-[var(--line)]">
                  <td lang="th" className="py-1">
                    {d.th} <span className="text-[var(--dim)]">({d.en})</span>
                    {d.observedAt && <span className="mt-1 block text-[11px] text-[var(--dim)]">{new Date(d.observedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" })}</span>}
                  </td>
                  <td className="py-1 text-right">{d.pm25 === null ? "—" : <span title={pm25Band(d.pm25).th}>{d.pm25}</span>}</td>
                  <td className="py-1 text-right text-[var(--dim)]">{d.sensors || "—"}</td>
                  <td className="py-1 text-right">{d.burnedLastSeasonRai?.toLocaleString("en-US") ?? "—"}</td>
                  <td className="py-1 text-right text-[var(--dim)]">{d.forestShare === null ? "—" : `${d.forestShare}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <details className="mt-4 print:hidden">
          <summary className="cursor-pointer text-[12px] text-[var(--dim)]">ข้อความที่จะคัดลอก (LINE)</summary>
          <pre lang="th" className="mt-2 whitespace-pre-wrap border border-[var(--line)] bg-[var(--bg-surface)] p-3 font-sans text-[12px] text-[var(--ink)]">
            {brief.text}
          </pre>
        </details>
      </div>
    </div>
  );
}
