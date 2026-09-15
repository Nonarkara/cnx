"use client";

// CNX ticker — bottom strip. Mirrors Lopburi's ticker: a marquee
// line that walks the operator through every live feed, the keystone
// numbers, and the office notices. One-shot, no refresh; the parent
// re-renders it whenever any feed updates.

import { useMemo } from "react";
import { Activity, AlertTriangle, Bell, Flame, Droplets, Wind, Plane } from "lucide-react";
import type {
  CnxFloodResponse,
  AirQualityResponse,
  CnxFiresResponse,
  CctvFeedResponse,
  CnxStoryResponse,
  SocialListeningResponse,
} from "../../types/cnx";
import type { FetchResult } from "../../lib/cnx/opensky";

interface TickerProps {
  flood: CnxFloodResponse | null;
  air: AirQualityResponse | null;
  fires: CnxFiresResponse | null;
  cctv: CctvFeedResponse | null;
  social: SocialListeningResponse | null;
  story: CnxStoryResponse | null;
  flights: FetchResult | null;
}

export default function CnxTicker({
  flood, air, fires, cctv, social, story, flights,
}: TickerProps) {
  const segments = useMemo(() => {
    const out: { key: string; icon: string; label: string; value: string; level?: string }[] = [];
    if (air?.provinceAvgPm25) {
      out.push({
        key: "pm25",
        icon: "🌫",
        label: "PM2.5",
        value: `${air.provinceAvgPm25} µg/m³`,
        level: air.provinceAvgAqiLevel,
      });
    }
    if (typeof flood?.pingCapacityFraction === "number") {
      out.push({
        key: "ping",
        icon: "🌊",
        label: "Ping",
        value: `${(flood.pingCapacityFraction * 100).toFixed(0)}% bank-full`,
        level: flood.pingCapacityFraction > 0.85 ? "critical" : flood.pingCapacityFraction > 0.7 ? "alert" : undefined,
      });
    }
    if (fires) {
      out.push({
        key: "fires",
        icon: "🔥",
        label: "FIRMS",
        value: `${fires.totalCount} hotspots`,
        level: fires.totalCount > 30 ? "alert" : undefined,
      });
    }
    if (cctv) {
      out.push({
        key: "cctv",
        icon: "📹",
        label: "CCTV",
        value: `${cctv.reachableCount}/${cctv.totalCount} live`,
      });
    }
    if (flights) {
      const total = flights.airborne.length + flights.ground.length;
      out.push({
        key: "flights",
        icon: "✈",
        label: "Airspace",
        value: `${total} aircraft`,
      });
    }
    if (social) {
      out.push({
        key: "social",
        icon: "📰",
        label: "News",
        value: `${social.items.length} mentions`,
      });
    }
    if (story?.headline) {
      out.push({
        key: "story",
        icon: "📌",
        label: "Story",
        value: story.headline,
      });
    }
    return out;
  }, [air, flood, fires, cctv, social, flights, story]);

  if (segments.length === 0) return null;

  return (
    <div className="flex h-[28px] shrink-0 items-center overflow-hidden border-t border-[var(--line)] bg-[var(--bg)] font-mono text-[10px]">
      <div className="flex h-full shrink-0 items-center gap-1.5 border-r border-[var(--line)] bg-[var(--cool)] px-3 text-white">
        <Activity className="h-3 w-3 animate-pulse" />
        <span className="text-[9px] font-bold uppercase tracking-[0.16em]">CNX OPS</span>
      </div>
      <div className="relative flex h-full min-w-0 flex-1 items-center overflow-hidden">
        <div className="flex w-max animate-marquee items-center gap-6 whitespace-nowrap px-4">
          {[...segments, ...segments].map((s, i) => (
            <span key={`${s.key}-${i}`} className="flex items-center gap-1.5 text-[var(--ink)]">
              <span className="text-[10px]">{s.icon}</span>
              <span className="text-[8px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">{s.label}</span>
              <span className={`tabular-nums ${s.level === "critical" ? "text-[var(--danger)]" : s.level === "alert" ? "text-[#fb923c]" : ""}`}>
                {s.value}
              </span>
              <span className="text-[var(--dim)]">·</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}