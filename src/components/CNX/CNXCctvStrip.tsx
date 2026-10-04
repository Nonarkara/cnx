"use client";

// Camera evidence strip: capture age belongs to the image, never the fetch.
// Reachability and image errors are explicit; still images are never labelled live.

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

/** Age of the image itself (camera capture time), not of our fetch. */
function capturedLabel(capturedAt: string | undefined, now: number): string {
  const t = Date.parse(capturedAt ?? "");
  if (!Number.isFinite(t)) return "ไม่ทราบเวลาถ่าย";
  if (t > now + 300_000) return "เวลาถ่ายคลาดเคลื่อน";
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 60) return `ภาพเมื่อ ${min} นาทีที่แล้ว`;
  if (min < 48 * 60) return `ภาพเมื่อ ${Math.round(min / 60)} ชม.ที่แล้ว`;
  return `ภาพเมื่อ ${Math.round(min / 1440)} วันที่แล้ว`;
}

export default function CnxCctvStrip({ feed }: { feed: CctvFeedResponse | null }) {
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
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
    <section aria-label="CNX CCTV — กล้องจริงทั้งหมด" className="shrink-0 border-b border-[var(--line)] bg-[var(--bg-raised)]">
      <div className="flex items-stretch">
        <div className="flex w-[104px] sm:w-[128px] shrink-0 flex-col justify-center border-r border-[var(--line)] px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Cctv className="h-4 w-4 text-[var(--cool)]" />
            <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--ink)]">
              CCTV
            </span>
          </div>
          <div className="mt-1 text-[12px] tabular-nums text-[var(--dim)]">
            {feed ? `${slots.filter((slot) => slot.reachable && !failedImages.has(slot.id)).length}/${feed.totalCount} ใช้ได้` : "กำลังโหลด…"}
          </div>
          <div className="text-[12px] text-[var(--dim)]">ภาพ / วิดีโอ</div>
        </div>

        <div className="flex min-w-0 flex-1 overflow-x-auto">
          {!feed ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[88px] w-[288px] shrink-0 animate-pulse border-r border-[var(--line)] bg-[var(--bg)]" />
            ))
          ) : slots.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-[var(--dim)]">
              <span lang="th">ยังไม่มีกล้องที่ดูได้ในขณะนี้</span>
            </div>
          ) : (
            slots.map((s) => {
              const color = CATEGORY_COLORS[s.category];
              const reachable = s.reachable && !failedImages.has(s.id);
              const sep = (s.posterUrl ?? "").includes("?") ? "&" : "?";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s)}
                  className={`group relative flex min-h-[88px] w-[300px] shrink-0 items-center gap-3 border-r border-[var(--line)] px-3 py-2 text-left transition-colors hover:bg-[var(--bg-surface)] ${
                    reachable ? "" : "opacity-70"
                  }`}
                  style={{ borderTop: `2px solid ${reachable ? color : "var(--dim)"}` }}
                  title={`${s.label} — คลิกดูภาพใหญ่`}
                >
                  <div className="relative h-[64px] w-[96px] shrink-0 overflow-hidden rounded-sm bg-black">
                    {s.posterUrl ? (
                      // Live CCTV snapshots rotate on a _ts cache-buster —
                      // next/image would re-optimize a new frame each refresh.
                      // Image optimization is deliberately off
                      // (NEXT_DISABLE_IMAGE_OPTIMIZATION=1).
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${s.posterUrl}${sep}_ts=${ts}`}
                        alt=""
                        onError={() => setFailedImages((previous) => new Set([...previous, s.id]))}
                        onLoad={() => setFailedImages((previous) => {
                          if (!previous.has(s.id)) return previous;
                          const next = new Set(previous); next.delete(s.id); return next;
                        })}
                        loading="lazy"
                        decoding="async"
                        className={`h-full w-full object-cover ${reachable ? "" : "grayscale"}`}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center font-mono text-[9px] text-white/70">
                        {s.hlsUrl ? "▶ วิดีโอ" : "ไม่มีภาพ"}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div lang="th" className="line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--ink)]">
                      {s.label}
                    </div>
                    <div className="mt-1 text-[12px] leading-snug text-[var(--dim)]">
                      {SOURCE_BADGE[s.source] ?? s.source} · {reachable ? (s.hlsUrl ? "วิดีโอ" : "ภาพนิ่ง") : "ภาพไม่พร้อม"}
                    </div>
                    <div className="mt-1 text-[12px] leading-snug tabular-nums text-[var(--dim)]">
                      {s.posterUrl ? capturedLabel(s.capturedAt, now) : "ไม่ทราบเวลาถ่าย"}
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
