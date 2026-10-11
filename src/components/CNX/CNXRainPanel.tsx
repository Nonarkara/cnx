"use client";

import { useEffect, useState } from "react";
import { currentRainSummary, RAIN_BAND_TH, type RainBand } from "../../lib/cnx/rain-core";
import type { RainResponse } from "../../lib/cnx/rain";
import { useLang } from "../../hooks/useLang";

const TIME_OPTS: Intl.DateTimeFormatOptions = { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false };
const observedTime = { th: new Intl.DateTimeFormat("th-TH", TIME_OPTS), en: new Intl.DateTimeFormat("en-GB", TIME_OPTS) };

/** TMD 24-hour rainfall classes in English; the Thai names live in rain-core. */
const RAIN_BAND_EN: Record<RainBand, string> = {
  none: "no rain",
  light: "light rain",
  moderate: "moderate rain",
  heavy: "heavy rain",
  "very-heavy": "very heavy rain",
};

export default function CnxRainPanel({ rain }: { rain: RainResponse | null }) {
  const { lang, t } = useLang();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const summary = currentRainSummary(rain, now);
  const wettest = summary?.wettest;
  const band = (b: RainBand) => t(RAIN_BAND_TH[b], RAIN_BAND_EN[b]);
  return <section aria-label={t("หลักฐานฝนที่วัดได้", "Measured rainfall evidence")} className="border-b border-[var(--line)] bg-[var(--bg-raised)] px-3 py-3 text-[12px] leading-relaxed">
    <h2 className="font-semibold text-[var(--ink)]">{t("ฝนที่วัดได้ / 24 ชม.", "Measured rain / 24h")}</h2>
    {wettest ? <>
      <p className="mt-1 text-[var(--ink)]"><strong className="font-mono text-[18px]">{wettest.rain24h} mm</strong> · {band(wettest.band)} · {lang === "en" ? (wettest.amphoeEn || wettest.amphoeTh || "district not stated") : `อ.${wettest.amphoeTh || "ไม่ระบุ"}`}</p>
      <p className="text-[var(--dim)]">{wettest.station} · {wettest.agency} · {t("วัด", "measured")} <time dateTime={wettest.observedAt}>{observedTime[lang].format(Date.parse(wettest.observedAt))}</time></p>
      <p className="text-[var(--dim)]">{t(`${summary.stations.length} สถานีมีข้อมูลปัจจุบัน · ค่าสูงสุดที่จุดวัด ไม่ใช่ค่าเฉลี่ยอำเภอ`, `${summary.stations.length} stations reporting now · highest gauge reading, not a district average`)}</p>
      {!!summary.districts.length && <details className="mt-1"><summary className="flex min-h-11 cursor-pointer items-center text-[var(--cool)]">{t(`พื้นที่ฝนหนัก · ${summary.districts.length} อำเภอ`, `Heavy rain areas · ${summary.districts.length} ${summary.districts.length === 1 ? "district" : "districts"}`)} ▾</summary><ul>{summary.districts.map(d => <li key={d.th}>{t(d.th, d.en)} · {t("สูงสุด", "max")} {d.max} mm · {band(d.band)}</li>)}</ul></details>}
      <p className="mt-1 text-[var(--dim)]">{t("ระดับปิงปกติไม่ได้ยืนยันว่าลำห้วยหรือถนนปลอดภัย · ตรวจสอบประกาศน้ำป่า/ดินถล่มทางการ", "A normal Ping level does not mean streams or roads are safe · check official flash-flood and landslide warnings")}</p>
    </> : <p role="status" className={`mt-2 ${rain ? "text-[var(--sev-watch)]" : "text-[var(--dim)]"}`}>{rain ? t("ไม่มีข้อมูลฝนปัจจุบันที่ยืนยันได้ — ไม่ใช่ไม่มีฝน", "No confirmed current rain data — this is not the same as no rain") : t("กำลังอ่านข้อมูลฝน…", "Loading measured rainfall…")}</p>}
    <a className="mt-1 inline-flex min-h-11 items-center text-[var(--cool)] underline" href="https://www.thaiwater.net/" target="_blank" rel="noopener noreferrer">{t("ThaiWater · HII และหน่วยงานเจ้าของสถานี ↗", "ThaiWater · HII and station-owning agencies ↗")}</a>
  </section>;
}
