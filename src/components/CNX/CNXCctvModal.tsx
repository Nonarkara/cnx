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
import { useModalDialog } from "../../hooks/useModalDialog";
import type { CctvSlot } from "../../types/cnx";
import { DataAge } from "./CNXDataAge";
import { useLang } from "../../hooks/useLang";

interface Props {
  slot: CctvSlot | null;
  onClose: () => void;
}

const SOURCE_LABEL: Record<string, { th: string; en: string }> = {
  windy: { th: "Windy.com", en: "Windy.com" },
  longdo: { th: "Longdo", en: "Longdo" },
  municipal: { th: "เทศบาล/อบจ.", en: "Municipality / PAO" },
  itic: { th: "iTIC", en: "iTIC" },
  doh: { th: "กรมทางหลวง", en: "Department of Highways" },
  youtube: { th: "YouTube", en: "YouTube" },
  private: { th: "เอกชน", en: "Private" },
  lanta: { th: "Lanta", en: "Lanta" },
};

const CATEGORY_LABEL: Record<CctvSlot["category"], { th: string; en: string }> = {
  heritage: { th: "โบราณสถาน", en: "heritage" },
  traffic: { th: "จราจร", en: "traffic" },
  highway: { th: "ทางหลวง", en: "highway" },
  flood: { th: "น้ำท่วม", en: "flood" },
  tourism: { th: "ท่องเที่ยว", en: "tourism" },
};

function HlsVideo({ src, label }: { src: string; label: string }) {
  const { t } = useLang();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    const video = videoRef.current;
    if (!video) return;
    let hls: import("hls.js").default | null = null;
    let cancelled = false;
    // Safari (and some mobile browsers) play HLS natively.
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => {});
      return () => { video.pause(); video.removeAttribute("src"); video.load(); };
    }
    void import("hls.js").then((m) => {
      if (cancelled || !videoRef.current) return;
      const Hls = m.default;
      if (!Hls.isSupported()) {
        setFailed(true);
        return;
      }
      hls = new Hls({ maxBufferLength: 30 });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!cancelled && data.fatal) setFailed(true);
      });
      hls.loadSource(src);
      hls.attachMedia(videoRef.current!);
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
        {t("วิดีโอเล่นไม่ได้ในเบราว์เซอร์นี้", "This browser cannot play the video")} — <a className="ml-1 underline" href={src} target="_blank" rel="noreferrer">{t("เปิดสตรีมโดยตรง", "open the stream directly")}</a>
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
      aria-label={`${t("วิดีโอจากกล้อง", "Camera video")}: ${label}`}
      onError={() => setFailed(true)}
    />
  );
}

function SnapshotView({ slot }: { slot: CctvSlot }) {
  const { t } = useLang();
  const [ts, setTs] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const refreshMs = Math.max(30, slot.snapshotRefreshSec ?? 150) * 1000;
  useEffect(() => {
    const timer = window.setInterval(() => setTs(Date.now()), refreshMs);
    return () => window.clearInterval(timer);
  }, [refreshMs, slot.id]);
  const sep = (slot.posterUrl ?? "").includes("?") ? "&" : "?";
  return (
    <div>
    {failed && <p role="status" className="bg-[var(--bg)] p-3 text-sm text-[var(--ink)]">{t("โหลดภาพไม่สำเร็จ จะลองอีกครั้งตามรอบรีเฟรช", "Image failed to load; retrying on the refresh cycle")} <button type="button" className="min-h-11 px-3 underline" onClick={() => setTs(Date.now())}>{t("ลองอีกครั้ง", "Retry")}</button></p>}
    {/* Snapshots use a cache-buster; the capture clock remains independent. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src={`${slot.posterUrl}${sep}_ts=${ts}`}
      alt={`${t("ภาพจากกล้อง", "Camera snapshot")}: ${t(slot.labelTh ?? slot.label, slot.labelEn ?? slot.label)}`}
      className="aspect-video w-full bg-black object-contain"
      decoding="async"
      onError={() => setFailed(true)}
      onLoad={() => setFailed(false)}
    />
    </div>
  );
}

export default function CnxCctvModal({ slot, onClose }: Props) {
  const titleId = useId();
  const dialogRef = useModalDialog(slot !== null, onClose);
  const { t } = useLang();

  if (!slot) return null;
  const source = SOURCE_LABEL[slot.source];
  const sourceLabel = source ? t(source.th, source.en) : slot.source;
  const category = CATEGORY_LABEL[slot.category];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        // max-h + overflow: the dialog carries a live video/snapshot plus
        // metadata, so on a 667px-tall phone the panel was taller than the
        // viewport with `overflow-hidden` — the close button sat below the
        // fold and could not be reached at all. dvh tracks the dynamic
        // viewport, so it also behaves when the mobile browser chrome
        // collapses on scroll.
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden border border-[var(--line)] bg-[var(--bg)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div>
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
              CCTV · {category ? t(category.th, category.en) : slot.category} · {sourceLabel}
            </div>
            <h2 id={titleId} className="font-display text-xl font-bold text-[var(--ink)]">
              {t(slot.labelTh ?? slot.label, slot.labelEn ?? slot.label)}
            </h2>
            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--dim)]">
              {slot.latitude.toFixed(4)}, {slot.longitude.toFixed(4)}
              {!slot.reachable && <span className="ml-2 font-bold text-[var(--danger)]">{t("ออฟไลน์ — อาจดูไม่ได้", "OFFLINE — may not load")}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            // 44px minimum touch target (Apple HIG / WCAG 2.5.5). Was
            // px-3 py-1.5, a ~28px target on the one control that has to be
            // reachable to escape the dialog.
            className="flex min-h-11 shrink-0 items-center border border-[var(--line)] px-4 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink)] hover:border-[var(--ink)]"
          >
            {t("ปิด", "Close")} ✕
          </button>
        </header>

        {/* min-h-0 lets this flex child shrink below its intrinsic
            aspect-video height, which is what keeps the footer inside the
            92dvh cap on a short phone screen. */}
        <div className="min-h-0 shrink overflow-y-auto bg-black">
          {slot.hlsUrl ? (
            <HlsVideo src={slot.hlsUrl} label={t(slot.labelTh ?? slot.label, slot.labelEn ?? slot.label)} />
          ) : slot.playerUrl ? (
            <iframe
              key={slot.id}
              src={slot.playerUrl}
              title={`${t("ภาพกล้อง", "Camera view")}: ${t(slot.labelTh ?? slot.label, slot.labelEn ?? slot.label)}`}
              className="aspect-video w-full"
              allow="autoplay; fullscreen"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-presentation"
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          ) : slot.posterUrl ? (
            <SnapshotView key={slot.id} slot={slot} />
          ) : (
            <div className="flex aspect-video items-center justify-center bg-[var(--bg-raised)] font-mono text-[11px] text-[var(--dim)]">
              {t("กล้องนี้ไม่มีสตรีม", "This camera has no stream")} — {sourceLabel}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--line)] bg-[var(--bg)] px-4 py-2 text-[12px] text-[var(--dim)]">
          <DataAge observedAt={slot.capturedAt} source={t("เวลาถ่ายภาพ", "Image capture")} missing={t("ไม่ทราบเวลาถ่ายภาพ", "Capture time unknown")} />
          {slot.capturedAt && Number.isFinite(Date.parse(slot.capturedAt)) && <time dateTime={slot.capturedAt} className="ml-2">{new Date(slot.capturedAt).toLocaleString(t("th-TH", "en-GB"), { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" })}</time>}
          <p>{t("การรีเฟรชไม่ยืนยันว่าเป็นภาพที่เพิ่งถ่าย", "Refreshing does not confirm a new camera capture")}</p>
        </div>
        <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--line)] px-4 py-2 font-mono text-[11px] text-[var(--dim)]">
          <span>
            {t("ที่มา", "Source")}: {sourceLabel}
            {slot.hlsUrl ? ` · ${t("สตรีมวิดีโอจากต้นทาง", "upstream video stream")}` : slot.playerUrl ? ` · ${t("เครื่องเล่นต้นทาง อาจรวมภาพย้อนหลัง", "upstream player; may include recordings")}` : slot.posterUrl ? ` · ${t(`รีเฟรชภาพทุก ${Math.max(30, slot.snapshotRefreshSec ?? 150)} วินาที`, `image refresh every ${Math.max(30, slot.snapshotRefreshSec ?? 150)} seconds`)}` : ""}
            {slot.source === "municipal" && ` · ${t("เครือข่ายกล้องเทศบาล/อบจ.", "municipal / PAO camera network")}`}
          </span>
          {slot.upstreamUrl && (
            <a href={slot.upstreamUrl} target="_blank" rel="noreferrer" className="underline hover:text-[var(--ink)]">
              {t("เปิดต้นทาง", "Open source")} ↗
            </a>
          )}
        </footer>
      </div>
    </div>
  );
}
