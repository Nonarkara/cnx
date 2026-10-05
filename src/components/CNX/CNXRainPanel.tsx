"use client";

import { useEffect, useState } from "react";
import { currentRainSummary, RAIN_BAND_TH } from "../../lib/cnx/rain-core";
import type { RainResponse } from "../../lib/cnx/rain";

const observedTime = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export default function CnxRainPanel({ rain }: { rain: RainResponse | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const summary = currentRainSummary(rain, now);
  const wettest = summary?.wettest;
  return <section aria-label="Measured rainfall evidence" className="border-b border-[var(--line)] bg-[var(--bg-raised)] px-3 py-3 text-[12px] leading-relaxed">
    <h2 className="font-semibold text-[var(--ink)]">ฝนที่วัดได้ · Measured rain / 24h</h2>
    {wettest ? <>
      <p className="mt-1 text-[var(--ink)]"><strong className="font-mono text-[18px]">{wettest.rain24h} mm</strong> · {RAIN_BAND_TH[wettest.band]} · อ.{wettest.amphoeTh || "ไม่ระบุ"}</p>
      <p className="text-[var(--dim)]">{wettest.station} · {wettest.agency} · วัด <time dateTime={wettest.observedAt}>{observedTime.format(Date.parse(wettest.observedAt))}</time></p>
      <p className="text-[var(--dim)]">{summary.stations.length} สถานีมีข้อมูลปัจจุบัน · ค่าสูงสุดที่จุดวัด ไม่ใช่ค่าเฉลี่ยอำเภอ</p>
      {!!summary.districts.length && <details className="mt-1"><summary className="flex min-h-11 cursor-pointer items-center text-[var(--sun)]">พื้นที่ฝนหนัก · {summary.districts.length} อำเภอ ▾</summary><ul>{summary.districts.map(d => <li key={d.th}>{d.th} · สูงสุด {d.max} mm · {RAIN_BAND_TH[d.band]}</li>)}</ul></details>}
      <p className="mt-1 text-[var(--dim)]">ระดับปิงปกติไม่ได้ยืนยันว่าลำห้วยหรือถนนปลอดภัย · ตรวจสอบประกาศน้ำป่า/ดินถล่มทางการ</p>
    </> : <p role="status" className="mt-2 text-[var(--sun)]">{rain ? "ไม่มีข้อมูลฝนปัจจุบันที่ยืนยันได้ — ไม่ใช่ไม่มีฝน" : "กำลังอ่านข้อมูลฝน · Loading measured rainfall…"}</p>}
    <a className="mt-1 inline-flex min-h-11 items-center text-[var(--cool)] underline" href="https://www.thaiwater.net/" target="_blank" rel="noopener noreferrer">ThaiWater · HII และหน่วยงานเจ้าของสถานี ↗</a>
  </section>;
}
