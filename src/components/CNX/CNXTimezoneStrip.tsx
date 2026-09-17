"use client";

// CNX timezone strip — "what time is it right now, for the countries
// today's inbound flights are actually coming from?" Sorted earliest
// local time → latest. The country contributing the most visitors
// today gets a highlighted box with the running tourist count
// underneath — that's the timezone the governor's office should be
// thinking about first (it's whoever's morning/night governs when
// tomorrow's inbound wave lands).

import { useEffect, useState } from "react";
import { clocksForCountries } from "../../lib/cnx/country-timezones";

export interface TimezoneOrigin {
  country: string;
  visitors: number;
}

export default function CnxTimezoneStrip({ topOrigins }: { topOrigins: TimezoneOrigin[] }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (topOrigins.length === 0) return null;

  const busiest = topOrigins.reduce((a, b) => (b.visitors > a.visitors ? b : a), topOrigins[0]);
  const clocks = clocksForCountries(
    topOrigins.map((o) => o.country),
    now,
  );
  if (clocks.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-[var(--line)] bg-[var(--bg)] px-2 py-1">
      <span className="mr-1 shrink-0 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">
        Visitor clocks
      </span>
      {clocks.map((c) => {
        const isBusiest = c.country === busiest.country;
        return (
          <div
            key={c.country}
            title={`${c.country} — ${c.timezone}`}
            className={`flex shrink-0 items-center gap-1 border px-1.5 py-0.5 ${
              isBusiest
                ? "border-[var(--sun)] bg-[var(--sun-dim)]"
                : "border-[var(--line)] bg-[var(--bg-raised)]"
            }`}
          >
            <span className="font-mono text-[9px] font-bold tabular-nums text-[var(--ink)]">
              {c.localTime}
            </span>
            <span className="truncate text-[9px] text-[var(--dim)]">{c.country}</span>
            {isBusiest && (
              <span className="ml-0.5 font-mono text-[8px] font-bold text-[var(--sun)]">
                · {busiest.visitors.toLocaleString()} so far
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
