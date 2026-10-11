"use client";

// CNX manual modal — same shape as Lopburi's manual: a quick
// walkthrough of the dashboard's streams and the data source behind
// each one. Diagrams over text, per the user's preference. One language
// per mode: every label comes through t(th, en).

import { useModalDialog } from "../../hooks/useModalDialog";
import { useLang } from "../../hooks/useLang";
import { X } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type T = (th: string, en: string) => string;

/** Screen layout as a box diagram. HTML rather than ASCII art: Thai
 *  glyphs break fixed-width box drawing. */
function LayoutDiagram({ t }: { t: T }) {
  const box = "border border-[var(--line)] bg-[var(--bg-raised)] px-2 py-1.5 text-[11px] leading-snug text-[var(--ink)]";
  return (
    <div className="space-y-1">
      <div className={box}>{t("แถบบน — ชื่อจังหวัด และป้ายสถานะแหล่งข้อมูล", "Top bar — identity and source/status pills")}</div>
      <div className={box}>{t("แถบกล้อง — ภาพนิ่งและสตรีมที่เปิดได้", "Camera strip — snapshots and available streams")}</div>
      <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-1">
        <div className={box}>{t("ฟังเสียงโซเชียล (ซ้าย)", "Social listening (left)")}</div>
        <div className={`${box} border-[var(--cool)]`}>
          {t("แผนที่ + เครื่องบิน + โบราณสถาน + อาคาร (สลับ 3 มิติได้)", "Map + aircraft + heritage + buildings (3D toggle)")}
        </div>
        <div className="space-y-1">
          <div className={box}>{t("น้ำท่วม / อากาศ / ไฟป่า (ขวา)", "Flood / air / fire (right)")}</div>
          <div className={box}>{t("ข้อมูลเปิด (ขวา)", "Open data (right)")}</div>
        </div>
      </div>
      <div className={box}>{t("แถบข่าววิ่ง — ฟีด · ไฟป่า · เที่ยวบิน · ข่าว", "Ticker — feeds · fires · flights · news")}</div>
    </div>
  );
}

function StreamList({ t }: { t: T }) {
  const rows: [string, string, string, string][] = [
    ["ฟังเสียงโซเชียล", "Social listening", "Google News RSS (ไทย + อังกฤษ) และ GDELT 2.0", "Google News RSS (Thai + English) and GDELT 2.0"],
    [
      "น้ำท่วม",
      "Flood",
      "Google Flood Hub (แบบจำลองลำน้ำที่จุดวัดเสมือน) — แสดงค่าสถานการณ์จำลองพร้อมป้ายเมื่อแบบจำลองไม่ตอบ และแยกจากระดับน้ำที่วัดจริง",
      "Google Flood Hub (riverine model at virtual gauges) — labelled scenario values when the model is unavailable; kept separate from measured river levels",
    ],
    [
      "ระดับน้ำที่วัดจริง",
      "Measured river levels",
      "สถานีวัดจริงในลุ่มน้ำปิงจาก ThaiWater พร้อมเวลาที่วัดและระดับวิกฤตที่ประกาศไว้ (ถ้ามี) ระยะห่างจากตลิ่งแสดงแยกต่างหาก",
      "ThaiWater physical gauges in the Ping basin, with observation times and published critical levels where available; distance to bank level is a separate field",
    ],
    [
      "คุณภาพอากาศ",
      "Air quality",
      "สถานีตรวจวัดของกรมควบคุมมลพิษ และกริดแบบจำลอง CAMS จาก Open-Meteo (Copernicus) ติดป้ายแยกกัน",
      "PCD official monitors and Open-Meteo CAMS model grids (Copernicus), labelled separately",
    ],
    ["ไฟป่า", "Fires", "NASA FIRMS (VIIRS SNPP / NOAA-20)", "NASA FIRMS (VIIRS SNPP / NOAA-20)"],
    [
      "กล้อง",
      "Cameras",
      "ภาพนิ่งจาก Windy และฟีด Longdo/iTIC ที่เปิดได้ กล้องถนนและน้ำท่วมสาธารณะระบุหน่วยงานเจ้าของทุกตัว",
      "Windy webcam snapshots and available Longdo/iTIC feeds; public road and flood camera catalogues credit each operating agency",
    ],
    ["โบราณสถาน", "Heritage", "คัดเลือกโดยทีมงาน (วัดพระสิงห์ ดอยสุเทพ ฯลฯ)", "Curated (Wat Phra Singh, Doi Suthep, …)"],
    [
      "ข้อมูลเปิด",
      "Open data",
      "แค็ตตาล็อก CKAN ของ data.go.th สำหรับเชียงใหม่ รายการที่มีอยู่ทั้งหมดอยู่ในคลังข้อมูล",
      "data.go.th CKAN catalogue for Chiang Mai; the records currently available are listed in the data workbench",
    ],
    [
      "เที่ยวบิน",
      "Flights",
      "OpenSky Network /states/all กรอบพิกัด 17.5–20.5°N / 97.5–100.5°E",
      "OpenSky Network /states/all, bounding box 17.5–20.5°N / 97.5–100.5°E",
    ],
  ];
  return (
    <ul className="space-y-1.5">
      {rows.map(([nameTh, nameEn, srcTh, srcEn]) => (
        <li key={nameEn}>
          <strong>{t(nameTh, nameEn)}</strong> · {t(srcTh, srcEn)}
        </li>
      ))}
    </ul>
  );
}

const SCENARIOS = ["burning-season-peak", "monsoon-flood-watch", "songkran-surge-week", "stable-winter-day"];

export default function CnxManualModal({ isOpen, onClose }: Props) {
  const dialogRef = useModalDialog(isOpen, onClose);
  const { t } = useLang();

  if (!isOpen) return null;
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cnx-manual-heading"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[88vh] w-full max-w-[920px] overflow-y-auto border border-[var(--line)] bg-[var(--bg-raised)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label={t("ปิดคู่มือ", "Close manual")}
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center border border-[var(--line)] text-[var(--dim)] hover:bg-[var(--cool-dim)] hover:text-[var(--ink)]"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 id="cnx-manual-heading" className="mb-1 pr-12 text-[20px] font-bold text-[var(--ink)]">
          {t("คู่มือห้องปฏิบัติการเชียงใหม่", "CNX Dashboard Manual")}
        </h2>
        <p className="mb-5 text-[12px] text-[var(--dim)]">
          {t(
            "วิธีอ่านกระดานห้องปฏิบัติการเชียงใหม่ — และตัวเลขแต่ละตัวมาจากไหน",
            "How to read the Chiang Mai war room — and where every number comes from.",
          )}
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-[var(--line)] bg-[var(--bg)] p-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--cool)]">
              {t("ผังหน้าจอ", "Architecture")}
            </div>
            <LayoutDiagram t={t} />
          </div>

          <div className="space-y-2 text-[11px] text-[var(--ink)]">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--cool)]">
              {t("ส่วนแสดงผล → แหล่งข้อมูล", "Stream → Source")}
            </h3>
            <StreamList t={t} />
          </div>

          <div className="border border-[var(--line)] bg-[var(--bg)] p-4 md:col-span-2">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--cool)]">
              {t("ลิงก์สถานการณ์จำลอง", "Scenario URLs")}
            </h3>
            <p className="mb-3 text-[11px] text-[var(--dim)]">
              {t("สถานะสาธิตที่คงที่ ใช้สำหรับจับภาพหน้าจอและการนำเสนอ:", "Deterministic demo states for screen-grabs and sales walks:")}
            </p>
            <div className="grid gap-1.5 md:grid-cols-2">
              {SCENARIOS.map((s) => (
                <code key={s} className="bg-[var(--cool-dim)] px-2 py-1 font-mono text-[11px] text-[var(--ink)]">?scenario={s}</code>
              ))}
            </div>
          </div>

          <div className="md:col-span-2">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--cool)]">
              {t("ปุ่มลัดแป้นพิมพ์", "Keyboard shortcuts")}
            </h3>
            <ul className="grid grid-cols-2 gap-1 text-[11px] text-[var(--ink)] md:grid-cols-4">
              <li><kbd className="bg-[var(--bg)] px-1 py-0.5 font-mono text-[11px]">S</kbd> · {t("เรื่องเล่าหลัก", "story modal")}</li>
              <li><kbd className="bg-[var(--bg)] px-1 py-0.5 font-mono text-[11px]">M</kbd> · {t("คู่มือนี้", "this manual")}</li>
              <li><kbd className="bg-[var(--bg)] px-1 py-0.5 font-mono text-[11px]">Esc</kbd> · {t("ปิดหน้าต่าง", "close modal")}</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-[var(--line)] pt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--dim)]">
          <span>© {t("ดร.นน", "Dr Non")} · cnx.nonarkara.org</span>
          <span>{t("กด ESC เพื่อปิด", "Press ESC to close")}</span>
        </div>
      </div>
    </div>
  );
}
