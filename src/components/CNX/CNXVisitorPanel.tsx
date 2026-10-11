"use client";

// CNX visitor panel — daily in/out + origin-country breakdown +
// recommended-language fan-out for the social rail.
//
// The numbers come from `/api/cnx/visitors` which combines:
//   - Live OpenSky flight state vectors
//   - Persisted snapshot store (24 h hourly buckets)
//   - A curated airline / fleet registry (see src/lib/cnx/visitors.ts)
//
// Honest-data rules:
//   - "Visitors today" is an ESTIMATE based on the airline's typical
//     fleet size (regional 78 / narrow 165 / wide 305 / heavy 410
//     seats per flight). The number is shipped with a `methodology`
//     string so the wall doesn't present it as ground truth.
//   - When OpenSky is empty or rate-limited, the panel falls back to
//     the persisted snapshots, then to a clear "no live data" pill.
//   - The DEMO / scenario badge fires when the inbound set is small
//     and the methodology note is wider than the active flights.
//
// One language per mode. Country and airline names are shown as the
// registry publishes them. The API's methodology and history-reason
// strings are English; Thai mode renders equivalents written here.

import { useEffect, useMemo, useState } from "react";
import { Plane, Users, Globe, AlertTriangle } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import { useLang } from "../../hooks/useLang";
import type { VisitorAnalytics as BaseVisitorAnalytics } from "../../lib/cnx/visitors";

// The API route spreads `...analytics` plus `socialCountries` and the
// day-archive `history` block it derives itself — not part of
// summariseVisitors()' own return shape, so they're added here rather than
// in lib/cnx/visitors.ts.
import type { VisitorHistoryState } from "../../lib/cnx/visitors-kv";

export type VisitorAnalytics = BaseVisitorAnalytics & {
  socialCountries?: string[];
  /** What the stored day archive actually covers, and where it lives. */
  history?: VisitorHistoryState & { stored: "file" | "kv" | "memory" | "none" };
};

type T = (th: string, en: string | null | undefined) => string;

const LANG_LABELS: Record<string, string> = {
  en: "EN",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  th: "TH",
  de: "DE",
  fr: "FR",
  ru: "RU",
};

const METHODOLOGY_TH =
  "ที่นั่งประมาณจากขนาดฝูงบินปกติของสายการบิน (เครื่องเล็ก 78 / ลำตัวแคบ 165 / ลำตัวกว้าง 305 / ขนาดใหญ่ 410 ที่นั่ง) " +
  "ขาเข้า = ทิศทางบินเบี่ยงไม่เกิน 60° จากสนามบินเชียงใหม่ อาจรวมเครื่องที่บินผ่าน และไม่ยืนยันว่าลงจอด " +
  "ประเทศหมายถึงประเทศที่จดทะเบียนสายการบินหรือเครื่องบิน ไม่ใช่สนามบินต้นทางหรือสัญชาติผู้โดยสาร " +
  "ยอดรวมคือจำนวนที่นั่งโดยประมาณในภาพนี้ ไม่ใช่จำนวนนักท่องเที่ยวหรือยอดผู้มาถึงรายวันที่ตัดซ้ำแล้ว ช่วงรายชั่วโมงใช้เวลากรุงเทพฯ";

const HISTORY_GAP_MIN = 15;

function historyReasonTh(history: VisitorHistoryState): string {
  if (history.provenance === "unavailable") {
    return "ยังไม่มีข้อมูลที่บันทึกไว้ของวันนี้ จึงแสดงรายชื่อประเทศสะสมทั้งวันไม่ได้";
  }
  const gapMin = Math.round(history.largestGapMs / 60_000);
  const gap = gapMin > HISTORY_GAP_MIN ? ` (ช่วงขาดหายนานสุด ${gapMin} นาที)` : "";
  return `ข้อมูลประเทศสะสมของวันนี้ไม่ครบ${gap} ประเทศและจำนวนที่นั่งด้านล่างจึงเป็นค่าต่ำสุด`;
}

function PanelHeading({ t }: { t: T }) {
  return (
    <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ink)]">
      {t("ที่นั่งโดยประมาณ", "Seat capacity")}
    </h2>
  );
}

export default function CNXVisitorPanel({
  onData,
}: {
  /** Reports the fetched payload up to the parent — feeds
   *  CnxSocialSidebar's multilingual fan-out (socialCountries) and the
   *  top bar's visitor-timezone strip (topOrigins). Lets the parent
   *  skip an independent poll of the same endpoint — /api/cnx/visitors
   *  also appends a row to the visitor-snapshot archive on every call,
   *  so polling it twice from the same tab doubled the archive's
   *  write rate for no benefit. */
  onData?: (data: VisitorAnalytics) => void;
}) {
  const [data, setData] = useState<VisitorAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLang();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await fetchJsonOrNull<VisitorAnalytics>("/api/cnx/visitors");
        if (!cancelled) {
          setData(next);
          setError(null);
          if (next) onData?.(next);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [onData]);

  const peakHour = useMemo(() => {
    if (!data) return null;
    let max = { hour: 0, visitors: 0 };
    for (const h of data.visitorsByHour) {
      if (h.visitors > max.visitors) max = h;
    }
    return max;
  }, [data]);

  const sectionLabel = t("ข้อมูลผู้มาเยือน", "Visitor analytics");

  if (error && !data) {
    return (
      <section aria-label={sectionLabel} className="border border-[var(--line)] bg-[var(--bg-raised)]">
        <header className="flex items-center gap-1.5 border-b border-[var(--line)] px-3 py-1.5">
          <Plane className="h-3.5 w-3.5 text-[var(--cool)]" />
          <PanelHeading t={t} />
        </header>
        <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-[var(--dim)]">
          <AlertTriangle className="h-3.5 w-3.5 text-[var(--danger)]" />
          {t("โหลดข้อมูลที่นั่งไม่สำเร็จ", error)}
        </div>
      </section>
    );
  }

  const visitors = data?.visitorsToday ?? 0;
  const history = data?.history;
  const flights = data?.inboundFlights ?? 0;
  const groundOps = data?.groundOps ?? 0;
  const topOrigins = data?.topOrigins ?? [];
  const langs = data?.recommendedLanguages ?? [];
  const airlineMix = data?.airlineMix ?? [];
  const isEstimate = data?.methodology?.includes("Seats estimated");
  const methodology = data?.methodology ? t(METHODOLOGY_TH, data.methodology) : "";

  return (
    <section
      aria-label={sectionLabel}
      className="flex h-full flex-col overflow-hidden border border-[var(--line)] bg-[var(--bg-raised)]"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--bg-raised)] px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <Plane className="h-3.5 w-3.5 text-[var(--cool)]" />
          <PanelHeading t={t} />
        </div>
        {isEstimate && (
          <span
            title={methodology}
            className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--sev-watch)]"
          >
            {t("ประมาณการ · ที่นั่ง × เที่ยวบิน", "EST · seats × flights")}
          </span>
        )}
      </header>

      <div className="grid shrink-0 grid-cols-3 border-b border-[var(--line)] bg-[var(--bg)]">
        <Stat
          icon={<Users className="h-3 w-3 text-[var(--cool)]" />}
          label={t("ที่นั่งในภาพ", "Seats in view")}
          value={visitors.toLocaleString()}
          sub={isEstimate ? t("ค่าประมาณ", "estimate") : undefined}
        />
        <Stat
          icon={<Plane className="h-3 w-3 text-[var(--cool)]" />}
          label={t("มุ่งหน้าสนามบิน", "Toward airport")}
          value={flights.toLocaleString()}
        />
        <Stat
          icon={<Plane className="h-3 w-3 text-[var(--dim)]" />}
          label={t("อยู่ภาคพื้น", "Ground ops")}
          value={groundOps.toLocaleString()}
        />
      </div>

      <div className="shrink-0 border-b border-[var(--line)] px-3 py-2">
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">
          {t("ประเทศของสายการบิน / ทะเบียนเครื่อง", "Carrier / registration countries")}
        </div>
        {/* Prefer the day-scoped list. The instant list is empty overnight
            — honest, but it does not answer "where are people flying in
            from", which is a question about the day. */}
        {(() => {
          const dayList = data?.topOriginsToday ?? [];
          const useDay = dayList.length > 0;
          const list = useDay ? dayList : topOrigins;
          if (list.length === 0) {
            return (
              <p className="mt-1 font-mono text-[11px] text-[var(--dim)]">
                {t("วันนี้ยังไม่มีเครื่องบินมุ่งหน้าสนามบิน", "No aircraft heading toward the airport so far today.")}
              </p>
            );
          }
          return (
            <>
              <p className="mt-0.5 font-mono text-[11px] leading-[1.5] text-[var(--dim)]">
                {useDay
                  ? t(
                      "ตั้งแต่เช้าวันนี้ — ประเทศที่จดทะเบียน ไม่ใช่สัญชาติผู้โดยสาร ใช้ค่าสูงสุดจากรอบเดียวของแต่ละประเทศ ไม่ใช่จำนวนเที่ยวบินที่ไม่ซ้ำ",
                      "Today so far — registration country, not passenger nationality. Largest single poll per country, not a distinct-flight count.",
                    )
                  : t(
                      "ในภาพนี้ — ประเทศที่จดทะเบียน ไม่ใช่สัญชาติผู้โดยสาร",
                      "In this snapshot — registration country, not passenger nationality.",
                    )}
              </p>
              {history && history.provenance !== "complete" ? (
                <p className="mt-1 flex items-start gap-1 border-l-2 border-[var(--sev-watch)] pl-1.5 font-mono text-[11px] leading-[1.5] text-[var(--sev-watch)]">
                  <AlertTriangle className="mt-px h-2.5 w-2.5 shrink-0" aria-hidden />
                  <span>
                    {t(
                      historyReasonTh(history),
                      history.reason ?? "Day-to-date origins are unavailable — these are one snapshot, not the day.",
                    )}
                    {history.stored === "memory"
                      ? t(
                          " เก็บไว้ในหน่วยความจำของเวิร์กเกอร์เดียว จำนวนอาจลดลงหรือบางประเทศอาจหายไป",
                          " Stored in one worker's memory only, so it may shrink or drop countries.",
                        )
                      : ""}
                  </span>
                </p>
              ) : null}
              <ul className="mt-1 space-y-1">
                {list.slice(0, 5).map((o) => (
                  <li key={o.country} className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="truncate font-medium text-[var(--ink)]">{o.country}</span>
                    <span className="font-mono tabular-nums text-[var(--dim)]">
                      {o.visitors.toLocaleString()} · {o.flights}×{" "}
                      {o.airlines.slice(0, 2).join(" / ") || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          );
        })()}
      </div>

      <div className="shrink-0 border-b border-[var(--line)] px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">
            {t("ภาษาที่ใช้ฟังเสียงโซเชียล", "Social-listening languages")}
          </div>
          <Globe className="h-3 w-3 text-[var(--dim)]" />
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {langs.length === 0 ? (
            <span className="font-mono text-[11px] text-[var(--dim)]">{t("อังกฤษ (ค่าเริ่มต้น)", "EN (default)")}</span>
          ) : (
            langs.map((l) => (
              <span
                key={l}
                className="border border-[var(--cool)] bg-[var(--cool-dim)] px-1.5 py-px font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--cool)]"
              >
                {LANG_LABELS[l] ?? l.toUpperCase()}
              </span>
            ))
          )}
        </div>
        {data?.socialCountries && data.socialCountries.length > 0 && (
          <p className="mt-1 font-mono text-[11px] text-[var(--dim)]">
            → {data.socialCountries.join(", ")}
          </p>
        )}
      </div>

      <div className="shrink-0 px-3 py-2">
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">
          {t("แนวโน้มรายชั่วโมง 24 ชม.", "24-h hourly trend")}
        </div>
        <div className="mt-1 flex h-12 items-end gap-px">
          {data?.visitorsByHour.map((h) => {
            const max = peakHour?.visitors ?? 0;
            const pct = max > 0 ? Math.max(2, Math.round((h.visitors / max) * 100)) : 2;
            const isCurrent = h.hour === new Date(data.generatedAt).getHours();
            return (
              <div
                key={h.hour}
                title={t(
                  `${h.hour}:00 น. — ${h.visitors} ที่นั่ง, ขาเข้า ${h.inbound}, ขาออก ${h.outgoing}`,
                  `${h.hour}:00 — ${h.visitors} visitors, ${h.inbound} inbound, ${h.outgoing} outgoing`,
                )}
                className="flex-1"
              >
                <div
                  className={`mx-px ${isCurrent ? "bg-[var(--ink)]" : "bg-[var(--cool)]"}`}
                  style={{ height: `${pct}%` }}
                  data-current={isCurrent ? "true" : undefined}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[11px] text-[var(--dim)]">
          <span>{t("0 น.", "0h")}</span>
          <span>{t("12 น.", "12h")}</span>
          <span>{t("23 น.", "23h")}</span>
        </div>
      </div>

      {airlineMix.length > 0 && (
        <div className="shrink-0 border-t border-[var(--line)] bg-[var(--bg)] px-3 py-1.5">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">
            {t("สัดส่วนสายการบิน", "Carrier mix")}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {airlineMix.slice(0, 6).map((a) => (
              <span
                key={a.airline}
                title={t(
                  `${a.airline} (${a.country}): ${a.flights} เที่ยวบิน, ประมาณ ${a.visitors} ที่นั่ง`,
                  `${a.airline} (${a.country}): ${a.flights} flights, ${a.visitors} est. visitors`,
                )}
                className="border border-[var(--line)] px-1 py-px font-mono text-[11px] text-[var(--ink)]"
              >
                {a.airline.split(" ")[0]} · {a.flights}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border-r border-[var(--line)] px-2 py-1.5 last:border-r-0">
      <div className="flex items-center gap-1">
        {icon}
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dim)]">
          {label}
        </span>
      </div>
      <div className="mt-0.5 font-mono text-[16px] font-bold tabular-nums leading-none text-[var(--ink)]">
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--dim)]">
          {sub}
        </div>
      )}
    </div>
  );
}
