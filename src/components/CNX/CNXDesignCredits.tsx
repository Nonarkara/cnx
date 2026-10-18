import { DESIGN_REFERENCES } from "../../lib/cnx/design-references";
import { LINK, NOTE, Section } from "./CNXAboutSection";

export default function CNXDesignCredits({ th }: { th: boolean }) {
  return (
    <Section kicker={th ? "SIC · ศึกษา ปรับปรุง ให้เครดิต" : "SIC · study, improve, credit"} title={th ? "เรียนรู้และให้เครดิต 47 แหล่งอ้างอิง" : "Learning from 47 credited references"}>
      <p className={`${NOTE} mt-3`}>
        {th
          ? "ทบทวนรายการศึกษาของ FloodDash ตามวันที่บันทึก รวมทั้งแอปชุมชนและบริการทางการ ไม่ได้ยืนยันว่าใช้ AI สร้างหรือแม่นยำกว่าใคร การเปรียบเทียบครั้งนี้ไม่ได้คัดลอกโค้ดหรือชุดข้อมูลภายนอก ฟีดที่ใช้อยู่มีเครดิตแยกต่างหาก 46 รายการเคยเปิดศึกษา อีก 1 รายการยังไม่ได้เปิด"
          : "Reconciled from FloodDash’s dated research catalogue: community apps, official services and research tools. This is not a fresh inspection, an accuracy ranking, or a claim that all were AI-built. No third-party code or datasets copied as part of this comparison; existing feeds retain their own attribution. 46 entries were historically inspected; one remains unopened."}
      </p>
      <details className="mt-3">
        <summary className="w-fit cursor-pointer py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-[var(--cool)]">
          {th ? "ดูรายชื่อและแนวคิด · 47 รายการ" : "References and lessons · 47 entries"}
        </summary>
        <p className={`${NOTE} my-2`}>{th ? "ปรับปรุง = แก้ในรอบนี้ · สอดคล้อง = มีอยู่แล้ว ไม่ยืนยันที่มา · อ้างอิง = ยังไม่นำมาใช้" : "Improved = changed in this audit · Aligned = existing capability, without claiming origin · Reference = lesson only, not adopted"}</p>
        <ol className="divide-y divide-[var(--line)] text-sm">
          {DESIGN_REFERENCES.map((ref) => (
            <li key={ref.sourceIndex} className="py-2">
              <span className="mr-2 text-[var(--dim)]">{ref.sourceIndex}.</span>
              {ref.url ? <a href={ref.url} target="_blank" rel="noreferrer" className={LINK}>{th ? ref.name : ref.nameEn}</a> : <span>{th ? ref.name : ref.nameEn}</span>}
              <span className="ml-2 text-xs text-[var(--dim)]">{th ? ({ improved: "ปรับปรุง", aligned: "สอดคล้อง", reference: "อ้างอิง" }[ref.status]) : ref.status}</span>
              <p className="mt-1 text-[var(--dim)]">{th ? ref.lessonTh : ref.lesson}</p>
            </li>
          ))}
        </ol>
      </details>
    </Section>
  );
}
