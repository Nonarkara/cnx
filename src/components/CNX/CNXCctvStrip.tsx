"use client";

// CNX CCTV strip — real cameras only.
//
// Every tile is a refreshing snapshot (Windy JPEGs ~2.5 min cadence,
// Longdo/DOH snapshots) or an HLS badge where a stream exists. Tiles
// show the image age, never a LIVE badge on a still. Click opens the
// modal (HLS video / day-player / refreshing snapshot). Unreachable
// cameras render greyed with OFFLINE — never green. When no camera is
// live the strip says so and points at the municipal onboarding runbook
// (docs/CCTV-PIPELINE.md) instead of inventing footage.

import { useEffect, useState } from "react";
import { Cctv } from "lucide-react";
import type { CctvFeedResponse, CctvSlot } from "../../types/cnx";
import CnxCctvModal from "./CNXCctvModal";

const CATEGORY_COLORS: Record<CctvSlot["category"], string> = {
  heritage: "var(--sun)",
  traffic: "var(--cool)",
  highway: "var(--cool)",
  flood: "var(--danger)",
  tourism: "var(--success)",
};

const SOURCE_BADGE: Record<string, string> = {
  windy: "Windy",
  longdo: "Longdo",
  municipal: "เทศบาล",
  itic: "iTIC",
  doh: "ทล.",
};

function tileRefreshMs(slots: CctvSlot[]): number {
  const secs = slots.map((s) => s.snapshotRefreshSec ?? 150);
  return Math.max(30, Math.min(...secs, 150)) * 1000;
}

function ageLabel(since: number, now: number): string {
  const s = Math.max(0, Math.round((now - since) / 1000));
  if (s < 60) return `อัปเดต ${s} วิที่แล้ว`;
  return `อัปเดต ${Math.floor(s / 60)} นาทีที่แล้ว`;
}

export default function CnxCctvStrip({ feed }: { feed: CctvFeedResponse | null }) {
  const [selected, setSelected] = useState<CctvSlot | null>(null);
  const [ts, setTs] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const slots = feed?.slots ?? [];

  useEffect(() => {
    if (slots.length === 0) return;
    const t = window.setInterval(() => {
      setTs(Date.now());
      setNow(Date.now());
    }, tileRefreshMs(slots));
    const clock = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      window.clearInterval(t);
      window.clearInterval(clock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed?.generatedAt]);

  return (
    <section aria-label="CNX CCTV — กล้องจริงทั้งหมด" className="shrink-0 border-b border-[var(--line)] bg-white">
      <div className="flex items-stretch">
        <div className="flex w-[132px] shrink-0 flex-col justify-center border-r border-[var(--line)] px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Cctv className="h-3 w-3 text-[var(--cool)]" />
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
              CCTV
            </span>
          </div>
          <div className="mt-1 font-mono text-[8px] tabular-nums text-[var(--dim)]">
            {feed ? `${feed.reachableCount}/${feed.totalCount} ใช้ได้` : "loading…"}
          </div>
          <div className="font-mono text-[8px] text-[var(--dim)]">ภาพนิ่งรีเฟรช</div>
        </div>

        <div className="flex min-w-0 flex-1 overflow-x-auto">
          {!feed ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[118px] w-[200px] shrink-0 animate-pulse border-r border-[var(--line)] bg-[var(--bg)]" />
            ))
          ) : slots.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-[11px] text-[var(--dim)]">
              <span lang="th">ยังไม่มีกล้องที่ดูได้ตอนนี้ — กำลังรองเครือข่ายกล้องเทศบาล/อบจ. (ดูวิธีต่อกล้องใน docs/CCTV-PIPELINE.md)</span>
            </div>
          ) : (
            slots.map((s) => {
              const color = CATEGORY_COLORS[s.category];
              const sep = (s.posterUrl ?? "").includes("?") ? "&" : "?";
              return (
                <button
                  key={s.id}
                  onClick={() => setSelected(s)}
                  className={`group relative w-[200px] shrink-0 border-r border-[var(--line)] text-left transition-colors hover:bg-[var(--bg-surface)] ${
                    s.reachable ? "" : "opacity-70"
                  }`}
                  style={{ borderTop: `2px solid ${s.reachable ? color : "var(--dim)"}` }}
                  title={`${s.label} — คลิกดูภาพใหญ่`}
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-black">
                    {s.posterUrl ? (
                      <img
                        src={`${s.posterUrl}${sep}_ts=${ts}`}
                        alt={s.label}
                        loading="lazy"
                        decoding="async"
                        className={`h-full w-full object-cover ${s.reachable ? "" : "grayscale"}`}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center font-mono text-[9px] text-white/70">
                        {s.hlsUrl ? "▶ วิดีโอ" : "ไม่มีภาพ"}
                      </div>
                    )}
                    <span className="absolute left-1 top-1 bg-black/75 px-1 py-px font-mono text-[8px] font-bold uppercase text-white">
                      {SOURCE_BADGE[s.source] ?? s.source}
                    </span>
                    <span
                      className={`absolute right-1 top-1 px-1 py-px font-mono text-[8px] font-bold uppercase ${
                        s.reachable ? "bg-[var(--success)] text-white" : "bg-black/75 text-white/80"
                      }`}
                    >
                      {s.reachable ? (s.hlsUrl ? "วิดีโอ" : "ภาพนิ่ง") : "OFFLINE"}
                    </span>
                  </div>
                  <div className="px-2 py-1">
                    <div lang="th" className="truncate text-[10px] font-semibold text-[var(--ink)]">
                      {s.label}
                    </div>
                    <div className="font-mono text-[8px] tabular-nums text-[var(--dim)]">
                      {s.posterUrl ? ageLabel(ts, now) : s.hlsUrl ? "สตรีมสด" : "—"}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
      <CnxCctvModal slot={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
