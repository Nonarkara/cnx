"use client";

// CNX ticker — bottom strip. Mirrors Lopburi's ticker: a marquee
// line that walks the operator through every live feed, the keystone
// numbers, and the office notices. One-shot, no refresh; the parent
// re-renders it whenever any feed updates.

import { useMemo } from "react";
import { Activity } from "lucide-react";
import type {
  CnxFloodResponse,
  AirQualityResponse,
  CnxFiresResponse,
  CctvFeedResponse,
  CnxStoryResponse,
  SocialListeningResponse,
} from "../../types/cnx";
import type { FetchResult } from "../../lib/cnx/opensky";
import { useLang } from "../../hooks/useLang";

interface TickerProps {
  flood: CnxFloodResponse | null;
  air: AirQualityResponse | null;
  fires: CnxFiresResponse | null;
  cctv: CctvFeedResponse | null;
  social: SocialListeningResponse | null;
  story: CnxStoryResponse | null;
  flights: FetchResult | null;
}

export default function CnxTicker({
  flood, air, fires, cctv, social, story, flights,
}: TickerProps) {
  const { lang, t } = useLang();
  const segments = useMemo(() => {
    const out: { key: string; icon: string; label: string; value: string; level?: string }[] = [];
    if (air?.provinceAvgPm25 != null) {
      out.push({
        key: "pm25",
        icon: "🌫",
        label: "PM2.5",
        value: `${air.provinceAvgPm25} µg/m³`,
        level: air.provinceAvgAqiLevel,
      });
    }
    // Same rule as the FIRMS segment below: a scenario fill is not a
    // reading, and a ticker is read at a glance by someone deciding
    // whether to worry. "46% bank-full" with a 🌊 is a river level we
    // did not measure. Naming the absence costs one word.
    if (flood && flood.provenance === "live" && typeof flood.pingCapacityFraction === "number") {
      out.push({
        key: "ping",
        icon: "🌊",
        label: t("แม่น้ำปิง", "Ping"),
        value: t(`${(flood.pingCapacityFraction * 100).toFixed(0)}% ของระดับตลิ่ง`, `${(flood.pingCapacityFraction * 100).toFixed(0)}% bank-full`),
        level: flood.pingCapacityFraction > 0.85 ? "critical" : flood.pingCapacityFraction > 0.7 ? "alert" : undefined,
      });
    }
    if (fires) {
      const count = fires.provinceCount ?? fires.totalCount;
      const outside = fires.provinceCount != null && fires.totalCount > count ? fires.totalCount - count : 0;
      out.push({
        key: "fires",
        icon: "🔥",
        label: fires.provinceCount != null ? t("FIRMS · เชียงใหม่", "FIRMS · Chiang Mai") : t("FIRMS · พื้นที่ติดตาม", "FIRMS · watch area"),
        // The provincial count leads; detections outside the province are
        // named as such, never folded into a bare hotspot total.
        value: fires.provenance === "live"
          ? t(`${count} จุด / 24 ชม.${outside ? ` · นอกจังหวัด ${outside}` : ""}`, `${count} in province / 24 h${outside ? ` · ${outside} outside the province` : ""}`)
          : t("ไม่มีข้อมูลดาวเทียมปัจจุบัน", "No current satellite pass"),
        level: fires.provenance === "live" && count > 30 ? "alert" : undefined,
      });
    }
    if (cctv) {
      out.push({
        key: "cctv",
        icon: "📹",
        label: "CCTV",
        value: t(`${cctv.reachableCount}/${cctv.totalCount} ตอบสนอง`, `${cctv.reachableCount}/${cctv.totalCount} reachable`),
      });
    }
    if (flights) {
      const total = flights.airborne.length + flights.ground.length;
      // Same rule as the FIRMS segment above: the number shown is the number
      // we can draw, and anything the plausibility screen withheld is named
      // rather than quietly missing. A total that silently shrinks reads as
      // "the sky cleared", which is the one thing this board must not imply.
      const withheld = (flights.quality?.rejected ?? 0) + (flights.quality?.nulled ?? 0);
      out.push({
        key: "flights",
        icon: "✈",
        label: t("น่านฟ้า", "Airspace"),
        value: withheld
          ? t(`${total} ลำ · ไม่ผ่านเกณฑ์ ${withheld}`, `${total} aircraft · ${withheld} withheld`)
          : t(`${total} ลำ`, `${total} aircraft`),
      });
    }
    if (social) {
      out.push({
        key: "social",
        icon: "📰",
        label: t("ข่าว", "News"),
        value: t(`${social.items.length} รายการ`, `${social.items.length} mentions`),
      });
    }
    if (story?.headline) {
      out.push({
        key: "story",
        icon: "📌",
        label: t("เรื่องเด่น", "Story"),
        value: story.headline,
      });
    }
    return out;
  }, [air, flood, fires, cctv, social, flights, story, t]);

  if (segments.length === 0) return null;

  return (
    <div lang={lang} className="flex min-h-[36px] shrink-0 items-stretch overflow-hidden border-t border-[var(--line)] bg-[var(--bg)] font-mono text-[11px]">
      <div className="flex shrink-0 items-center gap-1.5 border-r border-[var(--line)] bg-[var(--cool)] px-3 text-white">
        <Activity aria-hidden="true" className="h-3 w-3" />
        <span className="text-[11px] font-bold uppercase tracking-[0.16em]">{t("CNX ปฏิบัติการ", "CNX OPS")}</span>
      </div>
      <div role="region" aria-label={t("สรุปข้อมูลปฏิบัติการ เลื่อนแนวนอนเพื่ออ่านทุกรายการ", "Operational feed summary; scroll horizontally to read all items")} tabIndex={0} className="relative flex min-w-0 flex-1 items-center overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--cool)]">
        <div className="flex w-max items-center gap-6 whitespace-nowrap px-4">
          {segments.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[var(--ink)]">
              <span aria-hidden="true" className="text-[11px]">{s.icon}</span>
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">{s.label}</span>
              <span className={`tabular-nums ${s.level === "critical" ? "text-[var(--sev-critical)]" : s.level === "alert" ? "text-[var(--sev-alert)]" : ""}`}>
                {s.value}
              </span>
              <span className="text-[var(--dim)]">·</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
