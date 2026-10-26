"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { useModalDialog } from "../../hooks/useModalDialog";
import { fetchJsonOrNull } from "../../lib/client-requests";
import type { AeronetResponse } from "../../lib/cnx/aeronet";
import type { CitizenResponse } from "../../lib/cnx/citizen-reports";
import type { DustboyResponse } from "../../lib/cnx/dustboy";
import type { SmokeTrajectoryResponse } from "../../lib/cnx/smoke-trajectory";
import type { CameraHaze, HazeVisionResponse } from "../../lib/cnx/haze-vision";
import { MIN_BASELINE_SAMPLES, type HazeLabel } from "../../lib/cnx/haze-vision-core";
import { buildHazeWatchState } from "../../lib/cnx/haze-watch-state";
import type { AerosolResponse } from "../../lib/cnx/aerosol";
import type { AirQualityResponse } from "../../types/cnx";
import CnxBurnSeason from "./CNXBurnSeason";
import { useLang } from "../../hooks/useLang";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  air: AirQualityResponse | null;
  aerosol: AerosolResponse | null;
  dustboy: DustboyResponse | null;
  hazeVision: HazeVisionResponse | null;
  citizen: CitizenResponse | null;
  smoke: SmokeTrajectoryResponse | null;
}

const VERDICT: Record<HazeLabel, { th: string; en: string; cls: string }> = {
  "haze-likely": { th: "น่าจะมีหมอกควัน", en: "Haze likely", cls: "border-[var(--danger)] text-[var(--danger)]" },
  "some-haze": { th: "มีหมอกควันบ้าง", en: "Some haze", cls: "border-[var(--sev-watch)] text-[var(--ink)]" },
  clear: { th: "หมอกควันในภาพต่ำ", en: "Low visual haze", cls: "border-[var(--cool)] text-[var(--cool)]" },
  "too-dark": { th: "มืดเกินประเมิน", en: "Too dark to judge", cls: "border-[var(--line)] text-[var(--dim)]" },
  "no-colour": { th: "ภาพไม่มีสี — ไม่ประเมิน", en: "No colour — not scored", cls: "border-[var(--line)] text-[var(--dim)]" },
  calibrating: { th: "กำลังเรียนรู้ภาพฟ้าใส", en: "Calibrating", cls: "border-[var(--line)] text-[var(--dim)]" },
  unusable: { th: "รายละเอียดภาพไม่พอ — ประเมินไม่ได้", en: "Insufficient visual detail — cannot assess", cls: "border-[var(--line)] text-[var(--dim)]" },
};
const mean = (values: (number | null | undefined)[]) => {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  return usable.length ? Math.round(usable.reduce((sum, value) => sum + value, 0) / usable.length * 10) / 10 : null;
};
const oldest = (rows: { observedAt: string }[]) => rows.map(row => row.observedAt).sort((a, b) => Date.parse(a) - Date.parse(b))[0];

function Observation({ at, label }: { at?: string | null; label?: string }) {
  const { lang, t } = useLang();
  const stamp = Date.parse(at ?? "");
  return <span className="text-[12px] leading-relaxed text-[var(--dim)]">{label && `${label} · `}{Number.isFinite(stamp)
    ? <time dateTime={at!}>{new Date(stamp).toLocaleString(lang === "th" ? "th-TH" : "en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })} (UTC+7)</time>
    : t("ไม่ทราบเวลาสังเกต", "Observation time unknown")}</span>;
}

function Stat({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  const { t } = useLang();
  return <div className="min-w-0 border-t border-[var(--line)] pt-3">
    <h3 className="text-[14px] font-semibold text-[var(--ink)]">{label}</h3>
    <p className={`mt-2 text-[var(--ink)] ${value === "—" ? "text-[13px]" : "text-[26px] font-semibold tabular-nums"}`}>{value === "—" ? t("ยังไม่มีค่าปัจจุบัน", "No current reading") : value}</p>
    <div className="mt-1 space-y-1 text-[13px] leading-relaxed text-[var(--dim)]">{children}</div>
  </div>;
}

function CameraCard({ cam, current, assessed }: { cam: CameraHaze; current: boolean; assessed: boolean }) {
  const { t } = useLang();
  const [previewFailed, setPreviewFailed] = useState(false);
  const verdict = current && (!(["clear", "some-haze", "haze-likely"].includes(cam.verdict)) || assessed) ? VERDICT[cam.verdict] : current ? { th: "หลักฐานภาพไม่พอ — ประเมินไม่ได้", en: "Insufficient validated image evidence — cannot assess", cls: "border-[var(--line)] text-[var(--dim)]" } : { th: "ข้อมูลวิเคราะห์เก่า — ไม่ใช้ประเมินปัจจุบัน", en: "Historical analysis — not a current assessment", cls: "border-[var(--line)] text-[var(--dim)]" };
  return <figure className="min-w-0 border border-[var(--line)] bg-[var(--bg-raised)]">
    {previewFailed ? <div role="status" className="p-3 text-[13px] leading-relaxed text-[var(--ink)]">
      <p>{t("ภาพตัวอย่างโหลดไม่ได้ ข้อมูลวิเคราะห์ด้านล่างอ้างอิงเวลาที่บันทึกไว้เท่านั้น", "Preview unavailable. The recorded analysis below refers only to its stated capture time.")}</p>
      <button type="button" onClick={() => setPreviewFailed(false)} className="mt-1 min-h-11 underline">{t("ลองโหลดภาพอีกครั้ง", "Retry preview")}</button>
    </div> : <>
      {/* The source URL is mutable; do not cache-bust or relabel its image as the scored capture. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cam.snapshotUrl} alt={t(`ภาพตัวอย่างจาก ${cam.label}`, `Source preview from ${cam.label}`)} loading="lazy" decoding="async" onError={() => setPreviewFailed(true)} className="aspect-video w-full object-cover" />
    </>}
    <figcaption className="space-y-2 p-3 text-[13px] leading-relaxed">
      <h4 className="font-semibold text-[var(--ink)]">{cam.label}</h4>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`border px-2 py-1 text-[12px] ${verdict.cls}`}>{t(verdict.th, verdict.en)}</span>
        {assessed && cam.score !== null && <span className="tabular-nums text-[var(--dim)]">{t("คะแนนภาพที่บันทึก", "Recorded visual score")} {cam.score.toFixed(2)}</span>}
      </div>
      {current && cam.verdict === "unusable" && <p className="text-[var(--dim)]">{t("หมอก สิ่งบดบัง หรือภาพแทนที่อาจทำให้รายละเอียดไม่พอ แยกสาเหตุจากภาพนี้ไม่ได้ และไม่ใช่การยืนยันว่าอากาศใส", "Fog, obstruction or a placeholder may remove visual detail. The cause cannot be determined from this frame; this is not a clear-air finding.")}</p>}
      <Observation at={cam.observedAt} label={t("เวลาภาพที่ใช้วิเคราะห์", "Analysis capture")} />
      {current && cam.verdict === "calibrating" && <p className="text-[var(--dim)]">{cam.baselineSamples}/{MIN_BASELINE_SAMPLES} {t("ภาพกลางวันสำหรับเรียนรู้ค่าฐาน", "daylight frames for the baseline")}</p>}
      <p className="text-[12px] text-[var(--dim)]">{t("ภาพตัวอย่างอาจเปลี่ยนที่ต้นทาง ไม่ยืนยันว่าเป็นภาพเดียวกับรอบวิเคราะห์ และคะแนนภาพไม่ใช่ PM2.5", "The source preview can change independently; it is not confirmed as the analyzed frame. A visual score is not PM2.5.")}</p>
      {cam.nearestPm25 && <p className="text-[var(--dim)]">{t(`DustBoy ที่จับคู่กับเวลาภาพ: ${cam.nearestPm25.pm25} µg/m³ ห่าง ${cam.nearestPm25.distanceKm} กม.`, `Time-matched DustBoy: ${cam.nearestPm25.pm25} µg/m³, ${cam.nearestPm25.distanceKm} km away`)} <Observation at={cam.nearestPm25.observedAt} /></p>}
    </figcaption>
  </figure>;
}

export default function CnxHazeModal({ isOpen, onClose, air, aerosol, dustboy, hazeVision, citizen, smoke }: Props) {
  const dialogRef = useModalDialog(isOpen, onClose);
  const { t } = useLang();
  const [clock, setClock] = useState(() => Date.now());
  const [aeronet, setAeronet] = useState<AeronetResponse | null>(null);
  const [aeronetStatus, setAeronetStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!isOpen) return;
    const tick = () => setClock(Date.now());
    tick();
    const timer = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    const load = async () => {
      setAeronetStatus("loading");
      const next = await fetchJsonOrNull<AeronetResponse>("/api/cnx/aeronet", { signal: controller.signal });
      if (controller.signal.aborted) return;
      setAeronet(next);
      setAeronetStatus(next ? "ready" : "error");
    };
    void load();
    const timer = window.setInterval(() => void load(), 10 * 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [isOpen, attempt]);
  if (!isOpen) return null;

  const now = Math.max(clock, Date.now());
  const state = buildHazeWatchState({ air, dustboy, aerosol, hazeVision, citizen, smoke, now });
  const pcdAvg = mean(state.freshPcd.map(station => station.pm25));
  const dustAvg = mean(state.chiangMaiDustboy.map(station => station.pm25));
  const modelAvg = mean(state.freshModel.map(station => station.pm25));
  const primary = pcdAvg ?? dustAvg;
  const primaryRows = pcdAvg !== null ? state.freshPcd : state.chiangMaiDustboy;
  const districts = new Set(state.chiangMaiDustboy.map(station => station.district).filter(Boolean)).size;
  const agreement = hazeVision?.agreement;
  const aeronetDay = Date.parse(aeronet?.latest?.date ?? "");
  const aeronetFresh = aeronetStatus === "ready" && Number.isFinite(aeronet?.latest?.aod500) && Number.isFinite(aeronetDay) && now - aeronetDay >= 0 && now - aeronetDay <= 3 * 86_400_000;
  const assessed = new Set(state.assessedCameras);
  const current = new Set(state.currentCameras);
  const cameras = [...state.currentCameras, ...state.staleCameras];
  const citizenCurrent = citizen?.provenance === "live" && now - Date.parse(citizen.generatedAt) >= -300_000 && now - Date.parse(citizen.generatedAt) <= 3 * 3_600_000;

  return <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("เฝ้าระวังหมอกควัน", "Haze watch")} className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:p-4" onClick={onClose}>
    <div className="my-3 w-full max-w-[1100px] border border-[var(--line)] bg-[var(--bg)] p-4 text-[var(--ink)] sm:my-6 sm:p-6" onClick={event => event.stopPropagation()}>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0"><h2 className="text-[24px] font-semibold leading-snug">{t("เฝ้าระวังหมอกควัน", "Haze watch")}</h2><p className="mt-2 max-w-[65ch] text-[14px] leading-relaxed text-[var(--dim)]">{t("เริ่มจากค่าภาคพื้นใกล้พื้นที่ แล้วเทียบแบบจำลองและภาพกล้อง หลักฐานต่างชนิดไม่ถูกรวมเป็นคะแนนเดียว", "Start with ground readings near the affected area, then compare models and cameras. Different evidence types are never fused into one score.")}</p></div>
        <button type="button" onClick={onClose} aria-label={t("ปิดหน้าเฝ้าระวังหมอกควัน", "Close haze watch")} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center border border-[var(--line)]"><X aria-hidden="true" className="h-4 w-4" /></button>
      </header>

      <section aria-label={t("หลักฐานภาคพื้นปัจจุบัน", "Current ground evidence")} className="mt-6 grid gap-5 border-y border-[var(--line)] py-5 md:grid-cols-[1.2fr_1fr]">
        <div><p className="text-[14px] font-semibold">{primary === null ? t("ยังยืนยัน PM2.5 ภาคพื้นปัจจุบันไม่ได้", "Current ground PM2.5 cannot be established") : pcdAvg !== null ? t("ค่าเฉลี่ยสถานี คพ. ที่ใช้ได้ในเชียงใหม่", "Mean of usable PCD stations in Chiang Mai") : t("ค่าเฉลี่ยเซนเซอร์ DustBoy ที่ใช้ได้ในเชียงใหม่", "Mean of usable DustBoy sensors in Chiang Mai")}</p>
          {primary !== null && <p className="mt-3 text-[40px] font-semibold leading-none tabular-nums">{primary}<span className="ml-2 text-[16px] font-normal">µg/m³</span></p>}
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--dim)]">{pcdAvg !== null ? t(`${state.freshPcd.length} สถานีอ้างอิง คพ.`, `${state.freshPcd.length} PCD reference stations`) : dustAvg !== null ? t(`${state.chiangMaiDustboy.length} เซนเซอร์ราคาประหยัด ไม่ใช่สถานีอ้างอิงทางการ`, `${state.chiangMaiDustboy.length} low-cost sensors, not official reference monitors`) : t("ไม่มีสถานีที่มีค่าฝุ่นใช้ได้ภายใน 3 ชม. ข้อมูลขาดไม่ใช่อากาศดี", "No usable ground PM2.5 within 3 h. Missing data is not clean air.")} {t("ค่าเฉลี่ยของจุดที่รายงาน ไม่ใช่ค่าฝุ่นทุกพื้นที่ของจังหวัด", "A mean of reporting points, not conditions everywhere in the province.")}</p>
          {primaryRows.length > 0 && <Observation at={oldest(primaryRows)} label={t("เวลาเก่าสุดที่รวมในค่าเฉลี่ย", "Oldest included observation")} />}
        </div>
        <div className="space-y-3 text-[14px] leading-relaxed"><h3 className="font-semibold">{t("ตรวจสอบก่อนตัดสินใจ", "Before deciding")}</h3><p>{t("เปิดรายชื่อสถานีด้านล่าง เลือกจุดใกล้พื้นที่และดูเวลาวัด ความต่างระหว่างสถานีมีความหมายมากกว่าค่าเฉลี่ยอย่างเดียว", "Open the station list below, find the nearest reporting point and check its time. Differences between stations matter more than the mean alone.")}</p><p className="text-[var(--dim)]">{t(`DustBoy ที่ใช้ได้ในเชียงใหม่ ${state.chiangMaiDustboy.length} จุด จาก ${districts} อำเภอ; ภาคเหนือตอนบน ${state.freshDustboy.length} จุด ไม่มีสถานีไม่ได้แปลว่าปลอดภัย`, `Usable DustBoy: ${state.chiangMaiDustboy.length} points in ${districts} Chiang Mai districts; ${state.freshDustboy.length} across the upper north. No station is not proof of safety.`)}</p><a href="https://air4thai.pcd.go.th/" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-[var(--cool)] underline">{t("ตรวจข้อมูลและประกาศ คพ.", "Check PCD readings and notices")}<ExternalLink aria-hidden="true" className="h-4 w-4" /></a></div>
      </section>
      <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-[14px] font-semibold">{t(`รายชื่อสถานีที่ใช้ได้ · คพ. ${state.freshPcd.length} / DustBoy เชียงใหม่ ${state.chiangMaiDustboy.length}`, `Usable station list · PCD ${state.freshPcd.length} / Chiang Mai DustBoy ${state.chiangMaiDustboy.length}`)}</summary>
        <ul className="grid max-h-80 gap-x-6 divide-y divide-[var(--line)] overflow-y-auto text-[13px] sm:grid-cols-2">{[...state.freshPcd.map(station => ({ id: `pcd-${station.stationId}`, name: station.name, value: station.pm25, at: station.observedAt, source: "PCD" })), ...state.chiangMaiDustboy.map(station => ({ id: `dust-${station.stationId}`, name: `${station.nameTh} · ${station.district}`, value: station.pm25, at: station.observedAt, source: "DustBoy" }))].map(station => <li key={station.id} className="min-w-0 py-3"><p className="font-semibold">{station.name}</p><p>{station.source} · {station.value} µg/m³</p><Observation at={station.at} /></li>)}</ul>
        {primary === null && <p className="text-[13px] text-[var(--dim)]">{t("ยังไม่มีสถานีที่ผ่านเงื่อนไขเวลาและคุณภาพ", "No stations currently meet the time and quality checks.")}</p>}
      </details>

      <section aria-label={t("บริบทแบบจำลองและคอลัมน์ละอองลอย", "Model and column-aerosol context")} className="mt-5 grid gap-5 sm:grid-cols-3">
        <Stat label={t("PM2.5 จากแบบจำลอง CAMS", "CAMS model PM2.5")} value={modelAvg === null ? "—" : `${modelAvg} µg/m³`}><p>{t(`${state.freshModel.length} จุดกริดที่มีข้อมูลปัจจุบัน ไม่ใช่การวัดภาคพื้น`, `${state.freshModel.length} current grid points; not a ground measurement`)}</p><Observation at={oldest(state.freshModel)} /></Stat>
        <Stat label={t("AOD ทั้งคอลัมน์จาก CAMS", "CAMS column AOD")} value={state.currentAerosol ? aerosol!.aod550!.toFixed(2) : "—"}><p>{t("550 nm · ปริมาณเชิงแสงทั้งคอลัมน์ ไม่ใช่ PM2.5 และไม่ใช่เกณฑ์สุขภาพ", "550 nm · optical column quantity, not PM2.5 or a health threshold")}</p><Observation at={aerosol?.observedAt} label={t("เวลาแบบจำลอง", "Model time")} /></Stat>
        <Stat label={t("AOD รายวันจาก AERONET", "AERONET daily AOD")} value={aeronetFresh && aeronet?.latest ? aeronet.latest.aod500.toFixed(2) : "—"}>
          <p role="status">{aeronetStatus === "loading" ? t("กำลังตรวจข้อมูล AERONET…", "Checking AERONET…") : aeronetStatus === "error" ? t("เข้าถึง AERONET ไม่ได้ ลองใหม่ได้ ไม่ตีความว่าอากาศใส", "AERONET unavailable. Retry; this does not mean clear air.") : aeronet?.latest ? t(`ค่าเฉลี่ยรายวัน ${aeronet.latest.date}${aeronetFresh ? "" : " · ข้อมูลเก่า ไม่ใช้แทนค่าปัจจุบัน"}`, `Daily average ${aeronet.latest.date}${aeronetFresh ? "" : " · old reference, not current conditions"}`) : t("ต้นทางไม่มีค่ารายวันที่ใช้ได้ในช่วงค้นหา หรืออ่านข้อมูลไม่ได้", "No usable daily reading in the source window, or the source could not be read")}</p><p>{t("500 nm · โฟโตมิเตอร์หนึ่งสถานี · ระดับ 1.5 ชั่วคราว ไม่ใช่ PM2.5", "500 nm · one sun photometer · Level 1.5 provisional, not PM2.5")}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-11 border border-[var(--line)] px-3 text-[13px] text-[var(--cool)]">{t("ตรวจ AERONET อีกครั้ง", "Retry AERONET")}</button>
        </Stat>
      </section>

      <section className="mt-6 border-t border-[var(--line)] pt-5"><h3 className="text-[18px] font-semibold">{t("กล้องเห็นอะไร — และยังบอกอะไรไม่ได้", "What cameras show — and cannot establish")}</h3>
        <p className="mt-2 max-w-[65ch] text-[14px] leading-relaxed text-[var(--dim)]">{t("คะแนนเปรียบเทียบรายละเอียดภาพกับค่าฐานรายกล้อง ไม่ใช่การวัดฝุ่น หมอก เมฆ แสงอาทิตย์ สิ่งบดบัง และภาพแทนที่อาจเปลี่ยนภาพได้ กลางคืนหรือภาพที่ใช้ไม่ได้ไม่ใช่หลักฐานว่าอากาศใส", "Scores compare image detail with a per-camera baseline, not particle concentration. Fog, cloud, sunlight, obstruction and placeholders can change the image. Nighttime or unusable images are not evidence of clear air.")}</p>
        <p className="mt-3 text-[14px] font-semibold">{state.relayCurrent ? t("รอบวิเคราะห์จากรีเลย์ยังอยู่ในช่วงเวลา", "Relay analysis is within its time window") : t("รอบวิเคราะห์จากรีเลย์ขาดหายหรือเก่า", "Relay analysis is missing or stale")}</p>
        <p className="mt-1 text-[14px]">{state.assessedCameras.length ? t(`เห็นสัญญาณหมอกควัน ${state.hazyCameras.length}/${state.assessedCameras.length} ภาพที่ประเมินได้`, `Haze signal in ${state.hazyCameras.length}/${state.assessedCameras.length} assessable frames`) : t("ยังไม่มีภาพที่ใช้ประเมินหมอกควันปัจจุบันได้", "No current assessable haze frames")}</p>
        <p className="mt-1 text-[13px] text-[var(--dim)]">{t(`ประเมินได้ ${state.assessedCameras.length} · ประเมินไม่ได้ ${state.currentCameras.length - state.assessedCameras.length} · ภาพเก่าหรือรอบไม่ยืนยัน ${state.staleCameras.length}`, `${state.assessedCameras.length} assessed · ${state.currentCameras.length - state.assessedCameras.length} unassessable · ${state.staleCameras.length} historical or unconfirmed`)}</p>
        <Observation at={hazeVision?.generatedAt} label={t("รับรอบวิเคราะห์เมื่อ", "Analysis batch")} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cameras.map(cam => <CameraCard key={`${cam.cameraId}-${cam.observedAt}`} cam={cam} current={current.has(cam)} assessed={assessed.has(cam)} />)}</div>
        {cameras.length === 0 && <p className="mt-3 text-[14px] text-[var(--dim)]">{t("ยังไม่มีภาพวิเคราะห์ให้ตรวจสอบ ไม่ใช่การยืนยันว่าไม่มีหมอกควัน", "No analyzed frames are available to inspect; this is not a no-haze finding.")}</p>}
        <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-[14px] font-semibold">{t("หลักฐานการตรวจสอบตัววิเคราะห์ · ไม่ใช่ความแม่นยำที่ยืนยันแล้ว", "Analyzer validation evidence · not proven accuracy")}</summary><p className="max-w-[65ch] text-[13px] leading-relaxed text-[var(--dim)]">{agreement?.r != null ? t(`สหสัมพันธ์ r=${agreement.r.toFixed(2)} จากค่าภาคพื้น ${agreement.pairs} ค่าที่จับคู่เวลา แต่ละค่านับครั้งเดียว ช่วงมัธยฐาน ${agreement.pm25Median ?? "—"} ถึง p95 ${agreement.pm25P95 ?? "—"} µg/m³ มีค่าตั้งแต่ 50 ขึ้นไป ${agreement.eventReadings} ค่า สหสัมพันธ์ไม่ใช่อัตราตรวจพบหรืออัตราพลาด`, `Correlation r=${agreement.r.toFixed(2)} over ${agreement.pairs} distinct time-matched ground readings, each counted once; median ${agreement.pm25Median ?? "—"} and p95 ${agreement.pm25P95 ?? "—"} µg/m³, ${agreement.eventReadings} readings at or above 50. Correlation is not a detection or miss rate.`) : t("ยังไม่มีข้อมูลจับคู่ที่พอคำนวณความสัมพันธ์ได้ ต้องตรวจทั้งช่วงอากาศใสและหมอกควันกับค่าภาคพื้นที่ตรงเวลา", "No sufficient paired evidence to calculate association. Evaluation needs both clear and hazy periods with time-matched ground readings.")}</p></details>
      </section>

      <section className="mt-6 border-t border-[var(--line)] pt-5"><h3 className="text-[18px] font-semibold">{t("บริบทการพัดพาควันใน 6 ชม.", "Six-hour smoke transport context")}</h3><p className="mt-2 text-[14px] font-semibold">{smoke?.method === "forecast-field" ? t("สนามลมพยากรณ์รายชั่วโมงที่ 850 hPa ไม่ใช่ลมผิวพื้นที่วัดได้", "Hourly forecast wind field at 850 hPa, not measured surface wind") : smoke?.method === "straight-line" ? t("เส้นตรงจากลมผิวพื้นหนึ่งจุด ไม่ใช่ลมที่วัดตามเส้นทาง", "Straight-line model from one surface-wind point, not wind measured along the path") : t("ยังไม่ยืนยันวิธีคำนวณการพัดพาควันรอบนี้", "Transport method is not confirmed for this run")}</p><p className="mt-2 max-w-[65ch] text-[14px] leading-relaxed text-[var(--dim)]">{t("การเคลื่อนที่ตามลมเป็นเพียงแบบจำลอง ไม่ใช่หลักฐานว่าควันมาถึงหรือการพยากรณ์คุณภาพอากาศ ไม่รวมการฟุ้งกระจายหรือการตกสะสม", "Wind advection is a model, not proof of smoke arrival or an air-quality forecast. Dispersion and deposition are not resolved.")}</p>
        {state.currentSmoke && smoke ? <><p className="mt-2 text-[14px]">{t(`เส้นทางจำลอง ${smoke.summary.nearCnx} เส้นอยู่ภายใน 50 กม. ของตัวเมือง และ ${smoke.summary.hitsCnx} เส้นเข้าเขตจังหวัด จากจุดตรวจจับ ${smoke.summary.total} จุด`, `${smoke.summary.nearCnx} modeled paths within 50 km of the city and ${smoke.summary.hitsCnx} entering the province, from ${smoke.summary.total} detections`)}</p><Observation at={smoke.generatedAt} label={t("รอบแบบจำลอง", "Model batch")} /></> : <p className="mt-2 text-[14px]">{t("ยังไม่มีรอบการพัดพาควันที่ยืนยันว่าปัจจุบัน ข้อมูลขาดไม่ใช่ไม่มีควัน", "No verified current smoke-transport run. Missing data is not no smoke.")}</p>}
        {(smoke?.omittedTrajectories ?? 0) > 0 && <p className="mt-2 text-[14px] text-[var(--dim)]">{t(`เส้นทาง ${smoke!.omittedTrajectories} เส้นไม่มีข้อมูลครบ 6 ชม. จึงไม่รวมในเส้นทางที่แสดง ข้อมูลขาดไม่ใช่ไม่มีควัน`, `${smoke!.omittedTrajectories} trajectories lack full 6 h coverage and are omitted from displayed paths. Missing paths do not establish no smoke.`)}</p>}
      </section>

      <section className="mt-6 border-t border-[var(--line)] pt-5"><h3 className="text-[18px] font-semibold">{citizenCurrent ? t(`รายงานสาธารณะและข่าว · ${state.reports.length} รายการใน 7 วัน`, `Public reports and news · ${state.reports.length} items in 7 days`) : t("รายงานสาธารณะและข่าว · ยังยืนยันจำนวนไม่ได้", "Public reports and news · count unconfirmed")}</h3><p className="mt-2 max-w-[65ch] text-[14px] leading-relaxed text-[var(--dim)]">{t("ค้นจากคำเกี่ยวกับหมอกควันในข่าวและ Reddit ไม่รวมทุกช่องทาง และยังไม่ยืนยันเหตุการณ์ รายการคงภาษาต้นฉบับ พิกัดเป็นเพียงพื้นที่ที่ข้อความเอ่ยถึง ไม่ใช่ตำแหน่งผู้รายงาน", "Keyword matches from news and Reddit do not cover every channel or confirm an incident. Titles retain their source language. Locations approximate places named in the text, not the reporter's position.")}</p>
        {!citizenCurrent && <p className="mt-2 text-[14px]">{t("ฟีดรายงานขาดหายหรือเก่า จึงยืนยันจำนวนรายงานปัจจุบันไม่ได้", "Report feed is unavailable or stale; a current report count cannot be established")}</p>}
        {citizenCurrent && state.reports.length === 0 && <p className="mt-2 text-[14px]">{t("ไม่มีรายการที่ผ่านเงื่อนไขในฟีดรอบนี้ ไม่ได้แปลว่าไม่มีหมอกควันหรือเหตุการณ์", "No qualifying items in this feed cycle; this does not mean no haze or incidents")}</p>}
        <ul className="mt-3 divide-y divide-[var(--line)]">{state.reports.slice(0, 60).map(report => <li key={report.id} className="py-3 text-[14px] leading-relaxed"><a href={report.url} target="_blank" rel="noopener noreferrer" className="text-[var(--cool)] underline">{report.title}<ExternalLink aria-hidden="true" className="ml-1 inline h-3 w-3" /></a><p className="text-[13px] text-[var(--dim)]">{report.source === "reddit" ? "Reddit" : t("ข่าว", "News")} · {report.place ? t(`${report.place.nameTh} (±${report.place.precisionKm} กม.)`, `${report.place.nameEn} (±${report.place.precisionKm} km)`) : t("ไม่ระบุสถานที่", "No place named")}</p><Observation at={report.publishedAt} label={t("เผยแพร่", "Published")} /></li>)}</ul>
        {citizen && <Observation at={citizen.generatedAt} label={t("รอบรวบรวมรายงาน", "Report collection batch")} />}
      </section>
      <details className="mt-6 border-t border-[var(--line)] pt-3"><summary className="min-h-11 cursor-pointer py-3 text-[14px] font-semibold">{t("พื้นที่เผาย้อนหลัง · บริบทฤดูกาล ไม่ใช่เหตุการณ์วันนี้", "Historical burn areas · seasonal context, not today's incidents")}</summary><CnxBurnSeason /></details>
    </div>
  </div>;
}
