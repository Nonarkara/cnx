"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Flame, Plane, Waves, Wind } from "lucide-react";
import type { AirQualityResponse, CnxFiresResponse } from "../../types/cnx";
import type { DustboyResponse } from "../../lib/cnx/dustboy";
import type { RiverGauge } from "../../lib/cnx/river-level";
import type { CnxTwinResponse } from "../../lib/cnx/twin";
import type { FetchResult } from "../../lib/cnx/opensky";
import type { RainResponse } from "../../lib/cnx/rain";
import { buildExecutiveBrief } from "../../lib/cnx/executive-brief";
import { useLang } from "../../hooks/useLang";
import type { Lang } from "../../lib/i18n";
import { metricUnit } from "./CNXMetricEvidence";

interface Props {
  air: AirQualityResponse | null;
  dustboy: DustboyResponse | null;
  fires: CnxFiresResponse | null;
  twin: CnxTwinResponse | null;
  riverGauges: RiverGauge[];
  flights: FetchResult | null;
  rain?: RainResponse | null;
  onOpenMetric: (id: "water" | "air" | "fire" | "mobility") => void;
  children?: ReactNode;
}
const icons = { water: Waves, air: Wind, fire: Flame, mobility: Plane };
/** Each concern level keeps its own signal colour; the word beside it carries the meaning. */
const LEVEL_TEXT: Record<string, string> = { watch: "text-[var(--sev-watch)]", alert: "text-[var(--sev-alert)]", critical: "text-[var(--sev-critical)]" };
const TIME: Record<Lang, Intl.DateTimeFormat> = {
  th: new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }),
  en: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }),
};

export default function CnxOperationalPulse({ onOpenMetric, children, ...input }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const { lang, t } = useLang();
  const brief = buildExecutiveBrief({ ...input, now });
  return <section lang={lang} aria-label={t("สภาพที่วัดได้ในพื้นที่", "Measured operational conditions")} className="relative z-40 grid shrink-0 grid-cols-2 border-b border-[var(--line)] bg-[var(--bg-raised)] md:flex md:flex-wrap md:items-center md:gap-x-3 md:px-3">
    {brief.metrics.map((metric) => {
      const Icon = icons[metric.id];
      const concern = ["watch", "alert", "critical"].includes(metric.level);
      const observed = metric.observedAt ? Date.parse(metric.observedAt) : NaN;
      const state = metric.state === "stale" ? t("ข้อมูลเก่า", "Stale data") : metric.state === "unavailable" ? t("ยังไม่มีข้อมูล", "No data yet") : metric.level === "critical" ? t("วิกฤต", "Critical") : metric.level === "alert" ? t("ตรวจสอบเร่งด่วน", "Check urgently") : metric.level === "watch" ? t("เฝ้าระวัง", "Watch") : metric.level === "unknown" ? t("ยังประเมินไม่ได้", "Cannot assess yet") : t("ติดตามต่อเนื่อง", "Keep monitoring");
      const summary = t(metric.summaryTh, metric.summaryEn);
      const at = Number.isFinite(observed) ? `${TIME[lang].format(observed)}${lang === "th" ? " น." : ""}` : null;
      return <button key={metric.id} type="button" onClick={() => onOpenMetric(metric.id)} title={`${summary} · ${metric.source}${at ? ` · ${at}` : ""}`} className="flex min-h-11 min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0 px-3 py-1 text-left transition-colors hover:bg-[var(--bg-surface)] md:px-0">
        <Icon aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 self-center ${concern ? LEVEL_TEXT[metric.level] : "text-[var(--cool)]"}`} />
        <span className="text-[12px] text-[var(--dim)]">{t(metric.titleTh, metric.titleEn)}</span>
        <span className="font-mono text-[18px] leading-tight tabular-nums text-[var(--ink)]">{metric.value}</span><span className="text-[11px] text-[var(--dim)]">{metricUnit(metric.unit, lang)}</span>
        <span className={metric.state === "current" && metric.level === "good" ? "sr-only" : `text-[11px] ${concern ? `font-semibold ${LEVEL_TEXT[metric.level]}` : "text-[var(--dim)]"}`}>{state}</span>
        <span className="sr-only">{summary} · {metric.source}{at && <> · <time dateTime={metric.observedAt!}>{at}</time></>}</span>
      </button>;
    })}
    {children}
  </section>;
}
