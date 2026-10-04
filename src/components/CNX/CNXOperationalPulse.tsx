"use client";

import { useEffect, useState } from "react";
import { Flame, Plane, Waves, Wind } from "lucide-react";
import type { AirQualityResponse, CnxFiresResponse } from "../../types/cnx";
import type { DustboyResponse } from "../../lib/cnx/dustboy";
import type { RiverGauge } from "../../lib/cnx/river-level";
import type { CnxTwinResponse } from "../../lib/cnx/twin";
import type { FetchResult } from "../../lib/cnx/opensky";
import { buildExecutiveBrief } from "../../lib/cnx/executive-brief";

interface Props {
  air: AirQualityResponse | null;
  dustboy: DustboyResponse | null;
  fires: CnxFiresResponse | null;
  twin: CnxTwinResponse | null;
  riverGauges: RiverGauge[];
  flights: FetchResult | null;
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
      return <button key={metric.id} type="button" onClick={() => onOpenMetric(metric.id)} title={`${metric.summaryTh} · ${metric.source}`} className="min-h-[72px] min-w-0 border-r border-[var(--line)] px-4 py-2 text-left transition-colors hover:bg-[var(--bg-surface)] sm:px-6">
        <div className="flex items-center gap-2 text-[12px] text-[var(--dim)]"><Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${concern ? "text-[var(--sun)]" : "text-[var(--cool)]"}`} /><span lang="th">{metric.titleTh}</span>{metric.state !== "current" && <span className="ml-auto">{metric.state === "stale" ? "ข้อมูลเก่า" : "ยังไม่มีข้อมูล"}</span>}{concern && <span className="ml-auto text-[var(--ink)]">ติดตาม</span>}</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2"><span className="font-mono text-[22px] leading-tight tabular-nums text-[var(--ink)]">{metric.value}</span><span className="text-[12px] text-[var(--dim)]">{metric.unit}</span></div>
        <div className="mt-1 truncate text-[12px] text-[var(--dim)]">{metric.id === "water" ? metric.source : metric.id === "air" ? "สถานีภาคพื้นดิน" : metric.id === "fire" ? "NASA FIRMS · ไม่ใช่จำนวนไฟ" : "ADS-B · ในพื้นที่ติดตาม"}{Number.isFinite(observed) && <> · <time dateTime={metric.observedAt!}>{time.format(observed)} น.</time></>}</div>
      </button>;
    })}
  </section>;
}
