"use client";

// CNX Arrivals Panel — "how many overseas visitors are in the city
// today, yesterday, the day before?"
//
// Flight counts and origin countries come from real OpenSky arrival
// records at VTCC (Chiang Mai Intl). Visitor headcounts are an
// estimate (seats × assumed load factor) — see the methodology string
// returned by the API and lib/cnx/arrivals.ts's top comment. Every
// day this panel loads, the API route also appends a row to the
// arrivals archive (lib/cnx/arrivals-store.ts) for later year-end
// analysis.
//
// One language per mode. Country names are shown as OpenSky publishes
// them; the API's methodology string is English, so Thai mode renders
// the same statement written here from the same load-factor constant.

import { useEffect, useState } from "react";
import { PlaneLanding, Globe2, Info } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import { useLang } from "../../hooks/useLang";
import type { ArrivalsResponse, DayArrivals } from "../../lib/cnx/arrivals";

type T = (th: string, en: string | null | undefined) => string;

/** Thai rendering of the API's methodology. The load factor is read from
 *  the English string rather than imported, so the server-only arrivals
 *  module stays out of the client bundle. */
function methodologyTh(en: string): string {
  const pct = en.match(/(\d+)%/)?.[1];
  const factor = pct ? `อัตราบรรทุกสมมติ ${pct}%` : "อัตราบรรทุกสมมติ";
  return `เที่ยวบินระหว่างประเทศที่ลงสนามบินเชียงใหม่ (VTCC) จำนวนผู้โดยสารเป็นค่าประมาณจากจำนวนที่นั่ง × ${factor} — จำนวนเที่ยวบินและประเทศต้นทางเป็นข้อมูลจริงที่สังเกตได้ แต่จำนวนผู้โดยสารไม่ใช่`;
}

const bangkokDate = (stamp: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(stamp);

function dayLabel(date: string, now: number, t: T): string {
  return date === bangkokDate(now) ? t("วันนี้", "Today") : date === bangkokDate(now - 86_400_000) ? t("เมื่อวาน", "Yesterday") : t("ข้อมูลย้อนหลัง", "Historical");
}

function DayCard({ day, now, t }: { day: DayArrivals; now: number; t: T }) {
  return (
    <div className="border border-[var(--line)] bg-[var(--bg)] p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
          {dayLabel(day.date, now, t)}
        </span>
        <span className="font-mono text-[11px] text-[var(--dim)]">{day.date}</span>
      </div>
      <div className="font-mono text-[18px] font-bold tabular-nums text-[var(--ink)]">
        {day.estimatedVisitors.toLocaleString()}
      </div>
      <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--dim)]">
        {t("ผู้โดยสารขาเข้าระหว่างประเทศ (ประมาณ)", "est. international-arrival passengers")}
      </div>
      <div className="mt-1 font-mono text-[11px] text-[var(--dim)]">
        {t(
          `ขาเข้า: ระหว่างประเทศ ${day.internationalFlights} · ในประเทศ ${day.domesticFlights}`,
          `${day.internationalFlights} intl · ${day.domesticFlights} domestic arrivals`,
        )}
      </div>
    </div>
  );
}

export default function CnxArrivalsPanel() {
  const [data, setData] = useState<ArrivalsResponse | null>(null);
  const { t, lang } = useLang();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchJsonOrNull<ArrivalsResponse>("/api/cnx/arrivals");
      if (!cancelled) {
        setFailed(next === null);
        if (next) setData(next);
      }
    };
    void load();
    const i = window.setInterval(() => void load(), 15 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(i);
    };
  }, [retry]);

  if (!data) {
    return (
      <div className="flex flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)] p-3">
        {failed ? <><p role="status" className="text-sm">{t("อ่านข้อมูลเที่ยวบินขาเข้าไม่ได้", "Arrival data unavailable")}</p><button type="button" className="mt-2 min-h-11 border border-[var(--line)] px-3 text-sm" onClick={() => setRetry(value => value + 1)}>{t("ลองอีกครั้ง", "Retry")}</button></> : <div role="status" aria-label={t("กำลังโหลดข้อมูลขาเข้า", "Loading arrivals")} className="h-16 animate-pulse bg-[var(--line)]/30" />}
      </div>
    );
  }

  const today = data.days.find(day => day.date === bangkokDate(now));
  const topCountries = today?.byCountry.slice(0, 6) ?? [];
  const methodology = t(methodologyTh(data.methodology), data.methodology);

  return (
    <div className="flex flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)] p-3">
      <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
        <div className="flex items-center gap-1.5">
          <PlaneLanding className="h-3 w-3 text-[var(--cool)]" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
            {t("ผู้โดยสารขาเข้าระหว่างประเทศ — VTCC", "International-arrival passengers — VTCC")}
          </span>
        </div>
        <span title={methodology} className="text-[var(--dim)]">
          <Info className="h-3 w-3" />
        </span>
      </div>
      <p className="mt-2 text-[12px] text-[var(--dim)]">{t("สรุปข้อมูลเมื่อ", "Response compiled")} <time dateTime={data.generatedAt}>{new Date(data.generatedAt).toLocaleString(lang === "th" ? "th-TH" : "en-GB", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" })}</time> · {t("ประเทศคือสนามบินต้นทาง ไม่ใช่สัญชาติหรือจำนวนนักท่องเที่ยว", "Countries identify departure airports, not nationality or tourist counts")}</p>
      {failed && <div role="status" className="mt-2 border border-[var(--line)] p-2 text-sm">{t("อัปเดตไม่สำเร็จ แสดงข้อมูลเดิมตามวันที่ด้านล่าง", "Refresh failed; retained data is dated below")} <button type="button" onClick={() => setRetry(value => value + 1)} className="min-h-11 px-3 underline">{t("ลองอีกครั้ง", "Retry")}</button></div>}
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {data.days.map((d) => (
          <DayCard key={d.date} day={d} now={now} t={t} />
        ))}
      </div>
      {topCountries.length > 0 && (
        <div className="mt-2 border border-[var(--line)] bg-[var(--bg)] p-2">
          <div className="mb-1 flex items-center gap-1 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
            <Globe2 className="h-2.5 w-2.5" />
            {t("ประเทศต้นทางสูงสุดวันนี้", "Top countries today")}
          </div>
          <div className="space-y-0.5">
            {topCountries.map((c) => (
              <div key={c.country} className="flex items-center justify-between">
                <span className="truncate font-mono text-[11px] text-[var(--ink)]">{c.country}</span>
                <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">
                  {c.estimatedVisitors.toLocaleString()} · {t(`${c.flights} เที่ยว`, `${c.flights} fl.`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-2 border-t border-[var(--line)] pt-1.5 font-mono text-[11px] leading-relaxed text-[var(--dim)]">
        {methodology}
      </div>
    </div>
  );
}
