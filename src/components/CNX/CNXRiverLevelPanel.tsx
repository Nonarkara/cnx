"use client";

// CNX River Level Panel — measured gauge readings on the Ping.
//
// This is the panel that ends the board's blind flood axis. Until
// 2026-10-02 the flood axis of this dashboard was a hash-seeded
// scenario, and the module header blamed a missing upstream key. That
// was wrong: the ThaiWater feed this board now reads is keyless, public,
// and returns real instrument readings (see `lib/cnx/river-level.ts` for
// how the endpoints were found and what they actually contain).
//
// What this panel refuses to do:
//
//   - It never says "safe". A gauge below its bank is a measurement, and
//     the sentence says exactly that — station, metres below bank,
//     observation age. It does not upgrade one reading into a clearance.
//   - It never hides a gauge for being unhelpful. A station with no
//     published bank geometry is listed as ungraded rather than dropped,
//     because a missing threshold is information about the network.
//   - It never flattens freshness. Gauges in one response ranged from 19
//     minutes to 7 hours old at the time of the live probe, and each row
//     ages its OWN observation. A single "updated 3m ago" over the whole
//     panel would hide that spread behind the freshest row.

import { useEffect, useState } from "react";
import { Waves, Scale, ExternalLink } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import { isCurrentGaugeReading } from "../../lib/cnx/verdict";
import { DataAge } from "./CNXDataAge";
import type { RiverLevelResponse, RiverGauge, RiverSeverity } from "../../lib/cnx/river-level";

const SEV_CLS: Record<RiverSeverity, string> = {
  good: "text-[#10b981]",
  watch: "text-[var(--sun)]",
  alert: "text-[#f97316]",
  critical: "text-[#ef4444]",
};

/** Thai name is authoritative; the code is what an operator looks up. */
function gaugeLabel(g: RiverGauge): string {
  return g.nameTh || g.code || "(unnamed station)";
}

/** Keep bank overtopping separate from an agency's critical threshold. */
export function gaugeEvidence(g: RiverGauge, now: number | null): { current: boolean; bank: string; critical: string | null } {
  const current = now !== null && isCurrentGaugeReading(g.observedAt, now);
  const bank = g.belowBankM === null
    ? "Bank relation unknown"
    : g.belowBankM === 0
    ? "At published bank level"
    : `${Math.abs(g.belowBankM).toFixed(2)} m ${g.belowBankM < 0 ? "above" : "below"} bank`;
  const critical = g.headroomM === null
    ? g.criticalLevelMsl === null ? null : "Critical threshold relation unknown"
    : g.headroomM === 0
    ? "At official critical level"
    : `${Math.abs(g.headroomM).toFixed(2)} m ${g.headroomM < 0 ? "above" : "below"} official critical level`;
  return { current, bank, critical };
}

function GaugeRow({ g, rank, now }: { g: RiverGauge; rank: number; now: number | null }) {
  const evidence = gaugeEvidence(g, now);
  const colour = evidence.current ? SEV_CLS[g.severity] : "text-[var(--dim)]";
  return (
    <li className="border-b border-[var(--line)] py-2.5 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-[12px] font-semibold text-[var(--ink)]">
          {rank}. {gaugeLabel(g)}
          {g.code && <span className="ml-1 font-mono text-[10px] text-[var(--dim)]">{g.code}</span>}
        </div>
        <DataAge observedAt={g.observedAt} source="observed" staleAfterMs={3 * 3600_000} missing="undated" />
      </div>
      <div className={`mt-1 text-[13px] font-bold ${colour}`}>{evidence.bank}</div>
      {now !== null && !evidence.current && <p className="mt-1 text-[11px] font-semibold text-[var(--sun)]">Historical / timestamp unverified — excluded from current verdict</p>}
      {evidence.critical && <p className={`mt-1 text-[11px] ${colour}`}>{evidence.critical}. A critical threshold does not itself confirm overtopping.</p>}
      <details className="mt-1 text-[11px] text-[var(--dim)]">
        <summary className="cursor-pointer py-1">Gauge measurements &amp; source</summary>
        <p className="mt-1">Water {g.levelMsl.toFixed(2)} m above mean sea level{g.bankLevelMsl !== null && `; bank ${g.bankLevelMsl.toFixed(2)} m`}{g.criticalLevelMsl !== null && `; critical ${g.criticalLevelMsl.toFixed(2)} m`}{g.dischargeM3s !== null && `; discharge ${g.dischargeM3s.toFixed(1)} m³/s`}. Source: {g.agency}.</p>
        <p className="mt-1">Observation: {g.observedAt || "undated"}</p>
        {g.belowBankM === null && <p className="mt-1">No published bank relation — bank overtopping cannot be assessed from this reading.</p>}
      </details>
    </li>
  );
}

export default function CnxRiverLevelPanel() {
  const [data, setData] = useState<RiverLevelResponse | null>(null);
  const [onlyMainstem, setOnlyMainstem] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchJsonOrNull<RiverLevelResponse>("/api/cnx/river-level");
      if (!cancelled) {
        setRefreshFailed(next === null);
        if (next) setData(next);
      }
    };
    void load();
    // 10 min matches the module TTL and the upstream's own publish rate.
    const i = window.setInterval(() => void load(), 10 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(i);
    };
  }, []);

  const down = data?.provenance === "unavailable";
  const severityRank: Record<RiverSeverity, number> = { critical: 0, alert: 1, watch: 2, good: 3 };
  const rows = (data?.gauges ?? [])
    .filter((g) => (onlyMainstem ? g.riverTh === "แม่น้ำปิง" : true))
    .sort((a, b) => Number(gaugeEvidence(b, now).current) - Number(gaugeEvidence(a, now).current) || severityRank[a.severity] - severityRank[b.severity] || (a.belowBankM ?? Infinity) - (b.belowBankM ?? Infinity));
  const currentCount = rows.filter((g) => gaugeEvidence(g, now).current).length;
  const mainstem = data?.pingMainstemCount ?? 0;

  return (
    <div className="flex h-full flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-1.5">
        <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink)]">
          <Waves className="h-3.5 w-3.5 text-[#38bdf8]" />
          Ping basin — gauge evidence
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {data && (
            <button
              type="button"
              onClick={() => setOnlyMainstem((v) => !v)}
              className={`min-h-11 px-2 font-mono text-[10px] uppercase tracking-[0.12em] ${
                onlyMainstem ? "text-[#38bdf8]" : "text-[var(--dim)] hover:text-[var(--ink)]"
              }`}
            >
              {onlyMainstem ? "● mainstem" : `○ mainstem (${mainstem})`}
            </button>
          )}
          <span className="font-mono text-[9px] tabular-nums text-[var(--dim)]">
            {data ? `${data.gaugeCount} observations` : "loading…"}
          </span>
          <DataAge
            observedAt={data?.observedAt}
            source="newest gauge"
            staleAfterMs={2 * 3600_000}
            missing="no reading"
          />
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <p className="mb-2 text-[12px] leading-relaxed text-[var(--ink)]">อ่านสถานีใกล้พื้นที่และประกาศทางการ · ค่าสถานีไม่ยืนยันน้ำท่วมถนน</p>
        {refreshFailed && <p role="status" className="mb-2 text-[12px] text-[var(--sun)]">Unable to refresh gauge data. {data ? "Showing the last received observations; check each timestamp." : "Current river conditions are unknown. The next poll will retry."}</p>}
        {data && now !== null && <p className="mb-2 text-[11px] text-[var(--dim)]">{currentCount} สถานีใน 3 ชม. · ค่าที่เก่ากว่านี้แสดงเป็นประวัติ</p>}

        {down && data && (
          <div className="mb-2 border border-[#ef4444]/40 bg-[#ef4444]/10 px-2 py-1.5 text-[10px] leading-[1.5] text-[#ef4444]">
            ไม่สามารถอ่านค่าจากสถานีวัด — ไม่ใช่หลักฐานว่าน้ำปลอดภัย
            <div className="mt-0.5 font-mono text-[9px] opacity-90">
              {data.unavailableReason ?? "upstream read failed"}
            </div>
            {/rate limit|429/i.test(data.unavailableReason ?? "") && (
              <div className="mt-1 text-[9px] italic opacity-90">
                แหล่งข้อมูลจำกัดอัตราการเรียกใช้ชั่วคราว (ไม่ใช่สถานะของแม่น้ำ) — ค่าจริงยังมีอยู่ที่สถานีวัด
                <br />
                A temporary read throttle on our side, not a change in the river — the gauges are still reporting,
                and this panel is blind until the next poll succeeds.
              </div>
            )}
          </div>
        )}

        {rows.length > 0 ? (
          <>
            <ul>
              {rows.map((g, i) => (
                <GaugeRow key={g.id} g={g} rank={i + 1} now={now} />
              ))}
            </ul>
            {/* Context, not a denominator. The province catalogue is
                all-basin and carries no basin field, so "N of 128
                reporting" would be arithmetic across two populations
                and would call ~85 out-of-basin stations "silent". */}
            {data && data.catalogueCount !== null && (
              <p className="mt-2 font-mono text-[8px] leading-[1.5] text-[var(--dim)]">
                For context, the province&apos;s telemetry catalogue lists {data.catalogueCount} stations
                across all basins; only Ping-basin gauges feed this panel, so this is not a
                &quot;N of 128 reporting&quot; figure.
              </p>
            )}
            {data && data.catalogueCount === null && (
              <p className="mt-2 font-mono text-[8px] leading-[1.5] text-[var(--sun)]">
                Station catalogue could not be read — coverage against the network is unknown, not complete.
              </p>
            )}
          </>
        ) : data ? (
          <p className="text-[10px] italic text-[var(--dim)]">
            {onlyMainstem ? "No Ping mainstem observation is available in this response." : "No Ping-basin gauge observation is available."} Current river conditions are unverified.
          </p>
        ) : refreshFailed ? null : (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse bg-[var(--line)]/30" />
            ))}
          </div>
        )}
        {data && <details className="mb-2 text-[11px] leading-relaxed text-[var(--dim)]"><summary className="cursor-pointer py-2">Basin coverage &amp; methodology</summary><p>{data.note}</p></details>}
      </div>

      {/* Credit and terms are rendered VERBATIM from the module, for the
          same reason as the camera panel: attribution is a data
          contract, and three retyped copies drift apart. */}
      {data && (
        <footer className="shrink-0 border-t border-[var(--line)] bg-[var(--bg)] px-3">
          <details><summary className="min-h-11 cursor-pointer py-3 text-[12px] text-[var(--dim)]">ThaiWater · แหล่งข้อมูลและเงื่อนไข</summary>
          <div className="max-h-48 overflow-y-auto pb-3">
          <div className="font-mono text-[8px] leading-[1.5] text-[var(--dim)]">
            Levels via{" "}
            <a href={data.credit.publisherUrl} target="_blank" rel="noreferrer" className="underline">
              {data.credit.publisher}
              <ExternalLink className="ml-0.5 inline h-2 w-2" />
            </a>
            . Observations by {data.credit.agencies.join(", ")}. Severity bands on this panel are this
            board&apos;s reading of published bank geometry, not an upstream warning class.
          </div>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--dim)] hover:text-[var(--ink)]">
              <Scale className="h-2.5 w-2.5" />
              Intended use &amp; terms
            </summary>
            <div className="mt-1 space-y-1 font-mono text-[8px] leading-[1.6] text-[var(--dim)]">
              <p>{data.legal.intendedUse}</p>
              <p>{data.legal.terms}</p>
            </div>
          </details>
        </div></details></footer>
      )}
    </div>
  );
}
