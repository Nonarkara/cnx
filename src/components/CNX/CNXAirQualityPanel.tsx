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
// Severity thresholds follow Thailand's PCD standard:
//   good ≤ 25 µg/m³, watch ≤ 50, alert ≤ 90, critical > 90.

import { useEffect, useState } from "react";
import { Wind, AlertTriangle, ExternalLink } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import type { GistdaPm25Response } from "../../lib/cnx/gistda-pm25";

const SEVERITY_CLASSES: Record<string, string> = {
  good: "bg-[var(--success)] text-white",
  watch: "bg-[#f59e0b] text-black",
  alert: "bg-[#fb923c] text-black",
  critical: "bg-[var(--danger)] text-white",
};

function severityLabel(s: string) {
  return { good: "OK", watch: "WATCH", alert: "ALERT", critical: "CRIT" }[s as keyof typeof SEVERITY_CLASSES] ?? s;
}

interface CnAqiResponse {
  cnAqi: { center: { lat: number; lon: number; aqi?: number; pm25?: number }; bbox: { lat: number; lon: number; aqi?: number; pm25?: number }[] };
  pm25: GistdaPm25Response;
}

function Sparkline({ points }: { points: { pm25: number; ts: string }[] }) {
  if (points.length === 0) return <div className="h-6 w-full bg-[var(--bg)]" />;
  const values = points.map((p) => p.pm25);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 25);
  const width = 200;
  const height = 24;
  const step = width / (values.length - 1);
  const path = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / Math.max(1, max - min)) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = values[values.length - 1];
  const lastColor =
    last < 25 ? "var(--success)" : last < 50 ? "#f59e0b" : last < 90 ? "#fb923c" : "var(--danger)";
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-6 w-full" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="var(--cool)" strokeWidth="1.4" />
      <circle cx={width} cy={height - ((last - min) / Math.max(1, max - min)) * height} r="2.4" fill={lastColor} />
      <line x1="0" y1={height - ((50 - min) / Math.max(1, max - min)) * height} x2={width} y2={height - ((50 - min) / Math.max(1, max - min)) * height} stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="3 2" />
    </svg>
  );
}

export default function CnxAirQualityPanel() {
  const [data, setData] = useState<CnAqiResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchJsonOrNull<CnAqiResponse>("/api/cnx/aqi-amphoe");
      if (!cancelled && next) setData(next);
    };
    void load();
    const interval = window.setInterval(() => void load(), 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!data) {
    return (
      <div className="border-t border-[var(--line)] bg-[var(--bg-raised)] p-3 text-[10px] text-[var(--dim)]">
        Loading GISTDA PM2.5 by amphoe…
      </div>
    );
  }

  const { pm25, cnAqi } = data;
  const criticalAmphoe = pm25.amphoe.filter((a) => a.severity === "alert" || a.severity === "critical");

  return (
    <div className="flex flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2">
        <div className="flex items-center gap-2">
          <Wind className="h-3.5 w-3.5 text-[var(--cool)]" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
            Air Quality · 25 Amphoe
          </span>
        </div>
        {criticalAmphoe.length > 0 && (
          <span className="flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--danger)]">
            <AlertTriangle className="h-3 w-3" />
            {criticalAmphoe.length} {criticalAmphoe.length === 1 ? "amphoe" : "amphoes"} above 50 µg/m³
          </span>
        )}
      </header>

      <div className="flex shrink-0 items-baseline gap-3 border-b border-[var(--line)] px-3 py-2">
        <span
          className={`rounded-sm px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] ${SEVERITY_CLASSES[pm25.severity]}`}
        >
          {severityLabel(pm25.severity)}
        </span>
        <span className="font-mono text-[22px] font-bold tabular-nums text-[var(--ink)]">{pm25.pm25.toFixed(0)}</span>
        <span className="font-mono text-[9px] text-[var(--dim)]">µg/m³</span>
        <span className="font-mono text-[10px] text-[var(--dim)]">
          | AQI {pm25.pm25Aqi} | 24h mean {pm25.pm25Avg24hrs.toFixed(0)} | province avg {pm25.provinceAveragePm25.toFixed(1)}
        </span>
      </div>

      <div className="shrink-0 border-b border-[var(--line)] bg-[var(--bg)] px-3 py-2">
        <div className="mb-0.5 flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--dim)]">
          <span>24h trend · {pm25.locName.en} ({pm25.locName.th})</span>
          <span>GISTDA / Longdo · 50 µg/m³ threshold</span>
        </div>
        <Sparkline points={pm25.history24h} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-[10px]">
          <thead className="sticky top-0 bg-[var(--bg-raised)]">
            <tr className="border-b border-[var(--line)]">
              <th className="px-3 py-1.5 text-left font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--dim)]">
                Amphoe
              </th>
              <th className="px-2 py-1.5 text-right font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--dim)]">
                Now
              </th>
              <th className="hidden px-2 py-1.5 text-right font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--dim)] md:table-cell">
                24 h
              </th>
              <th className="px-3 py-1.5 text-left font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--dim)]">
                Bar
              </th>
            </tr>
          </thead>
          <tbody>
            {pm25.amphoe.map((a) => {
              const pct = Math.min(100, (a.pm25 / 100) * 100);
              return (
                <tr key={a.ap_idn} className="border-b border-[var(--line)]">
                  <td className="px-3 py-1">
                    <div className="font-semibold text-[var(--ink)]">{a.ap_en}</div>
                    <div className="font-mono text-[8px] text-[var(--dim)]">{a.ap_tn}</div>
                  </td>
                  <td className="px-2 py-1 text-right">
                    <span className={`rounded-sm px-1.5 py-0.5 font-mono text-[9px] tabular-nums ${SEVERITY_CLASSES[a.severity]}`}>
                      {a.pm25.toFixed(0)}
                    </span>
                  </td>
                  <td className="hidden px-2 py-1 text-right font-mono text-[9px] tabular-nums text-[var(--dim)] md:table-cell">
                    {a.pm25Avg24hr.toFixed(1)}
                  </td>
                  <td className="px-3 py-1">
                    <div className="relative h-2 w-full bg-[var(--bg)]">
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

      <footer className="shrink-0 border-t border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 font-mono text-[8px] text-[var(--dim)]">
        {cnAqi.bbox.length > 0 && (
          <span>
            Cross-check · aqicn.org {cnAqi.bbox.length} stations ·
            center AQI {cnAqi.center.aqi ?? "—"}
          </span>
        )}{" "}
        <a
          href={`https://air4thai.pcd.go.th/webV2/history/PM25/${pm25.locName.en ? "" : ""}?province=50`}
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