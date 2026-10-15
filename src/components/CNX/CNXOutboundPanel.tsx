"use client";

// CNX Outbound Flight Panel — answers "where are passengers flying back?"
//
// Three pieces, side by side:
//   1. Heading-quadrant bucket (south = BKK / gulf, north = Chiang Rai,
//      east = Laos / Vietnam, west = Myanmar).
//   2. Top origin countries of inbound flights (OpenSky returns the
//      origin_country per state vector — the closest we can get without
//      a paid FlightAware feed).
//   3. Snapshot store notice ("X snapshots today, 8 TB target").
//
// Drives the multilingual social subscription: top-3 origins are also
// passed to /api/cnx/social so we pull news in Chinese / Japanese /
// Korean / Russian etc.
//
// One language per mode. Registration countries are shown as OpenSky
// publishes them; the inferred destination is re-derived from the top
// quadrant so it follows the mode (the API string is English only).

import { useEffect, useState } from "react";
import { Plane, MapPin, Globe2, Database } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import { useLang } from "../../hooks/useLang";
import type { OutboundAnalysis } from "../../lib/cnx/outbound";

const QUADRANT_LABEL: Record<string, { th: string; en: string; destTh: string; destEn: string; arrow: string }> = {
  south: { th: "ใต้", en: "South", destTh: "กรุงเทพฯ (BKK) / อ่าวไทย", destEn: "Bangkok (BKK) / Gulf", arrow: "↓" },
  north: { th: "เหนือ", en: "North", destTh: "เชียงราย / ลาว", destEn: "Chiang Rai / Laos", arrow: "↑" },
  east: { th: "ตะวันออก", en: "East", destTh: "ลาว / เวียดนาม", destEn: "Laos / Vietnam", arrow: "→" },
  west: { th: "ตะวันตก", en: "West", destTh: "เมียนมา", destEn: "Myanmar", arrow: "←" },
  stationary: { th: "อยู่บนพื้น", en: "On ground", destTh: "อยู่บนพื้น", destEn: "On ground", arrow: "•" },
};

export default function CnxOutboundPanel({ snapshot }: { snapshot: OutboundAnalysis | null }) {
  const [trend, setTrend] = useState<{ days: number; totalSnapshots: number } | null>(null);
  const { t } = useLang();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchJsonOrNull<{ days: number; totalSnapshots: number }>("/api/cnx/snapshot-trend?days=7");
      if (!cancelled && next) setTrend({ days: next.days, totalSnapshots: next.totalSnapshots });
    };
    void load();
    const i = window.setInterval(() => void load(), 60_000);
    return () => { cancelled = true; window.clearInterval(i); };
  }, []);

  if (!snapshot) return null;
  if (snapshot.degraded || snapshot.provenance === "unavailable") return (
    <div role="status" className="border-t border-[var(--line)] p-3 text-[12px] text-[var(--dim)]">
      {t("ยังยืนยันทิศทางการบินไม่ได้ — ข้อมูลขาดหายหรือเก่า ไม่ใช่ไม่มีเครื่องบิน", "Aircraft headings unavailable — observations are missing or stale, not zero aircraft.")}
    </div>
  );

  const top = QUADRANT_LABEL[snapshot.byQuadrant[0]?.quadrant ?? ""];
  const destination = top ? t(top.destTh, top.destEn) : t("ไม่ทราบ", snapshot.inferredTopDestination);

  return (
    <div className="flex flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)] p-3">
      <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
        <div className="flex items-center gap-1.5">
          <Plane className="h-3 w-3 text-[var(--cool)]" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
            {t("ทิศทางเครื่องบิน — ยังไม่ยืนยันเส้นทาง", "Aircraft headings — route unconfirmed")}
          </span>
        </div>
        {trend && (
          <span className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dim)]">
            <Database className="h-2.5 w-2.5" />
            {t(`${trend.totalSnapshots} ภาพ · ${trend.days} วัน`, `${trend.totalSnapshots} snaps · ${trend.days}d`)}
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="border border-[var(--line)] bg-[var(--bg)] p-2">
          <div className="mb-1 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
            {t("ทิศทาง", "Heading")}
          </div>
          <div className="space-y-0.5">
            {snapshot.byQuadrant.map((q) => {
              const meta = QUADRANT_LABEL[q.quadrant];
              return (
                <div key={q.quadrant} className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-[var(--ink)]">
                    <span aria-hidden="true" className="mr-1 inline-block w-3 text-center">{meta?.arrow ?? "?"}</span>
                    {meta ? t(meta.th, meta.en) : q.quadrant}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">{q.count}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="border border-[var(--line)] bg-[var(--bg)] p-2">
          <div className="mb-1 flex items-center gap-1 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
            <Globe2 className="h-2.5 w-2.5" />
            {t("ประเทศที่จดทะเบียน", "Registration countries")}
          </div>
          <div className="space-y-0.5">
            {snapshot.byQuadrant
              .flatMap((q) => q.topOrigins)
              .reduce<{ country: string; count: number }[]>((acc, o) => {
                const e = acc.find((x) => x.country === o.country);
                return e
                  ? acc.map((x) => (x === e ? { ...x, count: x.count + o.count } : x))
                  : [...acc, { ...o }];
              }, [])
              .sort((a, b) => b.count - a.count)
              .slice(0, 5)
              .map((o) => (
                <div key={o.country} className="flex items-center justify-between">
                  <span className="truncate font-mono text-[11px] text-[var(--ink)]">{o.country}</span>
                  <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">{o.count}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 border-t border-[var(--line)] pt-2 font-mono text-[11px] text-[var(--dim)]">
        <MapPin className="h-3 w-3 text-[var(--cool)]" />
        {t("คาดจากทิศทางบิน (ไม่ใช่แผนการบิน):", "Heading-based guess (not a flight plan):")}{" "}
        <span className="ml-1 font-bold text-[var(--ink)]">{destination}</span>
      </div>
    </div>
  );
}
