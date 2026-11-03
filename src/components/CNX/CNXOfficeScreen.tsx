"use client";

import { useEffect, useRef, useState } from "react";
import { useModalDialog } from "../../hooks/useModalDialog";
import { useLang } from "../../hooks/useLang";
import type { BriefTile } from "../../lib/cnx/governor-brief";
import CnxYouTubeCoverage from "./CNXYouTubeCoverage";

export default function CnxOfficeScreen({ tiles, onClose }: { tiles: BriefTile[]; onClose: () => void }) {
  const { t } = useLang();
  const ref = useModalDialog(true, onClose);
  const lock = useRef<WakeLockSentinel | null>(null);
  const enabled = useRef(false);
  const [awake, setAwake] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 60_000);
    async function visible() {
      if (enabled.current && document.visibilityState === "visible") {
        try { lock.current = await navigator.wakeLock.request("screen"); setAwake(!lock.current.released); }
        catch { setAwake(false); }
      }
    }
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(timer); enabled.current = false; document.removeEventListener("visibilitychange", visible); void lock.current?.release(); };
  }, []);
  async function toggleAwake() {
    enabled.current = !enabled.current;
    if (!enabled.current) { await lock.current?.release(); lock.current = null; setAwake(false); return; }
    try {
      lock.current = await navigator.wakeLock.request("screen");
      lock.current.addEventListener("release", () => setAwake(false), { once: true });
      setAwake(!lock.current.released);
    } catch { enabled.current = false; setAwake(false); }
  }
  return <div ref={ref} role="dialog" aria-modal="true" aria-label={t("จอเฝ้าระวังประจำสำนักงาน", "Office watch screen")}
    className="fixed inset-0 z-[210] overflow-y-auto bg-[var(--bg)] p-3 text-[var(--ink)] sm:p-4">
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[var(--line)] pb-2">
      <h2 className="text-xl font-semibold">{t("เชียงใหม่ · จอเฝ้าระวัง", "Chiang Mai · Office watch")}</h2>
      <time className="text-sm tabular-nums">{clock.toLocaleString("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })} ICT</time>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={toggleAwake} aria-pressed={awake} className="min-h-11 border border-[var(--line)] px-2 text-sm">{awake ? t("เปิดจอค้างไว้แล้ว", "Screen stays awake") : t("เปิดจอค้างไว้", "Keep screen awake")}</button>
        <button type="button" onClick={onClose} className="min-h-11 border border-[var(--line)] px-2 text-sm">{t("กลับสรุปสถานการณ์", "Back to brief")}</button>
      </div>
    </header>
    <section aria-label={t("สถานการณ์ปัจจุบัน", "Current conditions")} className="my-3 grid items-start gap-x-5 gap-y-2 md:grid-cols-3">
      {tiles.filter(tile => tile.key !== "visitors").map(tile => <div key={tile.key}>
        <p className="text-xs font-semibold text-[var(--dim)]">{t(tile.titleTh, tile.key === "air" ? "Air quality" : tile.key === "fire" ? "Hotspots" : "Water")}</p>
        <p className="mt-1 max-w-[65ch] text-base">{t(tile.th, tile.en)}</p>
        <p className="mt-1 text-xs text-[var(--dim)]">{tile.source} · {tile.observedAt ? new Date(tile.observedAt).toLocaleString("en-GB", {timeZone:"Asia/Bangkok", dateStyle:"short", timeStyle:"short"}) : t("ยังไม่มีเวลาที่ตรวจยืนยัน", "No confirmed observation time")}</p>
      </div>)}
    </section>
    <CnxYouTubeCoverage active office />
    <p className="mt-3 max-w-[75ch] text-xs text-[var(--dim)]">{t("จอนี้ไม่แทนระบบแจ้งเตือนฉุกเฉิน ต้องเปิดหน้าไว้และมีอินเทอร์เน็ต การเปิดจอค้างไว้อาจไม่รองรับในอุปกรณ์นี้", "This screen is not an emergency notification service. Keep this page open with an internet connection. Screen wake lock may be unavailable on this device.")}</p>
  </div>;
}
