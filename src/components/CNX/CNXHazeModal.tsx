"use client";

// Haze Watch — one screen that puts every haze signal side by side, each
// with its source, age and limits: ground monitors (PCD Air4Thai, CMU
// DustBoy), model (Open-Meteo CAMS), model column aerosol (CAMS AOD) and ground
// photometer (NASA AERONET), webcam haze scoring, and citizen / local-news
// reports. Nothing here is fused into one number — disagreements between
// sources are information the operator should see.

import { useEffect, useState } from "react";
import { useModalDialog } from "../../hooks/useModalDialog";
import { ExternalLink, X } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import type { AeronetResponse } from "../../lib/cnx/aeronet";
import type { CitizenResponse } from "../../lib/cnx/citizen-reports";
import type { DustboyResponse } from "../../lib/cnx/dustboy";
import type { SmokeTrajectoryResponse } from "../../lib/cnx/smoke-trajectory";
import type { CameraHaze, HazeVisionResponse } from "../../lib/cnx/haze-vision";
import { MIN_BASELINE_SAMPLES, type HazeLabel } from "../../lib/cnx/haze-vision-core";
import type { AerosolResponse } from "../../lib/cnx/aerosol";
import type { AirQualityResponse } from "../../types/cnx";
import { DataAge, newest } from "./CNXDataAge";
import CnxBurnSeason from "./CNXBurnSeason";
import { useLang } from "../../hooks/useLang";
import { pick, type Lang } from "../../lib/i18n";

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
};

function ago(iso: string | undefined | null, lang: Lang): string {
  if (!iso) return "—";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min)) return "—";
  if (min < 60) return pick(lang, `${Math.max(0, min)} นาทีที่แล้ว`, `${Math.max(0, min)} min ago`);
  if (min < 48 * 60) return pick(lang, `${Math.round(min / 60)} ชม.ที่แล้ว`, `${Math.round(min / 60)} h ago`);
  return pick(lang, `${Math.round(min / 1440)} วันที่แล้ว`, `${Math.round(min / 1440)} d ago`);
}

function Stat({ label, value, sub, extra }: { label: string; value: string; sub: string; extra?: React.ReactNode }) {
  return (
    <div className="border border-[var(--line)] bg-[var(--bg-surface)] p-3">
      <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--dim)]">{label}</div>
      <div className="mt-1 text-[22px] font-bold tabular-nums text-[var(--ink)]">{value}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-[var(--dim)]">{sub}</div>
      {extra}
    </div>
  );
}

function CameraCard({ cam }: { cam: CameraHaze }) {
  const { lang, t } = useLang();
  const v = VERDICT[cam.verdict];
  return (
    <figure className="border border-[var(--line)] bg-[var(--bg-surface)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cam.snapshotUrl} alt={cam.label} loading="lazy" className="aspect-video w-full object-cover" />
      <figcaption className="space-y-1 p-2 text-[11px]">
        <div className="truncate font-bold text-[var(--ink)]" title={cam.label}>{cam.label}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] ${v.cls}`}>
            {t(v.th, v.en)}
          </span>
          {cam.score !== null && <span className="font-mono tabular-nums text-[var(--dim)]">{t("คะแนน", "score")} {cam.score.toFixed(2)}</span>}
        </div>
        <div className="text-[var(--dim)]">
          {t("ถ่ายภาพ", "frame taken")} {ago(cam.observedAt, lang)}
          {cam.verdict === "calibrating" && ` · ${cam.baselineSamples}/${MIN_BASELINE_SAMPLES} ${t("ภาพกลางวัน", "daylight frames")}`}
        </div>
        <div className="text-[var(--dim)]">
          {cam.nearestPm25
            ? t(`DustBoy ใกล้สุด ${cam.nearestPm25.distanceKm} กม.: PM2.5 ${cam.nearestPm25.pm25} µg/m³`, `nearest DustBoy ${cam.nearestPm25.distanceKm} km: PM2.5 ${cam.nearestPm25.pm25} µg/m³`)
            : t("ไม่มีค่า DustBoy ภายใน 15 กม. และ 90 นาทีจากเวลาภาพ", "no matching DustBoy reading within 15 km and 90 min of the frame")}
        </div>
      </figcaption>
    </figure>
  );
}

export default function CnxHazeModal({ isOpen, onClose, air, aerosol, dustboy, hazeVision, citizen, smoke }: Props) {
  const dialogRef = useModalDialog(isOpen, onClose);
  const { lang, t } = useLang();
  const [aeronet, setAeronet] = useState<AeronetResponse | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    if (!aeronet) void fetchJsonOrNull<AeronetResponse>("/api/cnx/aeronet", { signal: controller.signal }).then((next) => {
      if (!controller.signal.aborted) setAeronet(next);
    });
    return () => controller.abort();
  }, [isOpen, aeronet]);

  if (!isOpen) return null;

  const pcd = (air?.stations ?? []).filter((s) => s.source === "pcd");
  const model = (air?.stations ?? []).filter((s) => s.source === "open-meteo");
  const avg = (xs: (number | undefined)[]) => {
    const v = xs.filter((x): x is number => typeof x === "number");
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const pcdAvg = avg(pcd.map((s) => s.pm25));
  const modelAvg = avg(model.map((s) => s.pm25));
  const cams = hazeVision?.cameras ?? [];
  const hazyCams = cams.filter((c) => c.verdict === "haze-likely" || c.verdict === "some-haze").length;
  const reports = citizen?.reports ?? [];
  const agreement = hazeVision?.agreement;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t("เฝ้าระวังหมอกควัน", "Haze watch")}
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative my-6 w-full max-w-[1100px] border border-[var(--line)] bg-[var(--bg)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label={t("ปิดหน้าเฝ้าระวังหมอกควัน", "Close haze watch")}
          className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center border border-[var(--line)] bg-[var(--bg-raised)] text-[var(--dim)] hover:text-[var(--ink)]"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-[22px] font-bold text-[var(--ink)]">{t("เฝ้าระวังหมอกควัน — ทุกแหล่งข้อมูลเทียบกัน", "Haze watch — every source side by side")}</h2>
        <p className="mt-1 max-w-[80ch] text-[13px] leading-relaxed text-[var(--dim)]">
          {t("สัญญาณหมอกควันทุกแหล่งวางเทียบกันพร้อมแหล่งที่มาและอายุข้อมูล ไม่ได้รวมเป็นตัวเลขเดียว: เครื่องวัดภาคพื้น แบบจำลองพยากรณ์ ดาวเทียม กล้อง และประชาชน ต่างเห็นคนละมุม และความเห็นที่ไม่ตรงกันเป็นสิ่งที่ควรสังเกต", "Every haze signal side by side with its source and age. They are not merged into one number: ground sensors, a forecast model, satellites, cameras and people each see something different, and disagreement is worth noticing.")}
        </p>

        <section className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          <Stat
            label={t("ภาคพื้น คพ. (Air4Thai)", "PCD ground (Air4Thai)")}
            value={pcdAvg === null ? "—" : `${pcdAvg}`}
            sub={pcd.length ? t(`µg/m³ · สถานีทางการ ${pcd.length} แห่ง · ${ago(pcd[0]?.observedAt, lang)}`, `µg/m³ · ${pcd.length} official monitor(s) · ${ago(pcd[0]?.observedAt, lang)}`) : t("ไม่มีค่าล่าสุดจาก คพ.", "no fresh PCD reading")}
          />
          <Stat
            label={t("ภาคพื้น DustBoy (มช.)", "DustBoy ground (CMU)")}
            value={dustboy?.basin.chiangMai.avgPm25 != null ? `${dustboy.basin.chiangMai.avgPm25}` : "—"}
            sub={
              dustboy?.provenance === "live" && dustboy.basin.chiangMai.onlineCount > 0
                ? t(`µg/m³ · เชียงใหม่ออนไลน์ ${dustboy.basin.chiangMai.onlineCount} · ภาคเหนือตอนบน ${dustboy.basin.avgPm25 ?? "—"} (${dustboy.basin.onlineCount})`, `µg/m³ · Chiang Mai ${dustboy.basin.chiangMai.onlineCount} online · upper north ${dustboy.basin.avgPm25 ?? "—"} (${dustboy.basin.onlineCount})`)
                : t(`เครื่องวัด ${dustboy?.basin.stationCount ?? 0} เครื่อง ไม่มีค่าในเชียงใหม่ที่อายุไม่เกิน 3 ชม.`, `${dustboy?.basin.stationCount ?? 0} sensors, none with a Chiang Mai reading < 3 h old`)
            }
            // The batch is hourly and the rule is 3 h, so say which
            // reading is behind the number rather than leaving the reader
            // to assume it is current.
            extra={
              <DataAge
                className="mt-0.5 block"
                source={t("รอบข้อมูล มช.", "CMU batch")}
                observedAt={newest(dustboy?.stations)}
                staleAfterMs={3 * 3_600_000}
                missing={t("ไม่มีค่าที่วัด", "no reading")}
              />
            }
          />
          <Stat
            label={t("แบบจำลอง (Open-Meteo CAMS)", "Model (Open-Meteo CAMS)")}
            value={modelAvg === null ? "—" : `${modelAvg}`}
            sub={t(`µg/m³ · แบบจำลองพยากรณ์ ${model.length} จุดกริด — ไม่ใช่ค่าที่วัด`, `µg/m³ · forecast model, ${model.length} grid points — not a measurement`)}
          />
          <Stat
            label={t("AOD ทั้งคอลัมน์จากแบบจำลอง (CAMS)", "Model column AOD (CAMS)")}
            value={aerosol?.aod550?.toFixed(2) ?? "—"}
            sub={t("กริดแบบจำลอง · ความลึกเชิงแสงของละอองลอยทั้งคอลัมน์ที่ 550 nm ไม่ใช่ PM2.5 ภาคพื้น", "Model grid · column aerosol optical depth at 550 nm, not ground PM2.5")}
          />
          <Stat
            label={t("AOD ภาคพื้น (AERONET)", "Ground AOD (AERONET)")}
            value={aeronet?.latest ? aeronet.latest.aod500.toFixed(2) : "—"}
            sub={aeronet?.latest ? t(`500 nm · ${aeronet.latest.date} · ระดับ 1.5 (ชั่วคราว)`, `500 nm · ${aeronet.latest.date} · Level 1.5 provisional`) : aeronet ? t("ไม่มีค่าใน 30 วัน", "no reading in 30 days") : t("กำลังโหลด…", "loading…")}
          />
          <Stat
            label={t("เว็บแคม", "Webcams")}
            value={cams.length ? `${hazyCams}/${cams.length}` : "—"}
            sub={cams.length ? t("กล้องที่เห็นหมอกควัน", "cameras showing haze") : hazeVision?.note ?? t("กำลังโหลด…", "loading…")}
          />
        </section>

        {dustboy?.caveat && (
          <p className="mt-3 border-l-2 border-[var(--sev-watch)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] leading-relaxed text-[var(--dim)]">
            <span className="font-semibold text-[var(--ink)]">
              {t("ตรวจสอบเครื่องก่อน", "Check the sensor first")}
            </span>{" "}
            <span>{t(dustboy.caveat.th, dustboy.caveat.en)}</span>
          </p>
        )}

        <section className="mt-6">
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
            {t("ควันกำลังไปทางไหน (6 ชม.)", "Where the smoke is going (6 h)")}
          </h3>
          <p className="mt-1 max-w-[90ch] text-[12px] leading-relaxed text-[var(--dim)]">
            {smoke ? t(smoke.methodology_th, smoke.methodology_en) : t("การเคลื่อนที่แนวตรงตามลมผิวพื้น ไม่ใช่การพยากรณ์", "Straight-line advection from surface wind. Not a forecast.")}
          </p>
          {smoke?.provenance === "live" ? (
            <p className="mt-2 text-[13px] text-[var(--ink)]">
              {t("ลม", "Wind")} {smoke.wind ? t(`${smoke.wind.speedKmh} กม./ชม. จากทิศ ${smoke.wind.fromDirectionDeg}°`, `${smoke.wind.speedKmh} km/h from ${smoke.wind.fromDirectionDeg}°`) : t("ไม่มีข้อมูล", "unavailable")}.
              {" "}{t("จุดไฟอยู่", "Fires sit")} <span className="font-semibold">{t(smoke.summary.origin_th, smoke.summary.origin_en)}</span>.
              {" "}{lang === "en"
                ? `${smoke.summary.nearCnx} plume${smoke.summary.nearCnx === 1 ? "" : "s"} within 50 km of the city, ${smoke.summary.hitsCnx} enter the province, ${smoke.summary.total} detection${smoke.summary.total === 1 ? "" : "s"} in the 350 km window${smoke.summary.shown < smoke.summary.total ? ` (map shows ${smoke.summary.shown})` : ""}.`
                : `กลุ่มควัน ${smoke.summary.nearCnx} กลุ่มอยู่ภายใน 50 กม. จากตัวเมือง, ${smoke.summary.hitsCnx} กลุ่มเข้าเขตจังหวัด, จุดตรวจจับ ${smoke.summary.total} จุดในรัศมี 350 กม.${smoke.summary.shown < smoke.summary.total ? ` (แผนที่แสดง ${smoke.summary.shown})` : ""}`}
            </p>
          ) : (
            <p className="mt-2 border border-[var(--line)] bg-[var(--bg-surface)] p-3 text-[12px] text-[var(--dim)]">
              {smoke?.note ?? t("กำลังโหลดรอบ VIIRS ล่าสุด…", "Loading the live VIIRS pass…")}
            </p>
          )}
        </section>

        <section className="mt-6">
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">{t("การให้คะแนนหมอกควันจากเว็บแคม", "Webcam haze scoring")}</h3>
          <p lang="en" className="mt-1 max-w-[90ch] text-[12px] leading-relaxed text-[var(--dim)]">{hazeVision?.methodology}</p>
          <p className="mt-1 text-[12px] text-[var(--ink)]">
            {!agreement
              ? t("ยังไม่มีการวัดความสอดคล้อง", "No agreement measurement yet.")
              : agreement.r === null
              ? agreement.pairs < 8
                ? t(`ค่าภาคพื้นที่จับคู่กับภาพกล้องยังไม่พอ (${agreement.pairs}; ต้องการ 8)`, `Not enough distinct ground readings paired with camera frames yet (${agreement.pairs}; needs 8).`)
                : t("คะแนนกล้องหรือค่าภาคพื้นที่จับคู่ไม่แปรผันพอจะคำนวณสหสัมพันธ์", "The camera scores or paired ground readings did not vary enough to calculate a correlation.")
              : lang === "th"
              ? agreement.spansHazeEvent
                ? `ความสัมพันธ์กับค่า DustBoy ที่ตรงเวลา: r = ${agreement.r.toFixed(2)} จากค่าภาคพื้น ${agreement.pairs} ค่า แต่ละค่านับครั้งเดียวโดยใช้ค่าเฉลี่ยคะแนนกล้องที่จับคู่ ค่าภาคพื้นอยู่ระหว่างมัธยฐาน ${agreement.pm25Median} ถึง p95 ${agreement.pm25P95} µg/m³ มีค่าที่ไม่ดีต่อสุขภาพ ${agreement.eventReadings} ค่า นี่เป็นความสัมพันธ์ที่สังเกตได้ ไม่ใช่การวัดความแม่นยำในการตรวจจับ`
                : `ยังไม่ได้ยืนยันความแม่นยำในการตรวจจับกับช่วงหมอกควันที่หลากหลาย ค่าภาคพื้น ${agreement.pairs} ค่า: มัธยฐาน ${agreement.pm25Median} µg/m³, p95 ${agreement.pm25P95} และ ${agreement.eventReadings} ค่าที่ 50 ขึ้นไป สหสัมพันธ์ r = ${agreement.r.toFixed(2)} ในช่วงจำกัดนี้ยืนยันไม่ได้ว่ากล้องตรวจจับหมอกควันได้น่าเชื่อถือเพียงใด`
              : agreement.spansHazeEvent
              ? `Association with time-matched DustBoy readings: r = ${agreement.r.toFixed(2)} over ${agreement.pairs} distinct ground observations. Each sensor reading counts once, using the average of its paired camera scores. Ground readings spanned a median of ${agreement.pm25Median} to p95 ${agreement.pm25P95} µg/m³ with ${agreement.eventReadings} unhealthy readings. This is an observed association, not a measurement of detection accuracy.`
              : `Detection accuracy is not yet established against a varied haze episode. ${agreement.pairs} distinct ground observations: median ${agreement.pm25Median} µg/m³, p95 ${agreement.pm25P95}, and ${agreement.eventReadings} at or above 50. Correlation r = ${agreement.r.toFixed(2)} on this limited window cannot establish how reliably the cameras detect haze.`}
          </p>
          {cams.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
              {cams.map((c) => (
                <CameraCard key={c.cameraId} cam={c} />
              ))}
            </div>
          ) : (
            <p className="mt-3 border border-[var(--line)] bg-[var(--bg-surface)] p-3 text-[12px] text-[var(--dim)]">
              {hazeVision?.note ?? t("กำลังโหลด…", "Loading…")} {t("เว็บแคมสาธารณะในเชียงใหม่ (Windy) อัปเดตเพียงไม่กี่ครั้งต่อวัน และภาพที่เก่ากว่า 6 ชม. จะไม่ถูกให้คะแนน", "Public Chiang Mai webcams (Windy) refresh only a few times a day, and frames older than 6 h are not scored.")}
            </p>
          )}
        </section>

        <CnxBurnSeason />

        <section className="mt-6">
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
            {t(`รายงานจากประชาชนและข่าวท้องถิ่น (${reports.length}, 7 วันล่าสุด)`, `Citizen & local-news reports (${reports.length}, last 7 days)`)}
          </h3>
          <p lang="en" className="mt-1 max-w-[90ch] text-[12px] leading-relaxed text-[var(--dim)]">{citizen?.note}</p>
          {reports.length > 0 ? (
            <ul className="mt-2 divide-y divide-[var(--line)] border border-[var(--line)]">
              {reports.slice(0, 60).map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2 text-[12px]">
                  <span className="font-mono text-[11px] uppercase text-[var(--cool)]">{r.source === "reddit" ? "Reddit" : t("ข่าว", "News")}</span>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 text-[var(--ink)] hover:underline">
                    {r.title} <ExternalLink className="inline h-3 w-3" />
                  </a>
                  <span className="text-[var(--dim)]">
                    {r.place
                      ? `📍 ${t(r.place.nameTh, r.place.nameEn)} (±${r.place.precisionKm} ${t("กม.", "km")})`
                      : t("ไม่ระบุสถานที่ — ไม่ปักหมุด", "no place named — not pinned")}{" "}
                    · {ago(r.publishedAt, lang)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-[var(--dim)]">{t("ไม่มีรายงานหมอกควันใน 7 วันที่ผ่านมา", "No haze reports in the last 7 days.")}</p>
          )}
          {citizen && citizen.sources.length > 0 && (
            <p className="mt-2 font-mono text-[11px] text-[var(--dim)]">
              {t("แหล่งข้อมูลรอบนี้", "Sources this cycle")}: {citizen.sources.map((s) => `${s.label} ${s.ok ? `✓ ${s.items}` : `✗ ${t("ล้มเหลว", "failed")}`}`).join(" · ")}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
