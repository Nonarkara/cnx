"use client";

// CNX Outbound Flight Panel — answers "where are passengers flying back?"
//
// Three pieces, side by side:
//   1. Heading-quadrant bucket (south = BKK / gulf, north = Chiang Rai,
//      east = Laos / Vietnam, west = Myanmar).
//   2. Top origin countries of inbound flights (OpenSky returns the
//      origin_country per state vector — the closest we can get without
//      a paid FlightAware feed).
//   3. Snapshot store notice ("X snapshots today, 8 TB target").
//
// Drives the multilingual social subscription: top-3 origins are also
// passed to /api/cnx/social so we pull news in Chinese / Japanese /
// Korean / Russian etc.

import { useEffect, useState } from "react";
import { Plane, MapPin, Globe2, Database } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import type { OutboundAnalysis } from "../../lib/cnx/outbound";

const QUADRANT_LABEL: Record<string, { name: string; destination: string; emoji: string }> = {
  south: { name: "South", destination: "Bangkok (BKK) / Gulf", emoji: "↓" },
  north: { name: "North", destination: "Chiang Rai / Laos", emoji: "↑" },
  east: { name: "East", destination: "Laos / Vietnam", emoji: "→" },
  west: { name: "West", destination: "Myanmar", emoji: "←" },
  stationary: { name: "On ground", destination: "—", emoji: "•" },
};

export default function CnxOutboundPanel({ snapshot }: { snapshot: OutboundAnalysis | null }) {
  const [trend, setTrend] = useState<{ days: number; totalSnapshots: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const t = await fetchJsonOrNull<{ days: number; totalSnapshots: number }>("/api/cnx/snapshot-trend?days=7");
      if (!cancelled && t) setTrend({ days: t.days, totalSnapshots: t.totalSnapshots });
    };
    void load();
    const i = window.setInterval(() => void load(), 60_000);
    return () => { cancelled = true; window.clearInterval(i); };
  }, []);

  if (!snapshot) return null;

  return (
    <div className="flex flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)] p-3">
      <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
        <div className="flex items-center gap-1.5">
          <Plane className="h-3 w-3 text-[var(--cool)]" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
            Outbound — Where are they flying back?
          </span>
        </div>
        {trend && (
          <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--dim)]">
            <Database className="h-2.5 w-2.5" />
            {trend.totalSnapshots} snaps · {trend.days}d
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="border border-[var(--line)] bg-[var(--bg)] p-2">
          <div className="mb-1 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
            Heading
          </div>
          <div className="space-y-0.5">
            {snapshot.byQuadrant.map((q) => {
              const meta = QUADRANT_LABEL[q.quadrant];
              return (
                <div key={q.quadrant} className="flex items-center justify-between">
                  <span className="font-mono text-[9px] text-[var(--ink)]">
                    <span className="mr-1 inline-block w-3 text-center">{meta?.emoji ?? "?"}</span>
                    {meta?.name ?? q.quadrant}
                  </span>
                  <span className="font-mono text-[9px] tabular-nums text-[var(--ink)]">{q.count}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="border border-[var(--line)] bg-[var(--bg)] p-2">
          <div className="mb-1 flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
            <Globe2 className="h-2.5 w-2.5" />
            Top origins
          </div>
          <div className="space-y-0.5">
            {snapshot.byQuadrant
              .flatMap((q) => q.topOrigins)
              .reduce<{ country: string; count: number }[]>((acc, o) => {
                const e = acc.find((x) => x.country === o.country);
                if (e) e.count += o.count; else acc.push({ ...o });
                return acc;
              }, [])
              .sort((a, b) => b.count - a.count)
              .slice(0, 5)
              .map((o) => (
                <div key={o.country} className="flex items-center justify-between">
                  <span className="truncate font-mono text-[9px] text-[var(--ink)]">{o.country}</span>
                  <span className="font-mono text-[9px] tabular-nums text-[var(--ink)]">{o.count}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 border-t border-[var(--line)] pt-2 font-mono text-[9px] text-[var(--dim)]">
        <MapPin className="h-3 w-3 text-[var(--sun)]" />
        Inferred top destination: <span className="ml-1 font-bold text-[var(--ink)]">{snapshot.inferredTopDestination}</span>
      </div>
    </div>
  );
}