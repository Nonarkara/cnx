"use client";

// The research tab: one preprint, shown as a PDF, with what a reader needs to
// check it. The PDF window leads (it is the thing people came for); the
// abstract, the four findings, the files and the citation earn the scroll.
// Narrow screens get the pages as images, because phone browsers show only
// the first page of an embedded PDF.

import { useState } from "react";
import { useLang } from "../../hooks/useLang";

export interface ResearchStats {
  datasets: number; resources: number; orgs: number; unreadablePct: number; spatial: number; medianAge: number;
  shelters: number; shelterBuilding: number; over20Pct: number; towerSites: number; towerMedianKm: number;
  entities: number; agencies: number; buildDays: number; onTime: number; sloTotal: number; pages: number;
}

const BASE = "/research";
export const PDF_URL = `${BASE}/gauge-to-shelter-preprint.pdf`;
const TITLE = "From Gauge to Shelter: Why Thai Smart-City Programmes Stall Between Measurement and Action";

const BTN = "inline-flex min-h-11 items-center border border-[var(--line)] px-3 text-[13px] font-semibold hover:border-[var(--ink)]";
const BTN_PRIMARY = "inline-flex min-h-11 items-center bg-[var(--cool)] px-3 text-[13px] font-semibold text-[var(--bg)] hover:opacity-90";

export default function CNXResearch({ stats: s }: { stats: ResearchStats }) {
  const { t, lang } = useLang();
  // Some embedded browsers and phones do not render a PDF inside a page; the pages-as-images view is always available.
  const [asImages, setAsImages] = useState(false);
  const n = (x: number) => x.toLocaleString(lang === "th" ? "th-TH" : "en-US");

  const abstract = t(
    `ประเทศไทยส่งเสริมเมืองอัจฉริยะและรัฐบาลดิจิทัลมาเกือบสิบปี แต่ห่วงโซ่ที่สำคัญที่สุด คือจากค่าที่วัดได้ไปสู่ข้อความที่ทำให้คนเคลื่อนย้าย ยังขาดตอน เราพิจารณาสี่คำอธิบาย ได้แก่ การประสานงานระหว่างหน่วยงานที่อ่อนแอ การจัดซื้อที่ได้ไฟล์แทนบริการ ข้อมูลที่บันทึกอดีตแทนที่จะขับเคลื่อนการตอบสนอง และไม่มีห่วงโซ่ตั้งแต่การเฝ้าระวังถึงการแจ้งเตือน ในจังหวัดเชียงใหม่ เราบรรยายสิ่งที่คลังข้อมูลเปิดเผยแพร่ (${n(s.datasets)} ชุด ${n(s.resources)} ทรัพยากร ${s.orgs} หน่วยงาน) ตรวจห่วงโซ่ภัยพิบัติสองสายทีละข้อต่อ และรายงานผลการใช้งานของ CNX ห้องปฏิบัติการข้อมูลสาธารณะที่ปรับมาใช้ปิดห่วงโซ่โดยไม่ต้องรอข้อตกลงระหว่างหน่วยงาน พบว่า ${s.unreadablePct}% ของทรัพยากรอ่านเป็นตารางไม่ได้ และมีเพียง ${s.spatial} ชุดที่มีพิกัด เราไม่พบชุดข้อมูลเรื่องท่อระบายน้ำ เส้นทางอพยพ หรือการจัดซื้อ แถวศูนย์พักพิงทางการ ${s.shelters} แถวไม่มีพิกัดสักแถว และ ${s.over20Pct}% ของแห่งที่รายงานห้องสุขามีผู้ใช้เกิน 20 คนต่อห้อง ซึ่งเป็นค่าอ้างอิง CNX ใช้ข้อมูลจาก ${s.agencies} แหล่งภายในเจ็ดสัปดาห์ ฟีด ${s.onTime} จาก ${s.sloTotal} ที่ประกาศเกณฑ์ไว้อยู่ในเกณฑ์ และประกาศทางการของกรมอุตุนิยมวิทยาอยู่ลำดับแรกบนกระดาน ช่องว่างด้านการประสานงาน การจัดซื้อ และความทันต่อเหตุการณ์ข้ามได้ด้วยข้อมูลสาธารณะและมาตรฐานเปิด ส่วนอำนาจสั่งการ ทะเบียนทรัพย์สิน และการตรวจสอบความถูกต้อง ข้ามไม่ได้ การตรวจนี้เป็นการบรรยาย และระบบได้รับการประเมินเฉพาะความเป็นไปได้ เราแสดงว่าช่องว่างเหล่านี้มีอยู่และวัดได้ ไม่ได้แสดงว่าเป็นสาเหตุของโครงการที่หยุดชะงัก`,
    `Thailand has promoted smart cities and digital government for a decade, yet the chain that matters, a measurement becoming a message that moves a person, stays open. We examine four explanations: weak inter-agency coordination, procurement that buys files rather than services, data that records rather than responds, and no end-to-end monitoring-to-push chain. In one province we describe what the open-data estate publishes (${n(s.datasets)} datasets, ${n(s.resources)} resources, ${s.orgs} publishers), audit two hazard chains link by link, and report the operating record of CNX, a public-data operations room adapted to close the chain without inter-agency agreements. ${s.unreadablePct}% of resources could not be parsed and ${s.spatial} datasets carry a location; we found none about drainage, evacuation routes or procurement. None of the ${s.shelters} official shelter rows carries a coordinate, and ${s.over20Pct}% of those reporting toilets exceed a reference of 20 people per toilet. CNX drew on ${s.agencies} providers within seven calendar weeks; ${s.onTime} of ${s.sloTotal} feeds with a declared limit were inside it; official meteorological warnings lead its board. Coordination, procurement and responsiveness gaps could be bypassed with public data and open standards; authority, asset registers and validation could not. The audit is descriptive and the system is evaluated for feasibility only: we show that the gaps are present and measurable, not that they cause the stalled programmes.`,
  );

  const rows: { gap: string; finding: string }[] = [
    { gap: t("H1 การประสานงาน", "H1 Coordination"),
      finding: t(`${s.orgs} หน่วยงานเผยแพร่ มีพิกัดเพียง ${s.spatial} จาก ${s.datasets} ชุด ยังไม่ได้วัดว่าข้อมูลข้ามหน่วยงานเชื่อมกันได้จริงหรือไม่`, `${s.orgs} publishers; only ${s.spatial} of ${s.datasets} datasets carry a location. Whether records join across agencies was not measured`) },
    { gap: t("H2 การจัดซื้อ", "H2 Procurement"),
      finding: t(`ไม่พบชุดข้อมูลเรื่องการจัดซื้อ มี 2 ชุดระบุรูปแบบ API แต่ไม่มีชุดใดเป็นข้อมูลสด ${s.unreadablePct}% ของทรัพยากรอ่านไม่ได้ เป็นตัวชี้วัดทางอ้อม`, `No procurement dataset found; 2 list an API format and none is live; ${s.unreadablePct}% of resources unreadable. An indirect indicator`) },
    { gap: t("H3 ความทันต่อเหตุการณ์", "H3 Responsiveness"),
      finding: t(`ชุดข้อมูลมีอายุกลาง ${s.medianAge} ปี ชุดข้อมูลสาธารณภัยทั้งหมดเป็นทะเบียนหรือข้อมูลย้อนหลัง นี่อธิบายคลังข้อมูล ไม่ใช่ระบบปฏิบัติการของหน่วยงาน`, `Median dataset ${s.medianAge} years old; every disaster dataset is a register or an archive. This describes the portal, not agencies' operational systems`) },
    { gap: t("H4 ห่วงโซ่ครบวงจร", "H4 End-to-end"),
      finding: t(`ศูนย์พักพิง ${s.shelters} แถวไม่มีพิกัด (ระบุตำแหน่งอาคารได้ ${s.shelterBuilding}) หอเตือนภัย ${s.towerSites} จุด ห่างศูนย์พักพิงที่ระบุอาคารได้โดยกลาง ${s.towerMedianKm} กม.`, `0 of ${s.shelters} shelter rows carry a coordinate (${s.shelterBuilding} located at the building); ${s.towerSites} warning-tower sites, a median ${s.towerMedianKm} km from a building-level shelter`) },
  ];

  const files: { href: string; name: string; note: string }[] = [
    { href: PDF_URL, name: "gauge-to-shelter-preprint.pdf", note: t(`ฉบับเต็ม ${s.pages} หน้า สองคอลัมน์`, `Full paper, ${s.pages} pages, two columns`) },
    { href: `${BASE}/references-verified.bib`, name: "references-verified.bib", note: t("บรรณานุกรม พร้อมบันทึกว่าตรวจสอบแต่ละรายการอย่างไร", "Bibliography with how each entry was verified") },
    { href: `${BASE}/results.json`, name: "results.json", note: t("ตัวเลขทุกตัวในบทความ", "Every number in the paper") },
    { href: `${BASE}/run_analysis.py`, name: "run_analysis.py", note: t("สคริปต์ที่สร้างตัวเลขและภาพ", "The script that produces the numbers and figures") },
    { href: `${BASE}/paper.tex`, name: "paper.tex", note: t("ต้นฉบับ LaTeX", "LaTeX source") },
  ];

  return (
    <div className="mx-auto w-full max-w-[1500px] px-3 pb-10 sm:px-4">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 py-3">
        <div className="min-w-0 max-w-[78ch]">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--dim)]">
            {t("พรีพริ้นต์ ยังไม่ผ่านการพิจารณาโดยผู้ทรงคุณวุฒิ", "Preprint · not peer reviewed")} · v1.0 · 4 Nov 2026
          </p>
          <h1 lang="en" className="mt-1 text-[19px] font-bold leading-snug sm:text-[22px]">{TITLE}</h1>
          <p className="mt-1 text-[13px] text-[var(--dim)]">
            Non Arkaraprasertkul (depa) · Pun Thiengburanathum (RCAD)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className={BTN_PRIMARY} href={PDF_URL} download>{t("ดาวน์โหลด PDF", "Download PDF")}</a>
          <a className={BTN} href={`${BASE}/references-verified.bib`} download>BibTeX</a>
          <a className={BTN} href={`${BASE}/results.json`}>{t("ข้อมูล", "Data")}</a>
        </div>
      </header>

      {/* The PDF window. Desktop and tablet: the browser's own viewer. Phone: the pages as images. */}
      <section aria-label={t("บทความฉบับเต็ม", "The full paper")}>
        <div className="mb-1 hidden items-center gap-2 md:flex">
          <button type="button" aria-pressed={!asImages} onClick={() => setAsImages(false)} className={`min-h-9 border px-3 text-[12px] font-semibold ${!asImages ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]" : "border-[var(--line)]"}`}>{t("หน้าต่าง PDF", "PDF window")}</button>
          <button type="button" aria-pressed={asImages} onClick={() => setAsImages(true)} className={`min-h-9 border px-3 text-[12px] font-semibold ${asImages ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]" : "border-[var(--line)]"}`}>{t("ภาพทีละหน้า", "Page images")}</button>
        </div>
        <iframe
          title={TITLE}
          src={`${PDF_URL}#view=FitH&pagemode=none`}
          className={`${asImages ? "hidden" : "hidden md:block"} h-[calc(100dvh-10.5rem)] min-h-[560px] w-full border border-[var(--line)] bg-[var(--bg-surface)]`}
        />
        <ol className={`${asImages ? "flex" : "flex md:hidden"} mx-auto max-w-[900px] flex-col gap-3`}>
          {Array.from({ length: s.pages }, (_, i) => (
            <li key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${BASE}/pages/p${i + 1}.jpg`} alt={t(`หน้า ${i + 1} จาก ${s.pages} ของบทความ`, `Paper page ${i + 1} of ${s.pages}`)} loading={i < 2 ? "eager" : "lazy"} className="block w-full border border-[var(--line)] bg-white" />
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[12px] text-[var(--dim)]">
          {t("ถ้าหน้าต่างด้านบนไม่แสดง PDF ให้", "If the window above stays blank, ")}
          <a className="font-semibold text-[var(--cool)] underline" href={PDF_URL}>{t("เปิดไฟล์โดยตรง", "open the file directly")}</a>.
        </p>
      </section>

      <div className="mt-6 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section aria-labelledby="abs">
          <h2 id="abs" className="text-[16px] font-bold">{t("บทคัดย่อ", "Abstract")}</h2>
          <p lang={lang} className="mt-1 max-w-[68ch] text-[14px] leading-relaxed">{abstract}</p>
          {lang === "th" && <p className="mt-1 text-[12px] text-[var(--dim)]">สรุปภาษาไทย — ตัวบทความฉบับเต็มเป็นภาษาอังกฤษ</p>}
        </section>

        <section aria-labelledby="gaps">
          <h2 id="gaps" className="text-[16px] font-bold">{t("สี่ช่องว่าง สิ่งที่ข้อมูลแสดง", "Four gaps, what the data show")}</h2>
          <dl className="mt-1 divide-y divide-[var(--line)] border-y border-[var(--line)] text-[13px]">
            {rows.map((r) => (
              <div key={r.gap} className="grid grid-cols-[8.5rem_1fr] gap-3 py-2">
                <dt className="font-semibold">{r.gap}</dt>
                <dd>{r.finding}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="files">
          <h2 id="files" className="text-[16px] font-bold">{t("ไฟล์สำหรับตรวจและทำซ้ำ", "Files to check and repeat it")}</h2>
          <ul className="mt-1 divide-y divide-[var(--line)] border-y border-[var(--line)] text-[13px]">
            {files.map((f) => (
              <li key={f.href} className="flex flex-wrap items-baseline gap-x-3 py-2">
                <a className="min-h-6 font-mono font-semibold text-[var(--cool)] underline" href={f.href} download>{f.name}</a>
                <span className="text-[var(--dim)]">{f.note}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="cite">
          <h2 id="cite" className="text-[16px] font-bold">{t("วิธีอ้างอิง", "How to cite")}</h2>
          <p lang="en" className="mt-1 max-w-[68ch] text-[13px] leading-relaxed">
            Arkaraprasertkul, N., &amp; Thiengburanathum, P. (2026). {TITLE}. Preprint, 4 November 2026. https://cnx.nonarkara.org/cnx/research
          </p>
          <p className="mt-2 max-w-[68ch] text-[12px] leading-relaxed text-[var(--dim)]">
            {t(
              "ผลประโยชน์ทับซ้อน: ผู้เขียนคนแรกทำงานที่ depa ซึ่งขับเคลื่อนโครงการ Smart City Thailand และออกแบบระบบ CNX ผู้เขียนคนที่สองสังกัด รวพ. ผู้สนับสนุนกรณีศึกษา ความเห็นเป็นของผู้เขียน ไม่ใช่ของหน่วยงาน การวิเคราะห์โค้ดและการร่างบทความใช้ผู้ช่วย AI (Claude) ผู้เขียนรับผิดชอบเนื้อหา การระบุบทบาทผู้เขียนรอผู้เขียนยืนยันก่อนส่งตีพิมพ์",
              "Competing interests: the first author works at depa, which promotes the Smart City Thailand programme discussed, and designed the CNX system; the second author is affiliated with RCAD, which sponsors the case study. Views are the authors' own, not their organisations'. Analysis code and drafting were assisted by an AI model (Claude); the authors are responsible for the content. Author contributions are to be confirmed by the authors before submission.",
            )}
          </p>
        </section>
      </div>
    </div>
  );
}
