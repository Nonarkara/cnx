"use client";

// CNX CCTV modal — the large view for one camera.
//
// Stream strategy, by what the camera actually publishes (same priority
// as NST's CctvStreamModal):
//   hlsUrl    → <video> via lazily-loaded hls.js (Safari plays natively)
//   playerUrl → <iframe> of the upstream day-player (Windy)
//   posterUrl → refreshing JPEG snapshot
//   none      → honest "no stream" message (never a fake frame)
//
// White-minimal presentation: hairline border, bilingual heading,
// upstream attribution link-out on every view.

import { useEffect, useId, useRef, useState } from "react";
import type { CctvSlot } from "../../types/cnx";

interface Props {
  slot: CctvSlot | null;
  onClose: () => void;
}

const SOURCE_LABEL: Record<string, string> = {
  windy: "Windy.com",
  longdo: "Longdo",
  municipal: "เทศบาล/อบจ.",
  itic: "iTIC",
  doh: "กรมทางหลวง",
  youtube: "YouTube",
  private: "Private",
  lanta: "Lanta",
};

function HlsVideo({ src, label }: { src: string; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    const video = videoRef.current;
    if (!video) return;
    // Cleanup only needs destroy; the live instance stays fully typed
    // via the real Hls class below (a structural type for `on` fights
    // hls.js generics under the build's non-skipLibCheck type-check).
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    // Safari (and some mobile browsers) play HLS natively.
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => {});
      return;
    }
    void import("hls.js").then((m) => {
      if (cancelled || !videoRef.current) return;
      const Hls = m.default;
      if (!Hls.isSupported()) {
        setFailed(true);
        return;
      }
      const instance = new Hls({ maxBufferLength: 30 });
      hls = instance;
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (!cancelled && data.fatal) setFailed(true);
      });
      instance.loadSource(src);
      instance.attachMedia(videoRef.current!);
      videoRef.current!.play().catch(() => {});
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      try { hls?.destroy(); } catch { /* ignore */ }
    };
  }, [src]);

  if (failed) {
    return (
      <div className="flex aspect-video items-center justify-center bg-[var(--bg)] font-mono text-[11px] text-[var(--dim)]">
        วิดีโอเล่นไม่ได้ในเบราว์เซอร์นี้ — <a className="ml-1 underline" href={src} target="_blank" rel="noreferrer">เปิดสตรีมโดยตรง</a>
      </div>
    );
  }
  return (
    <video
      ref={videoRef}
      controls
      muted
      playsInline
      className="aspect-video w-full bg-black"
      aria-label={`ภาพสด: ${label}`}
      onError={() => setFailed(true)}
    />
  );
}

function SnapshotView({ slot }: { slot: CctvSlot }) {
  const [ts, setTs] = useState(() => Date.now());
  const refreshMs = Math.max(30, slot.snapshotRefreshSec ?? 150) * 1000;
  useEffect(() => {
    const t = window.setInterval(() => setTs(Date.now()), refreshMs);
    return () => window.clearInterval(t);
  }, [refreshMs, slot.id]);
  const sep = (slot.posterUrl ?? "").includes("?") ? "&" : "?";
  return (
    <img
      src={`${slot.posterUrl}${sep}_ts=${ts}`}
      alt={`ภาพล่าสุด: ${slot.label}`}
      className="aspect-video w-full bg-black object-contain"
      decoding="async"
    />
  );
}

export default function CnxCctvModal({ slot, onClose }: Props) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!slot) return null;
  const sourceLabel = SOURCE_LABEL[slot.source] ?? slot.source;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl overflow-hidden border border-[var(--line)] bg-white"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
              CCTV · {slot.category} · {sourceLabel}
            </div>
            <h2 id={titleId} lang="th" className="font-display text-xl font-bold text-[var(--ink)]">
              {slot.label}
            </h2>
            <div className="mt-0.5 font-mono text-[9px] tabular-nums text-[var(--dim)]">
              {slot.latitude.toFixed(4)}, {slot.longitude.toFixed(4)}
              {!slot.reachable && <span className="ml-2 font-bold text-[var(--danger)]">OFFLINE — อาจดูไม่ได้</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="shrink-0 border border-[var(--line)] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink)] hover:border-[var(--ink)]"
          >
            ปิด ✕
          </button>
        </header>

        <div className="bg-black">
          {slot.hlsUrl ? (
            <HlsVideo src={slot.hlsUrl} label={slot.label} />
          ) : slot.playerUrl ? (
            <iframe
              key={slot.id}
              src={slot.playerUrl}
              title={`ภาพกล้อง: ${slot.label}`}
              className="aspect-video w-full"
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          ) : slot.posterUrl ? (
            <SnapshotView slot={slot} />
          ) : (
            <div className="flex aspect-video items-center justify-center font-mono text-[11px] text-[var(--dim)]">
              กล้องนี้ไม่มีสตรีม — {sourceLabel}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--line)] px-4 py-2 font-mono text-[9px] text-[var(--dim)]">
          <span>
            ที่มา: {sourceLabel}
            {slot.source === "windy" && " · ภาพนิ่งรีเฟรชทุก ~2 นาที (ไม่ใช่ไลฟ์วิดีโอ)"}
            {slot.source === "longdo" && " · สตรีม HLS จากกรมทางหลวงผ่าน Longdo"}
            {slot.source === "municipal" && " · เครือข่ายกล้องเทศบาล/อบจ."}
          </span>
          {slot.upstreamUrl && (
            <a href={slot.upstreamUrl} target="_blank" rel="noreferrer" className="underline hover:text-[var(--ink)]">
              เปิดต้นทาง ↗
            </a>
          )}
        </footer>
      </div>
    </div>
  );
}
