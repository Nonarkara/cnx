"use client";

// CNX Arrivals Panel — "how many overseas visitors are in the city
// today, yesterday, the day before?"
//
// Flight counts and origin countries come from real OpenSky arrival
// records at VTCC (Chiang Mai Intl). Visitor headcounts are an
// estimate (seats × assumed load factor) — see the methodology string
// returned by the API and lib/cnx/arrivals.ts's top comment. Every
// day this panel loads, the API route also appends a row to the
// arrivals archive (lib/cnx/arrivals-store.ts) for later year-end
// analysis.

import { useEffect, useState } from "react";
import { PlaneLanding, Globe2, Info } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import type { ArrivalsResponse, DayArrivals } from "../../lib/cnx/arrivals";

function dayLabel(index: number): string {
  return index === 0 ? "Today" : index === 1 ? "Yesterday" : "Day before";
}

function DayCard({ day, index }: { day: DayArrivals; index: number }) {
  return (
    <div className="border border-[var(--line)] bg-[var(--bg)] p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
          {dayLabel(index)}
        </span>
        <span className="font-mono text-[8px] text-[var(--dim)]">{day.date}</span>
      </div>
      <div className="font-mono text-[18px] font-bold tabular-nums text-[var(--ink)]">
        {day.estimatedVisitors.toLocaleString()}
      </div>
      <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--dim)]">est. overseas visitors</div>
      <div className="mt-1 font-mono text-[9px] text-[var(--dim)]">
        {day.internationalFlights} intl · {day.domesticFlights} domestic arrivals
      </div>
    </div>
  );
}

export default function CnxArrivalsPanel() {
  const [data, setData] = useState<ArrivalsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchJsonOrNull<ArrivalsResponse>("/api/cnx/arrivals");
      if (!cancelled && next) setData(next);
    };
    void load();
    const i = window.setInterval(() => void load(), 15 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(i);
    };
  }, []);

  if (!data) {
    return (
      <div className="flex flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)] p-3">
        <div className="h-16 animate-pulse bg-[var(--line)]/30" />
      </div>
    );
  }

  const today = data.days[0];
  const topCountries = today?.byCountry.slice(0, 6) ?? [];

  return (
    <div className="flex flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)] p-3">
      <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
        <div className="flex items-center gap-1.5">
          <PlaneLanding className="h-3 w-3 text-[var(--cool)]" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
            Overseas Arrivals — VTCC
          </span>
        </div>
        <span title={data.methodology} className="text-[var(--dim)]">
          <Info className="h-3 w-3" />
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {data.days.map((d, i) => (
          <DayCard key={d.date} day={d} index={i} />
        ))}
      </div>
      {topCountries.length > 0 && (
        <div className="mt-2 border border-[var(--line)] bg-[var(--bg)] p-2">
          <div className="mb-1 flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
            <Globe2 className="h-2.5 w-2.5" />
            Top countries today
          </div>
          <div className="space-y-0.5">
            {topCountries.map((c) => (
              <div key={c.country} className="flex items-center justify-between">
                <span className="truncate font-mono text-[9px] text-[var(--ink)]">{c.country}</span>
                <span className="font-mono text-[9px] tabular-nums text-[var(--ink)]">
                  {c.estimatedVisitors.toLocaleString()} · {c.flights} fl.
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-2 border-t border-[var(--line)] pt-1.5 font-mono text-[8px] leading-relaxed text-[var(--dim)]">
        {data.methodology}
      </div>
    </div>
  );
}
