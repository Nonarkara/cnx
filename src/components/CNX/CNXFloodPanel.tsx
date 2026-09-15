"use client";

// CNX flood / air-quality / fires operations panel — right rail.
//
// One panel, three sub-tabs:
//   1. Flood  — Ping basin gauges + Bhumibol / Sirikit storage
//   2. Air    — Open-Meteo CAMS stations, province-average PM2.5
//   3. Fires  — NASA FIRMS hotspots, forest-edge share
//
// Lopburi's panel uses a single stream; Chiang Mai's burning-season
// story demands Air + Fires on the same desk, so we keep them
// one panel with three sub-views.

import { useEffect, useMemo, useState } from "react";
import { Droplets, Wind, Flame } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import type {
  CnxFloodResponse,
  AirQualityResponse,
  CnxFiresResponse,
  SeverityLevel,
} from "../../types/cnx";

type Tab = "flood" | "air" | "fires";

const SEVERITY_CLASSES: Record<SeverityLevel, string> = {
  good: "bg-[var(--success)] text-white",
  watch: "bg-[#f59e0b] text-black",
  alert: "bg-[#fb923c] text-black",
  critical: "bg-[var(--danger)] text-white",
};

function severityLabel(s: SeverityLevel): string {
  return { good: "OK", watch: "WATCH", alert: "ALERT", critical: "CRIT" }[s];
}

interface PanelProps {
  flood: CnxFloodResponse | null;
  air: AirQualityResponse | null;
  fires: CnxFiresResponse | null;
}

export default function CnxFloodPanel({ flood, air, fires }: PanelProps) {
  const [tab, setTab] = useState<Tab>("flood");

  return (
    <div className="flex h-full flex-col overflow-hidden border-b border-[var(--line)] bg-[var(--bg-raised)]">
      <div className="flex shrink-0 border-b border-[var(--line)]">
        {(
          [
            { id: "flood", Icon: Droplets, label: "Flood", count: flood?.gauges.length },
            { id: "air", Icon: Wind, label: "Air", count: air?.stations.length },
            { id: "fires", Icon: Flame, label: "Fires", count: fires?.totalCount },
          ] as const
        ).map((t, i) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex min-h-[34px] flex-1 items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] ${
              i < 2 ? "border-r border-[var(--line)]" : ""
            } ${tab === t.id ? "bg-[var(--bg)] text-[var(--ink)]" : "text-[var(--dim)] hover:text-[var(--ink)]"}`}
          >
            <t.Icon className="h-3 w-3" />
            {t.label}
            {typeof t.count === "number" && (
              <span className="font-mono text-[9px] tabular-nums text-[var(--dim)]">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "flood" && <FloodTab data={flood} />}
        {tab === "air" && <AirTab data={air} />}
        {tab === "fires" && <FiresTab data={fires} />}
      </div>
    </div>
  );
}

function FloodTab({ data }: { data: CnxFloodResponse | null }) {
  if (!data) return <div className="p-3 text-[10px] text-[var(--dim)]">loading flood data…</div>;
  return (
    <div>
      {data.reservoirs.length > 0 && (
        <div className="border-b border-[var(--line)] px-3 py-2">
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--dim)]">
            Northern Dams
          </div>
          <div className="space-y-1.5">
            {data.reservoirs.map((r) => (
              <div key={r.damId} className="flex items-center gap-2">
                <span className="w-[110px] truncate text-[10px] font-semibold text-[var(--ink)]">
                  {r.name}
                </span>
                <div className="relative h-2 flex-1 border border-[var(--line)] bg-[var(--bg)]">
                  <div
                    className={`h-full ${r.severity === "alert" ? "bg-[#fb923c]" : r.severity === "watch" ? "bg-[#f59e0b]" : "bg-[var(--success)]"}`}
                    style={{ width: `${Math.min(100, r.fillFraction * 100)}%` }}
                  />
                </div>
                <span className="w-[40px] text-right font-mono text-[10px] tabular-nums text-[var(--ink)]">
                  {(r.fillFraction * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--dim)]">
            Ping Basin Gauges
          </span>
          {typeof data.pingCapacityFraction === "number" && (
            <span
              className={`rounded-sm px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] ${
                data.pingCapacityFraction > 0.85
                  ? SEVERITY_CLASSES.critical
                  : data.pingCapacityFraction > 0.7
                  ? SEVERITY_CLASSES.alert
                  : SEVERITY_CLASSES.good
              }`}
            >
              {Math.round(data.pingCapacityFraction * 100)}% capacity
            </span>
          )}
        </div>
        <div className="space-y-1">
          {data.gauges.map((g) => (
            <div
              key={g.stationId}
              className="grid grid-cols-[1fr,auto,auto] items-center gap-2 border-b border-[var(--line)] py-1 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate text-[10px] font-semibold text-[var(--ink)]">{g.name}</div>
                <div className="font-mono text-[9px] text-[var(--dim)]">{g.stationId} · {g.river}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[11px] font-bold tabular-nums text-[var(--ink)]">
                  {g.levelM.toFixed(2)}
                </div>
                <div className="font-mono text-[8px] text-[var(--dim)]">
                  {g.bankFullM ? `/ ${g.bankFullM.toFixed(2)} m` : ""}
                </div>
              </div>
              <span className={`rounded-sm px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] ${SEVERITY_CLASSES[g.severity]}`}>
                {severityLabel(g.severity)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AirTab({ data }: { data: AirQualityResponse | null }) {
  if (!data) return <div className="p-3 text-[10px] text-[var(--dim)]">loading air quality…</div>;
  return (
    <div className="px-3 py-2">
      <div className="mb-2 flex items-center justify-between border-b border-[var(--line)] pb-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--dim)]">
          Province Average PM2.5
        </span>
        <div className="text-right">
          <div className="font-mono text-[18px] font-bold tabular-nums text-[var(--ink)]">
            {data.provinceAvgPm25 ?? "—"}
          </div>
          <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--dim)]">µg/m³</div>
        </div>
      </div>
      <div className="space-y-1">
        {data.stations.map((s) => {
          const pm = s.pm25 ?? 0;
          return (
            <div
              key={s.stationId}
              className="grid grid-cols-[1fr,auto] items-center gap-2 border-b border-[var(--line)] py-1 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate text-[10px] font-semibold text-[var(--ink)]">{s.name}</div>
                <div className="font-mono text-[9px] text-[var(--dim)]">
                  PM10 {s.pm10?.toFixed(0) ?? "—"} · O₃ {s.o3?.toFixed(0) ?? "—"}
                </div>
              </div>
              <div className="text-right">
                <span
                  className={`rounded-sm px-1.5 py-0.5 font-mono text-[9px] tabular-nums ${SEVERITY_CLASSES[s.aqiLevel ?? "good"]}`}
                >
                  {pm.toFixed(0)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FiresTab({ data }: { data: CnxFiresResponse | null }) {
  if (!data) return <div className="p-3 text-[10px] text-[var(--dim)]">loading fires…</div>;
  return (
    <div className="px-3 py-2">
      <div className="mb-2 flex items-center justify-between border-b border-[var(--line)] pb-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--dim)]">
          FIRMS Hotspots (24 h)
        </span>
        <div className="text-right">
          <div className="font-mono text-[18px] font-bold tabular-nums text-[var(--ink)]">{data.totalCount}</div>
          <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--dim)]">
            forest {Math.round((data.forestShare ?? 0) * 100)}%
          </div>
        </div>
      </div>
      <div className="space-y-1">
        {data.hotspots.slice(0, 8).map((h) => (
          <div
            key={h.id}
            className="grid grid-cols-[1fr,auto,auto] items-center gap-2 border-b border-[var(--line)] py-1 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-[9px] text-[var(--ink)]">{h.id.slice(0, 16)}</div>
              <div className="font-mono text-[8px] text-[var(--dim)]">
                {h.latitude.toFixed(3)}, {h.longitude.toFixed(3)}
              </div>
            </div>
            <span className="font-mono text-[10px] tabular-nums text-[var(--ink)]">
              {h.brightness.toFixed(0)}K
            </span>
            <span
              className={`rounded-sm px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] ${SEVERITY_CLASSES[h.severity]}`}
            >
              {severityLabel(h.severity)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}