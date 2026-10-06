"use client";

import { useEffect, useState } from "react";
import { Flame, Plane, Waves, Wind } from "lucide-react";
import type { AirQualityResponse, CnxFiresResponse } from "../../types/cnx";
import type { DustboyResponse } from "../../lib/cnx/dustboy";
import type { RiverGauge } from "../../lib/cnx/river-level";
import type { CnxTwinResponse } from "../../lib/cnx/twin";
import type { FetchResult } from "../../lib/cnx/opensky";
import type { RainResponse } from "../../lib/cnx/rain";
import { buildExecutiveBrief } from "../../lib/cnx/executive-brief";

interface Props {
  air: AirQualityResponse | null;
  dustboy: DustboyResponse | null;
  fires: CnxFiresResponse | null;
  twin: CnxTwinResponse | null;
  riverGauges: RiverGauge[];
  flights: FetchResult | null;
  rain?: RainResponse | null;
  onOpenMetric: (id: "water" | "air" | "fire" | "mobility") => void;
}
const icons = { water: Waves, air: Wind, fire: Flame, mobility: Plane };
const time = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false });

export default function CnxOperationalPulse({ onOpenMetric, ...input }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const brief = buildExecutiveBrief({ ...input, now });
  return <section aria-label="Measured operational conditions" className="grid shrink-0 grid-cols-2 border-b border-[var(--line)] bg-[var(--bg-raised)] sm:grid-cols-4">
    {brief.metrics.map((metric) => {
      const Icon = icons[metric.id];
      const concern = ["watch", "alert", "critical"].includes(metric.level);
      const observed = metric.observedAt ? Date.parse(metric.observedAt) : NaN;
      const state = metric.state === "stale" ? "ข้อมูลเก่า" : metric.state === "unavailable" ? "ยังไม่มีข้อมูล" : metric.level === "critical" ? "วิกฤต" : metric.level === "alert" ? "ตรวจสอบเร่งด่วน" : metric.level === "watch" ? "เฝ้าระวัง" : metric.level === "unknown" ? "ยังประเมินไม่ได้" : "ติดตามต่อเนื่อง";
      return <button key={metric.id} type="button" onClick={() => onOpenMetric(metric.id)} title={`${metric.summaryTh} · ${metric.source}${Number.isFinite(observed) ? ` · ${time.format(observed)} น.` : ""}`} className="flex min-h-11 min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0 border-r border-[var(--line)] px-3 py-1.5 text-left transition-colors hover:bg-[var(--bg-surface)]">
        <Icon aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 self-center ${concern ? "text-[var(--sun)]" : "text-[var(--cool)]"}`} />
        <span lang="th" className="text-[12px] text-[var(--dim)]">{metric.titleTh}</span>
        <span className="font-mono text-[18px] leading-tight tabular-nums text-[var(--ink)]">{metric.value}</span><span className="text-[11px] text-[var(--dim)]">{metric.unit}</span>
        <span className={`text-[11px] ${concern ? "font-semibold text-[var(--danger)]" : "text-[var(--dim)]"}`}>{state}</span>
        <span className="sr-only">{metric.summaryTh} · {metric.source}{Number.isFinite(observed) && <> · <time dateTime={metric.observedAt!}>{time.format(observed)} น.</time></>}</span>
      </button>;
    })}
  </section>;
}
