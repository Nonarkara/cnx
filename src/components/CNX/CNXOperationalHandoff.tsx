"use client";
import type { OperationalHandoff } from "../../lib/cnx/operational-handoff";
import { useLang } from "../../hooks/useLang";
export default function CnxOperationalHandoff({ rows, onOpenMetric }: { rows: OperationalHandoff[]; onOpenMetric: (id: "water" | "haze") => void }) {
 const {t}=useLang();
 return <details className="border-y border-[var(--line)] py-1" aria-label={t("ต้นน้ำ พื้นที่ท่วมซ้ำ และควันข้ามแดน", "Catchment, repeat-flood areas and regional smoke")}>
  <summary className="min-h-11 cursor-pointer py-3 text-[13px] font-semibold">{t("ตรวจต้นน้ำ–ท้ายน้ำและควันข้ามแดน", "Catchment and cross-border checks")}</summary>
  <div className="divide-y divide-[var(--line)]">{rows.map(row=><section key={row.id} className="py-3 text-[13px] leading-relaxed">
   <h3 className="font-semibold text-[var(--ink)]">{t(row.titleTh,row.titleEn)}</h3>
   <p className="mt-2 max-w-[65ch] text-[var(--dim)]">{t(row.th,row.en)}</p>
   <p className="mt-2 max-w-[65ch] text-[var(--ink)]">{t(row.actionTh,row.actionEn)}</p>
   <div className="mt-2 flex flex-wrap items-center gap-x-4"><a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-[12px] text-[var(--cool)] underline">{row.sourceLabel} ↗</a><button type="button" className="min-h-11 border border-[var(--line)] px-2 text-[12px]" onClick={()=>onOpenMetric(row.id==="air"?"haze":"water")}>{t("เปิดหลักฐาน", "Open evidence")}</button></div>
  </section>)}</div>
 </details>;
}
