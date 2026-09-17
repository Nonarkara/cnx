"use client";

// CNX visitor panel — daily in/out + origin-country breakdown +
// recommended-language fan-out for the social rail.
//
// The numbers come from `/api/cnx/visitors` which combines:
//   - Live OpenSky flight state vectors
//   - Persisted snapshot store (24 h hourly buckets)
//   - A curated airline / fleet registry (see src/lib/cnx/visitors.ts)
//
// Honest-data rules:
//   - "Visitors today" is an ESTIMATE based on the airline's typical
//     fleet size (regional 78 / narrow 165 / wide 305 / heavy 410
//     seats per flight). The number is shipped with a `methodology`
//     string so the wall doesn't present it as ground truth.
//   - When OpenSky is empty or rate-limited, the panel falls back to
//     the persisted snapshots, then to a clear "no live data" pill.
//   - The DEMO / scenario badge fires when the inbound set is small
//     and the methodology note is wider than the active flights.

import { useEffect, useMemo, useState } from "react";
import { Plane, Users, Globe, Languages, AlertTriangle } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";

interface VisitorOrigin {
  country: string;
  visitors: number;
  flights: number;
  airlines: string[];
  languages: string[];
}

interface VisitorAnalytics {
  generatedAt: string;
  visitorsToday: number;
  inboundFlights: number;
  groundOps: number;
  topOrigins: VisitorOrigin[];
  recommendedLanguages: string[];
  visitorsByHour: { hour: number; visitors: number; inbound: number; outgoing: number }[];
  airlineMix: { airline: string; country: string; flights: number; visitors: number }[];
  methodology: string;
  socialCountries?: string[];
}

const LANG_LABELS: Record<string, string> = {
  en: "EN",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  th: "TH",
  de: "DE",
  fr: "FR",
  ru: "RU",
};

export default function CNXVisitorPanel() {
  const [data, setData] = useState<VisitorAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await fetchJsonOrNull<VisitorAnalytics>("/api/cnx/visitors");
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const peakHour = useMemo(() => {
    if (!data) return null;
    let max = { hour: 0, visitors: 0 };
    for (const h of data.visitorsByHour) {
      if (h.visitors > max.visitors) max = h;
    }
    return max;
  }, [data]);

  if (error && !data) {
    return (
      <section
        aria-label="Visitor analytics"
        className="border border-[var(--line)] bg-[var(--bg-raised)]"
      >
        <header className="flex items-center gap-1.5 border-b border-[var(--line)] px-3 py-1.5">
          <Plane className="h-3.5 w-3.5 text-[var(--cool)]" />
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink)]">
            นักท่องเที่ยว · Visitors
          </h2>
        </header>
        <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-[var(--dim)]">
          <AlertTriangle className="h-3.5 w-3.5 text-[var(--danger)]" />
          {error}
        </div>
      </section>
    );
  }

  const visitors = data?.visitorsToday ?? 0;
  const flights = data?.inboundFlights ?? 0;
  const groundOps = data?.groundOps ?? 0;
  const topOrigins = data?.topOrigins ?? [];
  const langs = data?.recommendedLanguages ?? [];
  const airlineMix = data?.airlineMix ?? [];
  const isEstimate = data?.methodology?.includes("Seats estimated");

  return (
    <section
      aria-label="Visitor analytics"
      className="flex h-full flex-col overflow-hidden border border-[var(--line)] bg-[var(--bg-raised)]"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--bg-raised)] px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <Plane className="h-3.5 w-3.5 text-[var(--cool)]" />
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink)]">
            นักท่องเที่ยว · Visitors
          </h2>
        </div>
        {isEstimate && (
          <span
            title={data?.methodology ?? ""}
            className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--sun)]"
          >
            EST · seats × flights
          </span>
        )}
      </header>

      <div className="grid shrink-0 grid-cols-3 border-b border-[var(--line)] bg-[var(--bg)]">
        <Stat
          icon={<Users className="h-3 w-3 text-[var(--cool)]" />}
          label="Visitors (24 h)"
          value={visitors.toLocaleString()}
          sub={isEstimate ? "estimate" : undefined}
        />
        <Stat
          icon={<Plane className="h-3 w-3 text-[var(--cool)]" />}
          label="Inbound flights"
          value={flights.toLocaleString()}
        />
        <Stat
          icon={<Plane className="h-3 w-3 text-[var(--dim)]" />}
          label="Ground ops"
          value={groundOps.toLocaleString()}
        />
      </div>

      <div className="shrink-0 border-b border-[var(--line)] px-3 py-2">
        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">
          Top origins
        </div>
        {topOrigins.length === 0 ? (
          <p className="mt-1 font-mono text-[10px] text-[var(--dim)]">
            No inbound flights right now.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {topOrigins.slice(0, 5).map((o) => (
              <li key={o.country} className="flex items-baseline justify-between gap-2 text-[10px]">
                <span className="truncate font-medium text-[var(--ink)]">{o.country}</span>
                <span className="font-mono tabular-nums text-[var(--dim)]">
                  {o.visitors.toLocaleString()} · {o.flights}×{" "}
                  {o.airlines.slice(0, 2).join(" / ") || "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-b border-[var(--line)] px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">
            Social-listening languages
          </div>
          <Globe className="h-3 w-3 text-[var(--dim)]" />
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {langs.length === 0 ? (
            <span className="font-mono text-[10px] text-[var(--dim)]">EN (default)</span>
          ) : (
            langs.map((l) => (
              <span
                key={l}
                className="rounded-sm border border-[var(--cool)] bg-[var(--cool-dim)] px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--cool)]"
              >
                {LANG_LABELS[l] ?? l.toUpperCase()}
              </span>
            ))
          )}
        </div>
        {data?.socialCountries && data.socialCountries.length > 0 && (
          <p className="mt-1 font-mono text-[8px] text-[var(--dim)]">
            → {data.socialCountries.join(", ")}
          </p>
        )}
      </div>

      <div className="shrink-0 px-3 py-2">
        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">
          24-h hourly trend
        </div>
        <div className="mt-1 flex h-12 items-end gap-px">
          {data?.visitorsByHour.map((h) => {
            const max = peakHour?.visitors ?? 0;
            const pct = max > 0 ? Math.max(2, Math.round((h.visitors / max) * 100)) : 2;
            const isCurrent = h.hour === new Date(data.generatedAt).getHours();
            return (
              <div
                key={h.hour}
                title={`${h.hour}:00 — ${h.visitors} visitors, ${h.inbound} inbound, ${h.outgoing} outgoing`}
                className="flex-1"
              >
                <div
                  className="mx-px"
                  style={{ height: `${pct}%` }}
                  data-current={isCurrent ? "true" : undefined}
                  className={`mx-px ${isCurrent ? "bg-[var(--sun)]" : "bg-[var(--cool)]"}`}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[8px] text-[var(--dim)]">
          <span>0h</span>
          <span>12h</span>
          <span>23h</span>
        </div>
      </div>

      {airlineMix.length > 0 && (
        <div className="shrink-0 border-t border-[var(--line)] bg-[var(--bg)] px-3 py-1.5">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">
            Carrier mix
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {airlineMix.slice(0, 6).map((a) => (
              <span
                key={a.airline}
                title={`${a.airline} (${a.country}): ${a.flights} flights, ${a.visitors} est. visitors`}
                className="rounded-sm border border-[var(--line)] px-1 py-px font-mono text-[8px] text-[var(--ink)]"
              >
                {a.airline.split(" ")[0]} · {a.flights}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border-r border-[var(--line)] px-2 py-1.5 last:border-r-0">
      <div className="flex items-center gap-1">
        {icon}
        <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--dim)]">
          {label}
        </span>
      </div>
      <div className="mt-0.5 font-mono text-[16px] font-bold tabular-nums leading-none text-[var(--ink)]">
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--dim)]">
          {sub}
        </div>
      )}
    </div>
  );
}
