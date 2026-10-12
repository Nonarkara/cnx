"use client";

// CNX emergency hotline modal — a compact, storm-ready quick-reference
// card. Same shell as CNXManualModal / CNXStoryModal, but styled with
// a danger accent since this one matters most when things are already
// going wrong.
//
// Curated from published sources so numbers aren't invented:
//   - Provincial hotline 1567 and national EMS 1669 (public short codes)
//   - Chiang Mai municipal traffic landline, kept as an organisation
//     switchboard. Personal duty mobiles are not published.
//   - changpuakmagazine.com/en-article/EMERGENCY/751083
//   - chiangmailocator.com/wiki-emergency-telephone-numbers-chiang-mai-p98
// Every entry keeps its source so a stale number can be traced back
// and re-verified rather than silently trusted forever.

import { useModalDialog } from "../../hooks/useModalDialog";
import { useLang } from "../../hooks/useLang";
import { X, PhoneCall } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface HotlineEntry {
  labelTh: string;
  labelEn: string;
  phone: string;
}

interface HotlineGroup {
  titleTh: string;
  titleEn: string;
  /** A URL stays as published; a plain note has a Thai and English form. */
  source: string | { th: string; en: string };
  entries: HotlineEntry[];
}

const GROUPS: HotlineGroup[] = [
  {
    titleTh: "รับมือพายุ / น้ำท่วม (เทศบาลนครเชียงใหม่)",
    titleEn: "Storm / flood response (Chiang Mai municipal)",
    source: {
      th: "สายด่วนจังหวัด 1567 และหน่วยแพทย์ 1669 เป็นหมายเลขสาธารณะ — ไม่เผยแพร่เบอร์มือถือส่วนบุคคล",
      en: "Provincial hotline 1567 and EMS 1669 are public numbers. Personal mobiles are not published.",
    },
    entries: [
      { labelTh: "สายด่วนจังหวัดเชียงใหม่", labelEn: "Chiang Mai Provincial Hotline", phone: "1567" },
      { labelTh: "จราจร / ถนนน้ำท่วม / อุบัติเหตุ (เทศบาลนครเชียงใหม่)", labelEn: "Traffic / Flooded Roads / Accidents (Chiang Mai Municipality)", phone: "053-235595" },
      { labelTh: "หน่วยแพทย์ฉุกเฉิน อบจ.เชียงใหม่", labelEn: "Chiang Mai PAO EMS (Medical Emergency)", phone: "1669" },
    ],
  },
  {
    titleTh: "เหตุฉุกเฉินทั่วไป",
    titleEn: "General emergency",
    source: "changpuakmagazine.com/en-article/EMERGENCY/751083",
    entries: [
      { labelTh: "ตำรวจ / เหตุด่วนเหตุร้าย", labelEn: "Police / Emergency / Crime", phone: "191" },
      { labelTh: "ดับเพลิง", labelEn: "Fire Department", phone: "199" },
      { labelTh: "รถพยาบาลฉุกเฉิน (ทั่วประเทศ)", labelEn: "Ambulance (nationwide)", phone: "1669" },
      { labelTh: "ตำรวจท่องเที่ยว", labelEn: "Tourist Police", phone: "1155 / 1699" },
      { labelTh: "ตำรวจจราจร", labelEn: "Traffic Police", phone: "1197" },
      { labelTh: "แจ้งอุบัติเหตุจราจร", labelEn: "Traffic Accident", phone: "1193" },
      { labelTh: "แจ้งรถหาย", labelEn: "Vehicle Theft Police", phone: "1192" },
      { labelTh: "ตรวจคนเข้าเมืองเชียงใหม่", labelEn: "Chiang Mai Immigration", phone: "053-201-755" },
    ],
  },
  {
    titleTh: "โรงพยาบาล",
    titleEn: "Hospitals",
    source: "chiangmailocator.com/wiki-emergency-telephone-numbers-chiang-mai-p98",
    entries: [
      { labelTh: "โรงพยาบาลมหาราชนครเชียงใหม่ (มช.)", labelEn: "Maharaj Hospital (CMU)", phone: "053-947-000" },
      { labelTh: "โรงพยาบาลเชียงใหม่ราม", labelEn: "Chiang Mai Ram Hospital", phone: "053-920-300" },
      { labelTh: "โรงพยาบาลนครพิงค์", labelEn: "Nakornping Hospital", phone: "053-999-200" },
      { labelTh: "โรงพยาบาลลานนา", labelEn: "Lanna Hospital", phone: "053-999-777" },
      { labelTh: "โรงพยาบาลแมคคอร์มิค", labelEn: "McCormick Hospital", phone: "053-921-777" },
    ],
  },
];

export default function CnxEmergencyModal({ isOpen, onClose }: Props) {
  const dialogRef = useModalDialog(isOpen, onClose);
  const { lang, t } = useLang();

  if (!isOpen) return null;
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cnx-emergency-heading"
      lang={lang}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[88vh] w-full max-w-[640px] overflow-y-auto border-2 border-[var(--danger)] bg-[var(--bg-raised)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label={t("ปิดหมายเลขฉุกเฉิน", "Close emergency numbers")}
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center border border-[var(--line)] text-[var(--dim)] hover:bg-[var(--cool-dim)] hover:text-[var(--ink)]"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-1 flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-[var(--danger)]" />
          <h2 id="cnx-emergency-heading" className="pr-12 text-[20px] font-bold text-[var(--ink)]">
            {t("หมายเลขฉุกเฉิน — เชียงใหม่", "Emergency Hotlines — Chiang Mai")}
          </h2>
        </div>
        <p className="mb-5 text-[12px] text-[var(--dim)]">
          {t("เบอร์รับมือพายุและน้ำท่วมก่อน ตามด้วยเหตุฉุกเฉินทั่วไปและโรงพยาบาล", "Storm and flood response numbers first, then general emergency and hospitals.")}
        </p>

        <div className="space-y-5">
          {GROUPS.map((g) => (
            <div key={g.titleEn}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--cool)]">
                  {t(g.titleTh, g.titleEn)}
                </h3>
                <span className="truncate font-mono text-[11px] text-[var(--dim)]">{typeof g.source === "string" ? g.source : t(g.source.th, g.source.en)}</span>
              </div>
              <ul className="divide-y divide-[var(--line)] border border-[var(--line)]">
                {g.entries.map((e) => (
                  <li key={e.labelEn} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="text-[12px] text-[var(--ink)]">{t(e.labelTh, e.labelEn)}</span>
                    <a
                      href={`tel:${e.phone.split("/")[0].replace(/[^\d+]/g, "")}`}
                      className="shrink-0 font-mono text-[13px] font-bold tabular-nums text-[var(--danger)] hover:underline"
                    >
                      {e.phone}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-[var(--line)] pt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--dim)]">
          <span>{t("ตรวจสอบก่อนเผยแพร่สู่สาธารณะ — หมายเลขอาจเปลี่ยนได้", "Verify before publishing to the public — numbers can go stale")}</span>
          <span>{t("กด ESC เพื่อปิด", "Press ESC to close")}</span>
        </div>
      </div>
    </div>
  );
}
