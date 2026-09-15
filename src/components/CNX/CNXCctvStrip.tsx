"use client";

// CNX CCTV strip — top strip under the top bar.
//
// 12 slot tiles; wired slots render a placeholder for HLS playback
// (hls.js wire once the Longdo/iTIC keys are provisioned). Standby
// slots show the slot's last-known categories (heritage, traffic, …)
// plus a colored stripe that matches the category.

import { Cctv, MapPin } from "lucide-react";
import type { CctvFeedResponse, CctvSlot } from "../../types/cnx";

const CATEGORY_COLORS: Record<CctvSlot["category"], string> = {
  heritage: "var(--sun)",
  traffic: "var(--cool)",
  highway: "var(--cool)",
  flood: "var(--danger)",
  tourism: "var(--success)",
};

interface Props {
  feed: CctvFeedResponse | null;
  onSelectSlot?: (slot: CctvSlot) => void;
}

export default function CnxCctvStrip({ feed, onSelectSlot }: Props) {
  const slots = feed?.slots ?? [];
  return (
    <section
      aria-label="CNX CCTV strip"
      className="flex shrink-0 items-stretch gap-0 border-b border-[var(--line)] bg-[var(--bg)]"
    >
      <div className="flex w-[120px] shrink-0 flex-col justify-center border-r border-[var(--line)] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Cctv className="h-3 w-3 text-[var(--cool)]" />
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
            CCTV
          </span>
        </div>
        <div className="mt-1 font-mono text-[8px] text-[var(--dim)]">
          {feed ? `${feed.reachableCount}/${feed.totalCount} live` : "loading…"}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 overflow-x-auto">
        {!feed
          ? Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-[64px] w-[172px] animate-pulse border-r border-[var(--line)] bg-[var(--line)]/30" />
            ))
          : slots.map((s) => {
              const color = CATEGORY_COLORS[s.category];
              return (
                <button
                  key={s.id}
                  onClick={() => onSelectSlot?.(s)}
                  className="group relative flex h-[64px] w-[172px] shrink-0 flex-col justify-between border-r border-[var(--line)] px-2 py-1 text-left transition-colors hover:bg-[var(--sun-dim)]"
                  style={{ borderTop: `2px solid ${color}` }}
                  title={`${s.label} (${s.source})`}
                >
                  <div className="flex items-start justify-between">
                    <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--dim)]">
                      {s.category}
                    </span>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        s.reachable ? "bg-[var(--success)]" : "bg-[var(--dim)]"
                      }`}
                    />
                  </div>
                  <div>
                    <div className="truncate text-[10px] font-semibold text-[var(--ink)]">{s.label}</div>
                    <div className="flex items-center gap-1 font-mono text-[8px] text-[var(--dim)]">
                      <MapPin className="h-2 w-2" />
                      {s.latitude.toFixed(3)}, {s.longitude.toFixed(3)}
                    </div>
                  </div>
                </button>
              );
            })}
      </div>
    </section>
  );
}