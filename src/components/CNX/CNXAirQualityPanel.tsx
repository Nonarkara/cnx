"use client";

// CNX Air Quality — governor's "Focus on air quality" desk.
//
// Combines three feeds into one operator-friendly panel:
//   1. GISTDA / Longdo PM2.5 — per-amphoe (25 districts), ranked by
//      current PM2.5 µg/m³; each row a coloured bar with the 24h
//      rolling average. Above 50 µg/m³ flips to "alert" and the
//      bar turns orange.
//   2. GISTDA PM2.5 history at the CNX center point — 24 hourly
//      readings plotted as a tiny sparkline so the governor can see
//      "is the haze rising or falling right now?"
//   3. CN AQI (aqicn.org) cross-check — a small station count and
//      median so we're not betting on GISTDA alone.
//
// Board display bands: <25 / <50 / <90 / >=90 µg/m³.
// These application bands are not official health or AQI categories.

import { useEffect, useState } from "react";
import { Wind, AlertTriangle, ExternalLink } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import { DataAge } from "./CNXDataAge";
import { useLang } from "../../hooks/useLang";
import { pick, type Lang } from "../../lib/i18n";
import type { GistdaPm25Response } from "../../lib/cnx/gistda-pm25";

const SEVERITY_CLASSES: Record<string, string> = {
  unknown: "bg-[var(--line)] text-[var(--dim)]",
  good: "sev-fill-good",
  watch: "sev-fill-watch",
  alert: "sev-fill-alert",
  critical: "sev-fill-critical",
};

const SEVERITY_LABEL: Record<string, { th: string; en: string }> = {
  unknown: { th: "ไม่ทราบ", en: "UNKNOWN" },
  good: { th: "ต่ำ", en: "LOW" },
  watch: { th: "เฝ้าระวัง", en: "WATCH" },
  alert: { th: "เตือนภัย", en: "ALERT" },
  critical: { th: "วิกฤต", en: "CRIT" },
};

function severityLabel(s: string, lang: Lang) {
  const label = SEVERITY_LABEL[s];
  return label ? pick(lang, label.th, label.en) : s;
}

interface CnAqiResponse {
  cnAqi: { center: { lat: number; lon: number; aqi?: number; pm25?: number }; bbox: { lat: number; lon: number; aqi?: number; pm25?: number }[] };
  pm25: GistdaPm25Response;
}

function Sparkline({ points }: { points: { pm25: number; ts: string }[] }) {
  const { t } = useLang();
  if (points.length === 0) return <div className="h-6 w-full bg-[var(--bg)]" />;
  const values = points.map((p) => p.pm25);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 25);
  const width = 200;
  const height = 24;
  const step = width / Math.max(1, values.length - 1);
  const path = values
    .map((v, i) => {
      const x = values.length === 1 ? width / 2 : i * step;
      const y = height - ((v - min) / Math.max(1, max - min)) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = values[values.length - 1];
  const lastColor =
    last < 25 ? "var(--sev-good)" : last < 50 ? "var(--sev-watch)" : last < 90 ? "var(--sev-alert)" : "var(--sev-critical)";
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-6 w-full" preserveAspectRatio="none" role="img" aria-label={t(`PM2.5 ${points.length} ค่า; ล่าสุด ${last} ไมโครกรัมต่อลูกบาศก์เมตร${points.length === 1 ? "; ตัวอย่างไม่พอแสดงแนวโน้ม" : ""}`, `${points.length} PM2.5 observations; latest ${last} micrograms per cubic metre${points.length === 1 ? "; insufficient samples to show a trend" : ""}`)}>
      <path d={path} fill="none" stroke="var(--cool)" strokeWidth="1.4" />
      <circle cx={values.length === 1 ? width / 2 : width} cy={height - ((last - min) / Math.max(1, max - min)) * height} r="2.4" fill={lastColor} />
      <line x1="0" y1={height - ((50 - min) / Math.max(1, max - min)) * height} x2={width} y2={height - ((50 - min) / Math.max(1, max - min)) * height} stroke="var(--sev-watch)" strokeWidth="0.5" strokeDasharray="3 2" />
    </svg>
  );
}

export default function CnxAirQualityPanel() {
  const { lang, t } = useLang();
  const [data, setData] = useState<CnAqiResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setStatus("loading");
      const next = await fetchJsonOrNull<CnAqiResponse>("/api/cnx/aqi-amphoe", { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (next) setData(next);
      setStatus(next ? "ready" : "failed");
    };
    void load();
    const interval = window.setInterval(() => void load(), 5 * 60_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [attempt]);

  const retry = <button type="button" disabled={status === "loading"} onClick={() => setAttempt((value) => value + 1)} className="min-h-11 border border-[var(--line)] px-3 text-[12px] font-bold text-[var(--cool)] disabled:opacity-60">{status === "loading" ? t("กำลังรีเฟรช…", "Refreshing…") : t("ลองอีกครั้ง", "Retry")}</button>;

  if (!data || data.pm25.provenance === "unavailable") {
    return (
      <section aria-label={t("คุณภาพอากาศรายอำเภอ", "District air quality")} className="border-t border-[var(--line)] bg-[var(--bg-raised)] p-3 text-[12px] text-[var(--dim)]">
        <p role="status" className="mb-2">{status === "loading" ? t("กำลังโหลด PM2.5 รายอำเภอ…", "Loading district PM2.5…") : t("ข้อมูลอากาศรายอำเภอไม่พร้อมใช้งาน", "District air-quality readings unavailable")}</p>
        {status !== "loading" && <p className="mb-2">{data?.pm25.provenanceNote ?? t("ติดต่อแหล่งข้อมูลไม่ได้ · ไม่มีค่าที่วัด", "The source could not be reached. No reading is available.")}</p>}
        {retry}
      </section>
    );
  }

  const { pm25, cnAqi } = data;
  const criticalAmphoe = pm25.amphoe.filter((a) => a.severity === "alert" || a.severity === "critical");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)]">
      {status === "failed" && <div role="status" className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] p-2 text-[12px]">{t("รีเฟรชไม่สำเร็จ · แสดงค่าครั้งก่อน", "Refresh failed; showing the previous readings.")} {retry}</div>}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2">
        <div className="flex items-center gap-2">
          <Wind className="h-3.5 w-3.5 text-[var(--cool)]" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
            {t(`คุณภาพอากาศ · ${pm25.amphoe.length} อำเภอ`, `Air quality · ${pm25.amphoe.length} ${pm25.amphoe.length === 1 ? "district" : "districts"}`)}
          </span>
        </div>
        {criticalAmphoe.length > 0 && (
          <span className="flex items-center gap-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--sev-critical)]">
            <AlertTriangle className="h-3 w-3" />
            {t(`${criticalAmphoe.length} อำเภอ`, `${criticalAmphoe.length} ${criticalAmphoe.length === 1 ? "district" : "districts"}`)} ≥ 50 µg/m³
          </span>
        )}
      </header>

      <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--line)] px-3 py-2">
        <span
          className={`px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] ${SEVERITY_CLASSES[pm25.severity]}`}
        >
          {severityLabel(pm25.severity, lang)}
        </span>
        <span className="font-mono text-[22px] font-bold tabular-nums text-[var(--ink)]">{pm25.pm25?.toFixed(0) ?? "—"}</span>
        <span className="font-mono text-[11px] text-[var(--dim)]">µg/m³</span>
        <span className="font-mono text-[11px] text-[var(--dim)]">
          | AQI {pm25.pm25Aqi ?? "—"} | {t("เฉลี่ย 24 ชม.", "24h mean")} {pm25.pm25Avg24hrs?.toFixed(0) ?? "—"} | {t("เฉลี่ยจังหวัด", "province avg")} {pm25.provinceAveragePm25?.toFixed(1) ?? "—"}
        </span>
      </div>

      <div className="shrink-0 border-b border-[var(--line)] bg-[var(--bg)] px-3 py-2">
        <DataAge observedAt={pm25.observedAt} source="GISTDA / Longdo" staleAfterMs={3 * 3_600_000} className="mb-1 block" />
        <div className="mb-0.5 flex flex-wrap items-center justify-between gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dim)]">
          <span>{t("แนวโน้ม 24 ชม.", "24h trend")} · {t(pm25.locName.th, pm25.locName.en)}</span>
          <span>GISTDA / Longdo · {t("เกณฑ์ 50 µg/m³", "50 µg/m³ threshold")}</span>
        </div>
        <Sparkline points={pm25.history24h} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table aria-label={t("PM2.5 รายอำเภอ หน่วยไมโครกรัมต่อลูกบาศก์เมตร", "District PM2.5 in micrograms per cubic metre")} className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 bg-[var(--bg-raised)]">
            <tr className="border-b border-[var(--line)]">
              <th className="px-3 py-1.5 text-left font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--dim)]">
                {t("อำเภอ", "District")}
              </th>
              <th className="px-2 py-1.5 text-right font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--dim)]">
                PM2.5
              </th>
              <th className="hidden px-2 py-1.5 text-right font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--dim)] md:table-cell">
                {t("24 ชม.", "24 h")}
              </th>
              <th className="px-3 py-1.5 text-left font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--dim)]">
                {t("ระดับ", "Level")}
              </th>
            </tr>
          </thead>
          <tbody>
            {pm25.amphoe.map((a) => {
              const pct = Math.min(100, (a.pm25 / 100) * 100);
              return (
                <tr key={a.ap_idn} className="border-b border-[var(--line)]">
                  <td className="px-3 py-1">
                    <div className="font-semibold text-[var(--ink)]">{t(a.ap_tn, a.ap_en)}</div>
                  </td>
                  <td className="px-2 py-1 text-right">
                    <span className={`px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${SEVERITY_CLASSES[a.severity]}`}>
                      {a.pm25.toFixed(0)}
                    </span>
                  </td>
                  <td className="hidden px-2 py-1 text-right font-mono text-[11px] tabular-nums text-[var(--dim)] md:table-cell">
                    {a.pm25Avg24hr.toFixed(1)}
                  </td>
                  <td className="px-3 py-1">
                    <span className="mb-1 block text-[11px]">{severityLabel(a.severity, lang)}</span>
                    <div aria-hidden="true" className="relative h-2 w-full bg-[var(--bg)]">
                      <div
                        className={`h-full ${SEVERITY_CLASSES[a.severity].split(" ")[0]}`}
                        style={{ width: `${pct}%`, opacity: 0.85 }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="shrink-0 border-t border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 font-mono text-[11px] text-[var(--dim)]">
        {cnAqi.bbox.length > 0 && (
          <span>
            {t(`AQI เทียบตรวจ (ดัชนี คนละมาตรา) · aqicn.org ${cnAqi.bbox.length} สถานี · AQI ใจกลาง ${cnAqi.center.aqi ?? "—"}`, `AQI cross-check (index, separate scale) · aqicn.org ${cnAqi.bbox.length} stations · center AQI ${cnAqi.center.aqi ?? "—"}`)}
          </span>
        )}{" "}
        <span className="block">{t("แถบสีของบอร์ด: <25 / <50 / <90 / ≥90 µg/m³ · ไม่ใช่ระดับ AQI ทางการ", "Board display bands: <25 / <50 / <90 / ≥90 µg/m³; not official AQI categories.")}</span>
        <a
          href="https://air4thai.pcd.go.th/"
          target="_blank"
          rel="noreferrer"
          className="ml-2 inline-flex items-center gap-0.5 text-[var(--cool)] hover:underline"
        >
          <ExternalLink className="h-2.5 w-2.5" /> Air4Thai
        </a>
      </footer>
    </div>
  );
}