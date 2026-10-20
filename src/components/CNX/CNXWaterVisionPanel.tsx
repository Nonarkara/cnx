"use client";

import { useEffect, useState } from "react";
import type { WaterCamera, WaterVisionResponse } from "../../lib/cnx/water-vision";
import { WATER_CAMERAS, WATER_CAPTURE_MAX_AGE_MS, WATER_CLOCK_SKEW_MS, waterImageStatus, type WaterImageStatus } from "../../lib/cnx/water-vision-core";
import { useLang } from "../../hooks/useLang";
interface Props {
  feed: WaterVisionResponse | null;
  onShowOnMap?: (point: { lat: number; lon: number }) => void;
}
const STATUS: Record<WaterImageStatus, [string, string]> = {
  inspectable: ["ภาพมีรายละเอียดให้ตรวจด้วยตา", "Image detail available for inspection"],
  "low-light": ["แสงน้อย — ยังประเมินภาพไม่ได้", "Low light — inspection limited"],
  "low-detail": ["รายละเอียดน้อยหรือถูกบดบัง — ยังประเมินไม่ได้", "Low detail or obstruction — cannot assess"],
  stale: ["ภาพเก่า — ไม่ใช่สถานการณ์ปัจจุบัน", "Stale capture — not current conditions"],
  "capture-time-unknown": ["ไม่ทราบเวลาถ่าย — ยืนยันความเป็นปัจจุบันไม่ได้", "Capture time unknown — freshness unconfirmed"],
  unavailable: ["ยังไม่มีผลตรวจภาพ", "No analyzed image available"],
};
function CaptureTime({ at, label }: { at: string | null; label?: string }) {
  const { lang, t } = useLang();
  const stamp = Date.parse(at ?? "");
  return <p className="text-[12px] text-[var(--dim)]">{label ?? t("เวลาถ่าย", "Captured")} · {Number.isFinite(stamp)
    ? <time dateTime={at!}>{new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(stamp)} (UTC+7)</time>
    : t("ไม่ทราบเวลาถ่าย", "Capture time unknown")}</p>;
}
function CameraView({ camera, status, onShowOnMap }: { camera: WaterCamera; status: WaterImageStatus; onShowOnMap?: Props["onShowOnMap"] }) {
  const { t } = useLang();
  const [failed, setFailed] = useState(false);
  const [thaiName, englishName] = camera.label.split(" / ");
  const name = t(thaiName, englishName ?? thaiName);
  return <figure className="min-w-0">
    {failed ? <div role="status" className="border border-[var(--line)] bg-[var(--bg-raised)] p-3 text-[13px] text-[var(--ink)]">
      <p>{t("โหลดภาพไม่ได้ ตรวจต้นทางได้จากลิงก์ด้านล่าง", "Preview unavailable. Open the source link below.")}</p>
      <button type="button" onClick={() => setFailed(false)} className="min-h-11 text-[var(--cool)] underline">{t("ลองโหลดภาพอีกครั้ง", "Retry preview")}</button>
    </div> : /* Mutable public source preview; optimization would imply a cached capture. */
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={camera.snapshotUrl} alt={t(`ภาพต้นทาง ${name}`, `Source preview: ${name}`)} loading="lazy" onError={() => setFailed(true)} className="aspect-video w-full object-contain bg-[var(--bg-raised)]" />}
    <figcaption className="mt-2 space-y-1.5 text-[13px] leading-relaxed">
      <h3 className="font-semibold text-[var(--ink)]">{name}</h3>
      <p className="text-[12px] text-[var(--dim)]">{t(camera.contextTh, camera.contextEn)}</p>
      <p className="font-semibold text-[var(--ink)]">{t(...STATUS[status])}</p>
      <CaptureTime at={camera.observedAt} />
      <p className="text-[12px] text-[var(--dim)]">{t("ภาพต้นทางเปลี่ยนได้ อาจไม่ใช่เฟรมที่วิเคราะห์ตามเวลาข้างต้น", "Latest source preview may differ from the analyzed frame above.")}</p>
      {camera.frameChanged !== null && <p className="text-[12px] text-[var(--dim)]">{camera.frameChanged
        ? t("พิกเซลต่างจากภาพก่อน ไม่ได้ยืนยันการเปลี่ยนระดับน้ำ", "Pixels differ from the previous sample; this does not establish a water-level change.")
        : t("พิกเซลเหมือนภาพก่อน ไม่ได้ยืนยันว่าน้ำนิ่งหรือกล้องค้าง", "Pixels match the previous sample; this does not establish still water or a frozen camera.")}</p>}
      <div className="flex flex-wrap items-center gap-x-3">
        <a href={camera.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-[var(--cool)] underline">{t("ต้นทาง กรมทรัพยากรน้ำ ↗", "DWR source ↗")}</a>
        {onShowOnMap && <button type="button" onClick={() => onShowOnMap({ lat: camera.latitude, lon: camera.longitude })} className="min-h-11 border border-[var(--line)] px-2 text-[var(--ink)] hover:bg-[var(--cool-dim)]">{t("ดูบริเวณบนแผนที่", "View area on map")}</button>}
      </div>
    </figcaption>
  </figure>;
}
export default function CnxWaterVisionPanel({ feed, onShowOnMap }: Props) {
  const { lang, t } = useLang();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, []);
  const batchAge = now - Date.parse(feed?.generatedAt ?? "");
  const current = feed?.provenance === "live" && Number.isFinite(batchAge) && batchAge >= -WATER_CLOCK_SKEW_MS && batchAge <= WATER_CAPTURE_MAX_AGE_MS;
  const cameras = WATER_CAMERAS.map(pinned => {
    const analysis = feed?.cameras.find(camera => camera.cameraId === pinned.cameraId);
    const camera: WaterCamera = { observedAt: null, collectedAt: null, metrics: null, status: "unavailable", frameChanged: null, note: null, ...analysis, ...pinned };
    const status: WaterImageStatus = !current && analysis ? "stale" : camera.metrics ? waterImageStatus(camera.metrics, camera.observedAt, now) : "unavailable";
    return { camera, status };
  });
  const inspectable = cameras.filter(camera => camera.status === "inspectable").length;
  return <section lang={lang} aria-label={t("ภาพแม่น้ำสำหรับตรวจด้วยตา", "River image inspection")} className="border-b border-[var(--line)] bg-[var(--bg-raised)] p-3 text-[13px] leading-relaxed text-[var(--ink)]">
    <h2 className="text-[15px] font-semibold">{t("ภาพแม่น้ำ · ตรวจด้วยตา", "River images · visual inspection")}</h2>
    <p className="mt-1">{t(`${inspectable} ภาพที่มีรายละเอียดให้ตรวจ ไม่ใช่จำนวนจุดน้ำท่วม`, `${inspectable} inspectable images; this is not a flooded-site count.`)}</p>
    <p className="mt-1 text-[12px] text-[var(--dim)]">{t("ตรวจคุณภาพภาพและภาพซ้ำเท่านั้น ไม่ใช่ AI ตรวจน้ำท่วมที่ผ่านการฝึก ไม่วัดระดับน้ำ ความลึก ความเร็ว หรือความปลอดภัยของถนน ต้องดูมาตรวัดและประกาศทางการร่วมกัน", "Image-quality and repeated-frame checks, not flood detection or trained water segmentation. No water level, depth, flow or road-safety assessment. Use gauges and official notices alongside these views.")}</p>
    {feed && <CaptureTime at={feed.generatedAt} label={t("รอบวิเคราะห์", "Analysis batch")} />}
    {!current && <p className="mt-1 text-[12px] text-[var(--dim)]">{t("รอบวิเคราะห์เก่าหรือไม่มีข้อมูล ภาพต้นทางที่เปิดได้ไม่ได้ยืนยันผลวิเคราะห์ปัจจุบัน", "Analysis batch is stale or unavailable; a working source preview does not confirm a current analysis.")}</p>}
    <details className="mt-2">
      <summary className="min-h-11 cursor-pointer py-2.5 font-semibold text-[var(--cool)]">{t("เปิดภาพแม่น้ำ 3 จุดและเวลาถ่าย", "Open 3 river views and capture times")}</summary>
      <div className="mt-2 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))" }}>
        {cameras.map(({ camera, status }) => <CameraView key={`${camera.cameraId}-${camera.observedAt}`} camera={camera} status={status} onShowOnMap={onShowOnMap} />)}
      </div>
    </details>
    <p className="mt-2 text-[12px] text-[var(--dim)]">{t("ภาพสาธารณะ: กรมทรัพยากรน้ำ · ส่งผ่านและแนวทางตรวจภาพจาก ", "Public images: Department of Water Resources · snapshot relay and inspection approach from ")}<a href="https://flood.nonarkara.org/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-[var(--cool)] underline">FloodDash ↗</a></p>
  </section>;
}
