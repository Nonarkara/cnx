"use client";

// "Burning season" block for the Haze panel: Chiang Mai's last season vs
// the one before, from HII's Tamroypao open data (baked by
// scripts/build-cnx-burn-season.mjs). Tamroypao's own dashboard leads with
// a season-over-season comparison; this is the same idea for one province,
// with the double-counting caveat stated rather than hidden.

import { useEffect, useState } from "react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import { compareSeasons, type BurnSeasonDoc } from "../../lib/cnx/burn-season";
import { useLang } from "../../hooks/useLang";

const MONTHS: Record<"th" | "en", Record<string, string>> = {
  en: { "11": "Nov", "12": "Dec", "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr" },
  th: { "11": "พ.ย.", "12": "ธ.ค.", "01": "ม.ค.", "02": "ก.พ.", "03": "มี.ค.", "04": "เม.ย." },
};
/** The baked caveat is English; this is the same statement for Thai mode. */
const CAVEAT_TH = "พื้นที่เผาไหม้รายเดือนรวมทั้งฤดู: แปลงที่ถูกเผาในสองเดือนจะถูกนับทั้งสองครั้ง ยอดรวมทั้งฤดูจึงสูงกว่าพื้นที่จริงที่ไม่ซ้ำ จุดความร้อนเป็นจำนวนจาก MODIS ของ สสน. ส่วน PM2.5 เป็นค่าเฉลี่ยรายเดือนระดับจังหวัดของ สสน. และจำนวนวันที่เกินมาตรฐาน 24 ชม. ของไทย";
const fmt = (n: number) => n.toLocaleString("en-US");
const signed = (p: number | null) => (p === null ? "—" : `${p > 0 ? "+" : ""}${p}%`);

export default function CnxBurnSeason() {
  const { lang, t } = useLang();
  const [doc, setDoc] = useState<BurnSeasonDoc | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetchJsonOrNull<BurnSeasonDoc>("/data/cnx/burn-season.json", { signal: controller.signal }).then((d) => d && setDoc(d));
    return () => controller.abort();
  }, []);
  if (!doc || doc.seasons.length < 2) return null;
  const [latest, prior] = doc.seasons;
  const c = compareSeasons(latest, prior);
  const maxForest = Math.max(...latest.months.map((m) => m.forestRai ?? 0), ...prior.months.map((m) => m.forestRai ?? 0), 1);
  const farm = (m: (typeof latest.months)[number]) => (m.farmRai ? Object.values(m.farmRai).reduce((a, b) => a + b, 0) : 0);
  const maxFarm = Math.max(...latest.months.map(farm), ...prior.months.map(farm), 1);
  const month = (k: string) => MONTHS[lang][k] ?? k;

  return (
    <section className="mt-6">
      <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
        {t(`ฤดูเผา ${latest.labelBE} เทียบ ${prior.labelBE} · เชียงใหม่`, `Burning season ${latest.labelBE} vs ${prior.labelBE} · Chiang Mai`)}
      </h3>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { label: t("พื้นที่เผาไหม้รวม", "Total burned"), now: latest.totals.totalRai, pct: c.totalPct },
          { label: t("ป่าที่ถูกเผา", "Forest burned"), now: latest.totals.forestRai, pct: c.forestPct },
          { label: t("พื้นที่เกษตรที่ถูกเผา", "Farmland burned"), now: latest.totals.farmRai, pct: c.farmPct },
        ].map((s) => (
          <div key={s.label} className="border border-[var(--line)] bg-[var(--bg-surface)] p-3">
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--dim)]">{s.label}</div>
            <div className="mt-1 text-[20px] font-bold tabular-nums text-[var(--ink)]">{fmt(s.now)}</div>
            <div className="text-[11px] text-[var(--dim)]">{t(`ไร่ · ${signed(s.pct)} เทียบ ${prior.labelBE}`, `rai · ${signed(s.pct)} vs ${prior.labelBE}`)}</div>
          </div>
        ))}
        <div className="border border-[var(--line)] bg-[var(--bg-surface)] p-3">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--dim)]">{t("วันที่ PM2.5 เกินมาตรฐาน", "Days PM2.5 over standard")}</div>
          <div className="mt-1 text-[20px] font-bold tabular-nums text-[var(--ink)]">{c.pm25DaysOver.latest}</div>
          <div className="text-[11px] text-[var(--dim)]">
            {t(`เทียบ ${c.pm25DaysOver.prior} วันใน ${prior.labelBE} (เฉพาะ ${c.pm25DaysOver.months.map(month).join("–")})`, `vs ${c.pm25DaysOver.prior} in ${prior.labelBE} (${c.pm25DaysOver.months.map(month).join("–")} only)`)}
          </div>
        </div>
      </div>

      <table className="mt-3 w-full border-collapse text-[11px] tabular-nums">
        <thead>
          <tr className="text-left font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dim)]">
            <th className="py-1 pr-2 font-normal">{t("เดือน", "Month")}</th>
            <th className="py-1 pr-2 font-normal">{t("ป่าที่ถูกเผา (ไร่)", "Forest burned (rai)")} · {latest.labelBE} / {prior.labelBE}</th>
            <th className="py-1 pr-2 font-normal">{t("พื้นที่เกษตร (ไร่)", "Farmland (rai)")}</th>
            <th className="py-1 pr-2 text-right font-normal">{t("จุดความร้อน", "Hotspots")}</th>
            <th className="py-1 text-right font-normal">{t("PM2.5 เฉลี่ย · วันที่เกิน", "PM2.5 avg · days over")}</th>
          </tr>
        </thead>
        <tbody>
          {latest.months.map((m, i) => {
            const p = prior.months[i];
            return (
              <tr key={m.month} className="border-t border-[var(--line)]">
                <td className="py-1 pr-2 font-mono">{month(m.month.slice(4))}</td>
                <td className="py-1 pr-2">
                  <div className="h-1.5 bg-[var(--cool)]" style={{ width: `${((m.forestRai ?? 0) / maxForest) * 100}%` }} title={`${fmt(m.forestRai ?? 0)} ${t("ไร่", "rai")}`} />
                  <div className="mt-0.5 h-1 bg-[var(--line)]" style={{ width: `${((p?.forestRai ?? 0) / maxForest) * 100}%` }} title={`${prior.labelBE}: ${fmt(p?.forestRai ?? 0)} ${t("ไร่", "rai")}`} />
                  <span className="text-[var(--dim)]">{fmt(m.forestRai ?? 0)} / {fmt(p?.forestRai ?? 0)}</span>
                </td>
                <td className="py-1 pr-2">
                  <div className="h-1.5 bg-[var(--cool)]" style={{ width: `${(farm(m) / maxFarm) * 100}%` }} />
                  <span className="text-[var(--dim)]">{fmt(farm(m))} / {fmt(p ? farm(p) : 0)}</span>
                </td>
                <td className="py-1 pr-2 text-right">{m.hotspots ?? "—"} / {p?.hotspots ?? "—"}</td>
                <td className="py-1 text-right">
                  {m.pm25Avg ?? "—"} · {m.pm25DaysOver ?? "—"}{t(" วัน", "d")} / {p?.pm25Avg ?? "—"} · {p?.pm25DaysOver ?? "—"}{t(" วัน", "d")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--dim)]">{t(`อำเภอที่ถูกเผามากที่สุด ${latest.labelBE}`, `Most burned districts, ${latest.labelBE}`)}</div>
      <ol className="mt-1 grid gap-x-4 gap-y-0.5 text-[11px] sm:grid-cols-2">
        {doc.districtsLatest.slice(0, 8).map((d, i) => (
          <li key={d.code} className="flex justify-between gap-2 tabular-nums">
            <span>
              {i + 1}. {t(d.th, d.en)}
            </span>
            <span className="text-[var(--dim)]">
              {fmt(d.totalRai)} {t("ไร่ · ป่า", "rai · forest")} {Math.round((d.forestRai / Math.max(d.totalRai, 1)) * 100)}%
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--dim)]">
        {t(CAVEAT_TH, doc.caveat)}{" "}
        {t(`การเทียบจุดความร้อนใช้เฉพาะเดือนที่ทั้งสองฤดูมีข้อมูล (${c.hotspots.months.map(month).join(", ")}: ${fmt(c.hotspots.latest)} เทียบ ${fmt(c.hotspots.prior)})`, `Hotspot comparisons cover only months both seasons report (${c.hotspots.months.map(month).join(", ")}: ${fmt(c.hotspots.latest)} vs ${fmt(c.hotspots.prior)}).`)}{" "}
        {t("แหล่งข้อมูล", "Source")}:{" "}
        <a href="https://tamroypao.hii.or.th/" target="_blank" rel="noopener noreferrer" className="text-[var(--cool)] hover:underline">
          {doc.source}
        </a>
        .
      </p>
    </section>
  );
}
