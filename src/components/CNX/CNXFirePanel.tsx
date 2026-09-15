"use client";

// CNX Fire Safety Panel — the governor's #1 priority.
//
// Two sources render side-by-side:
//   - Royal Forest Department (RFD) hotspots — official MODIS/VIIRS
//     detection points from wildfire.forest.go.th/getdb.php, with the
//     Thai forest-tenure classification (DNP / NRF / ALOW / CMF / FIO).
//   - NASA FIRMS — global VIIRS/MODIS — already wired from earlier work.
//
// Plus the AOD (aerosol optical depth) overlay from Open-Meteo CAMS.
//
// Office notice logic: when RFD hotspots inside forest reserves
//   (DNP / NRF) > 5 in last 24 h, escalate to "critical". This is the
//   metric the governor needs at a glance.

import { useEffect, useMemo, useState } from "react";
import { Flame, Wind, ExternalLink, MapPin, Satellite } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import type { CnxFiresResponse, FireHotspot } from "../../types/cnx";
import type { RfdFiresResponse } from "../../lib/cnx/fire-rfd";
import { rfdToFireHotspot } from "../../lib/cnx/fire-rfd";
import type { AerosolResponse } from "../../lib/cnx/aerosol";

type Tab = "rfd" | "firms" | "aerosol";

const TENURE_LABEL: Record<string, { th: string; en: string }> = {
  DNP: { th: "ป่าอนุรักษ์", en: "Conservation" },
  NRF: { th: "ป่าสงวนฯ", en: "National Reserve" },
  ALOW: { th: "ป่าส่วนราชการ", en: "Govt Use" },
  CMF: { th: "ป่าชุมชน", en: "Community Forest" },
  FIO: { th: "อ.อ.ป.", en: "FIO Plantation" },
  SD: { th: "นิคมสร้างตนเอง", en: "Self-help" },
  CP: { th: "นิคมสหกรณ์", en: "Cooperative" },
  DOL: { th: "ที่ น.ส.ล.", en: "Land Docs" },
  TD: { th: "ที่ราชพัสดุ", en: "Crown Land" },
  ALRO: { th: "ส.ป.ก.", en: "ALRO" },
  OTHER: { th: "พื้นที่อื่น ๆ", en: "Other" },
};

const SEVERITY_CLASSES: Record<string, string> = {
  good: "bg-[var(--success)] text-white",
  watch: "bg-[#f59e0b] text-black",
  alert: "bg-[#fb923c] text-black",
  critical: "bg-[var(--danger)] text-white",
};

function severityLabel(s: string) {
  return { good: "OK", watch: "WATCH", alert: "ALERT", critical: "CRIT" }[s as keyof typeof SEVERITY_CLASSES] ?? s;
}

interface PanelProps {
  firms: CnxFiresResponse | null;
  rfd: RfdFiresResponse | null;
  aerosol: AerosolResponse | null;
}

export default function CnxFirePanel({ firms, rfd, aerosol }: PanelProps) {
  const [tab, setTab] = useState<Tab>("rfd");

  return (
    <div className="flex h-full flex-col overflow-hidden border-b border-[var(--line)] bg-[var(--bg-raised)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2">
        <div className="flex items-center gap-2">
          <Flame className="h-3.5 w-3.5 text-[var(--danger)]" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
            Fire / Aerosol
          </span>
        </div>
        {aerosol && (
          <span
            className={`rounded-sm px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] ${SEVERITY_CLASSES[aerosol.level]}`}
          >
            AOD {aerosol.aod550}
          </span>
        )}
      </header>

      <div className="flex shrink-0 border-b border-[var(--line)]">
        {(
          [
            { id: "rfd", label: "RFD", count: rfd?.totalCount },
            { id: "firms", label: "FIRMS", count: firms?.totalCount },
            { id: "aerosol", label: "AOD", count: undefined },
          ] as const
        ).map((t, i) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex min-h-[34px] flex-1 items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] ${
              i < 2 ? "border-r border-[var(--line)]" : ""
            } ${tab === t.id ? "bg-[var(--bg)] text-[var(--ink)]" : "text-[var(--dim)] hover:text-[var(--ink)]"}`}
          >
            {t.id === "rfd" && <Satellite className="h-3 w-3" />}
            {t.id === "firms" && <Flame className="h-3 w-3" />}
            {t.id === "aerosol" && <Wind className="h-3 w-3" />}
            {t.label}
            {typeof t.count === "number" && (
              <span className="font-mono text-[9px] tabular-nums text-[var(--dim)]">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "rfd" && <RfdTab rfd={rfd} />}
        {tab === "firms" && <FirmsTab firms={firms} />}
        {tab === "aerosol" && <AerosolTab aerosol={aerosol} />}
      </div>
    </div>
  );
}

function RfdTab({ rfd }: { rfd: RfdFiresResponse | null }) {
  const topTypes = useMemo(() => {
    if (!rfd) return [] as { type: string; count: number }[];
    return Object.entries(rfd.byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([type, count]) => ({ type, count }));
  }, [rfd]);
  if (!rfd) return <div className="p-3 text-[10px] text-[var(--dim)]">loading RFD hotspots…</div>;
  return (
    <div>
      <div className="border-b border-[var(--line)] px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--dim)]">
            RFD Hotspots (7 d)
          </span>
          <div className="text-right">
            <div className="font-mono text-[18px] font-bold tabular-nums text-[var(--ink)]">{rfd.totalCount}</div>
            <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--dim)]">
              forest {(rfd.forestShare * 100).toFixed(0)}%
            </div>
          </div>
        </div>
        <div className="space-y-1">
          {topTypes.map((t) => (
            <div key={t.type} className="flex items-center gap-2">
              <span className="w-[110px] truncate text-[10px] font-semibold text-[var(--ink)]">
                {TENURE_LABEL[t.type]?.en ?? t.type}
              </span>
              <div className="relative h-2 flex-1 border border-[var(--line)] bg-[var(--bg)]">
                <div
                  className={`h-full ${
                    t.type === "DNP" || t.type === "NRF"
                      ? "bg-[var(--danger)]"
                      : t.type === "ALOW" || t.type === "CMF"
                      ? "bg-[#fb923c]"
                      : "bg-[#f59e0b]"
                  }`}
                  style={{ width: `${Math.min(100, (t.count / Math.max(1, rfd.totalCount)) * 100)}%` }}
                />
              </div>
              <span className="w-[28px] text-right font-mono text-[10px] tabular-nums text-[var(--ink)]">{t.count}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-3 py-2">
        {rfd.hotspots.length === 0 ? (
          <p className="text-[10px] text-[var(--dim)]">
            No RFD hotspots in the CNX bbox for the last 7 days. (Possibly the
            upstream service is offline or the province is in a quiet period.)
          </p>
        ) : (
          <div className="space-y-1">
            {rfd.hotspots.slice(0, 12).map((h, i) => (
              <a
                key={i}
                href={`https://wildfire.forest.go.th/firemap?datestart=${h.yymmdd}&dateend=${h.yymmdd}&province=${encodeURIComponent("เชียงใหม่")}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col border-b border-[var(--line)] py-1 last:border-b-0 hover:bg-[var(--sun-dim)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 truncate text-[10px] font-semibold text-[var(--ink)]">
                    <MapPin className="h-2.5 w-2.5 text-[var(--danger)]" />
                    {h.aumper} · {h.tumbon}
                  </span>
                  <ExternalLink className="h-2.5 w-2.5 shrink-0 text-[var(--dim)]" />
                </div>
                <div className="flex items-center gap-2 font-mono text-[8px] text-[var(--dim)]">
                  <span>{h.yymmdd} {h.time}</span>
                  <span>{TENURE_LABEL[h.type]?.th ?? h.type}</span>
                  <span>{h.confidence}%</span>
                  {h.frp && <span>FRP {h.frp.toFixed(1)} MW</span>}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FirmsTab({ firms }: { firms: CnxFiresResponse | null }) {
  if (!firms) return <div className="p-3 text-[10px] text-[var(--dim)]">loading FIRMS…</div>;
  return (
    <div className="px-3 py-2">
      <div className="mb-2 flex items-center justify-between border-b border-[var(--line)] pb-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--dim)]">
          FIRMS Hotspots (NASA)
        </span>
        <div className="text-right">
          <div className="font-mono text-[18px] font-bold tabular-nums text-[var(--ink)]">{firms.totalCount}</div>
          <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--dim)]">
            forest {((firms.forestShare ?? 0) * 100).toFixed(0)}%
          </div>
        </div>
      </div>
      <div className="space-y-1">
        {firms.hotspots.slice(0, 10).map((h) => (
          <div
            key={h.id}
            className="grid grid-cols-[1fr,auto,auto] items-center gap-2 border-b border-[var(--line)] py-1 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-[9px] text-[var(--ink)]">{h.id.slice(0, 14)}</div>
              <div className="font-mono text-[8px] text-[var(--dim)]">
                {h.latitude.toFixed(3)}, {h.longitude.toFixed(3)} · {h.satellite}
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

function AerosolTab({ aerosol }: { aerosol: AerosolResponse | null }) {
  if (!aerosol) return <div className="p-3 text-[10px] text-[var(--dim)]">loading AOD…</div>;
  return (
    <div className="px-3 py-2">
      <div className="mb-3 border-b border-[var(--line)] pb-2">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--dim)]">
            Province AOD (550 nm)
          </span>
          <span className={`rounded-sm px-2 py-0.5 font-mono text-[10px] ${SEVERITY_CLASSES[aerosol.level]}`}>
            {severityLabel(aerosol.level)}
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-mono text-[22px] font-bold tabular-nums text-[var(--ink)]">
            {aerosol.aod550.toFixed(3)}
          </span>
          <span className="font-mono text-[9px] text-[var(--dim)]">
            range {aerosol.aodMin.toFixed(3)}–{aerosol.aodMax.toFixed(3)}
          </span>
        </div>
      </div>
      <p className="mb-2 text-[10px] text-[var(--dim)]">
        Aerosol Optical Depth at 550 nm from Copernicus Atmosphere
        Monitoring Service (CAMS) on Open-Meteo. 0–0.10 = clear,
        0.10–0.25 = elevated (burning-season watch), 0.25–0.40 = haze,
        0.40+ = dense.
      </p>
      <a
        href="https://air-quality-api.open-meteo.com/"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 text-[10px] text-[var(--cool)] hover:underline"
      >
        <ExternalLink className="h-2.5 w-2.5" />
        Open-Meteo CAMS source
      </a>
      <div className="mt-3 text-[8px] font-mono uppercase tracking-[0.12em] text-[var(--dim)]">
        Map overlay tile
      </div>
      <div className="mt-1 truncate font-mono text-[9px] text-[var(--dim)]">{aerosol.tileUrl}</div>
    </div>
  );
}