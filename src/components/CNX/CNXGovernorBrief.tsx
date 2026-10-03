"use client";

// Governor brief — one screen a governor can read in 30 seconds and forward
// to a LINE group: four hazards in plain Thai with source and age, the
// districts to call (worst air now, with last season's burned area beside
// it), and "copy for LINE" / print. Logic lives in lib/cnx/governor-brief.ts.

import { useEffect, useMemo, useState } from "react";
import { Copy, Printer, X } from "lucide-react";
import { useModalDialog } from "../../hooks/useModalDialog";
import { fetchJsonOrNull } from "../../lib/client-requests";
import type { ArrivalsResponse } from "../../lib/cnx/arrivals";
import type { BurnSeasonDoc } from "../../lib/cnx/burn-season";
import type { DustboyResponse } from "../../lib/cnx/dustboy";
import type { FloodHubResponse } from "../../lib/cnx/floodhub";
import { buildTiles, districtTable, lineText, pm25Band, type BriefLevel } from "../../lib/cnx/governor-brief";
import type { CnxTwinResponse } from "../../lib/cnx/twin";
import type { AirQualityResponse, CnxFiresResponse } from "../../types/cnx";
import { DataAge } from "./CNXDataAge";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  air: AirQualityResponse | null;
  dustboy: DustboyResponse | null;
  fires: CnxFiresResponse | null;
  twin: CnxTwinResponse | null;
}

const LEVEL_CLS: Record<BriefLevel, string> = {
  good: "border-[var(--success)]",
  watch: "border-[#f59e0b]",
  alert: "border-[#fb923c]",
  critical: "border-[var(--danger)]",
  unknown: "border-[var(--line)]",
};
const LEVEL_TH: Record<BriefLevel, string> = { good: "ปกติ", watch: "เฝ้าระวัง", alert: "แจ้งเตือน", critical: "วิกฤต", unknown: "ไม่มีข้อมูล" };

export default function CnxGovernorBrief({ isOpen, onClose, air, dustboy, fires, twin }: Props) {
  const dialogRef = useModalDialog(isOpen, onClose);
  const [arrivals, setArrivals] = useState<ArrivalsResponse | null>(null);
  const [floodhub, setFloodhub] = useState<FloodHubResponse | null>(null);
  const [burn, setBurn] = useState<BurnSeasonDoc | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    const opts = { signal: controller.signal };
    void fetchJsonOrNull<ArrivalsResponse>("/api/cnx/arrivals", opts).then((d) => d && setArrivals(d));
    void fetchJsonOrNull<FloodHubResponse>("/api/cnx/floodhub", opts).then((d) => d && setFloodhub(d));
    void fetchJsonOrNull<BurnSeasonDoc>("/data/cnx/burn-season.json", opts).then((d) => d && setBurn(d));
    return () => controller.abort();
  }, [isOpen]);

  const brief = useMemo(() => {
    const now = new Date();
    const districts = districtTable(dustboy?.stations ?? [], burn);
    const cmGround = dustboy?.basin.chiangMai;
    const pcd = (air?.stations ?? []).filter((s) => s.source === "pcd" && typeof s.pm25 === "number");
    const airGround =
      cmGround && cmGround.avgPm25 !== null && cmGround.onlineCount > 0
        ? { avg: cmGround.avgPm25, stations: cmGround.onlineCount, observedAt: dustboy?.generatedAt ?? null, source: "CMU DustBoy" }
        : pcd.length
          ? { avg: Math.round((pcd.reduce((a, s) => a + (s.pm25 ?? 0), 0) / pcd.length) * 10) / 10, stations: pcd.length, observedAt: pcd[0].observedAt, source: "PCD Air4Thai" }
          : { avg: null, stations: 0, observedAt: null, source: "CMU DustBoy · PCD Air4Thai" };
    const m = twin?.deltas.flood.measured;
    const river =
      m && m.provenance === "live" && m.below_bank_m !== null
        ? {
            th: `สถานี ${m.station_code ?? ""} ${m.station_name_th} ${m.below_bank_m >= 0 ? `ต่ำกว่าตลิ่ง ${m.below_bank_m.toFixed(2)} ม.` : `สูงกว่าตลิ่ง ${Math.abs(m.below_bank_m).toFixed(2)} ม.`}`,
            en: `${m.station_code ?? ""} ${m.below_bank_m.toFixed(2)} m below bank`,
            level: (m.below_bank_m < 0 ? "critical" : m.below_bank_m < 0.5 ? "alert" : m.below_bank_m < 1 ? "watch" : "good") as BriefLevel,
            observedAt: m.observed_at,
          }
        : null;
    const yesterday = arrivals?.days[1];
    const tiles = buildTiles({
      now,
      airGround,
      worstDistrict: districts.find((d) => d.pm25 !== null) ?? null,
      fires: {
        live: fires?.provenance === "live",
        count: fires?.provenance === "live" ? fires.totalCount : null,
        observedAt: fires?.generatedAt ?? null,
        source: fires?.liveSource === "open-24h" ? "NASA VIIRS (open 24 h)" : "NASA FIRMS",
      },
      river,
      floodForecast: floodhub && floodhub.provenance === "live" ? { outlook: floodhub.outlook, points: floodhub.points.length } : null,
      arrivals: yesterday
        ? { date: yesterday.date, flights: yesterday.totalFlights, international: yesterday.internationalFlights, estimatedVisitors: yesterday.estimatedVisitors }
        : null,
    });
    const url = typeof window === "undefined" ? "https://cnx.nonarkara.org/cnx" : `${window.location.origin}/cnx`;
    return { tiles, districts, text: lineText(tiles, districts, now, url) };
  }, [air, dustboy, fires, twin, arrivals, floodhub, burn]);

  if (!isOpen) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/60 p-4 print:static print:bg-white print:p-0" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Governor brief"
        className="relative my-6 w-full max-w-[920px] border border-[var(--line)] bg-[var(--bg)] p-5 shadow-2xl print:my-0 print:border-0 print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--cool)]">Governor brief</div>
            <h2 lang="th" className="mt-1 text-[22px] font-bold text-[var(--ink)]">สรุปสถานการณ์จังหวัดเชียงใหม่</h2>
            <p lang="th" className="text-[12px] text-[var(--dim)]">{brief.text.split("\n")[0].replace("สรุปสถานการณ์จังหวัดเชียงใหม่ ", "")}</p>
          </div>
          <div className="flex shrink-0 gap-1.5 print:hidden">
            <button type="button" onClick={copy} className="flex min-h-[36px] items-center gap-1.5 border border-[var(--cool)] bg-[var(--cool)] px-3 text-[12px] font-bold text-white">
              <Copy className="h-3.5 w-3.5" />
              {copied ? "คัดลอกแล้ว" : "คัดลอกส่ง LINE"}
            </button>
            <button type="button" onClick={() => window.print()} className="flex min-h-[36px] items-center gap-1.5 border border-[var(--line)] px-3 text-[12px]">
              <Printer className="h-3.5 w-3.5" /> พิมพ์
            </button>
            <button type="button" onClick={onClose} aria-label="Close governor brief" className="min-h-[36px] border border-[var(--line)] px-2">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <section className="mt-4 grid gap-2 sm:grid-cols-2">
          {brief.tiles.map((t) => (
            <div key={t.key} className={`border-l-4 ${LEVEL_CLS[t.level]} border-y border-r border-y-[var(--line)] border-r-[var(--line)] bg-[var(--bg-surface)] p-3`}>
              <div className="flex items-baseline justify-between gap-2">
                <span lang="th" className="text-[14px] font-bold text-[var(--ink)]">{t.titleTh}</span>
                <span lang="th" className="font-mono text-[10px] uppercase text-[var(--dim)]">{LEVEL_TH[t.level]}</span>
              </div>
              <p lang="th" className="mt-1 text-[15px] leading-snug text-[var(--ink)]">{t.th}</p>
              <p className="mt-0.5 text-[11px] text-[var(--dim)]">{t.en}</p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--dim)]">
                {t.source}
                {t.observedAt && (
                  <>
                    {" · "}
                    <DataAge observedAt={t.observedAt} source={t.source} />
                  </>
                )}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-5">
          <h3 lang="th" className="text-[13px] font-bold text-[var(--ink)]">อำเภอที่ควรติดตาม · Districts to call</h3>
          <p className="text-[11px] text-[var(--dim)]">
            PM2.5 now = average of CMU DustBoy ground sensors in the district (suspect sensors excluded). Burned last season = HII
            Tamroypao, monthly sums (a field burned twice counts twice).
          </p>
          <table className="mt-2 w-full border-collapse text-[12px] tabular-nums">
            <thead>
              <tr className="text-left font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--dim)]">
                <th className="py-1 font-normal">อำเภอ</th>
                <th className="py-1 text-right font-normal">PM2.5 now</th>
                <th className="py-1 text-right font-normal">Sensors</th>
                <th className="py-1 text-right font-normal">Burned 2569 (rai)</th>
                <th className="py-1 text-right font-normal">Forest share</th>
              </tr>
            </thead>
            <tbody>
              {brief.districts.slice(0, 10).map((d) => (
                <tr key={d.th} className="border-t border-[var(--line)]">
                  <td lang="th" className="py-1">
                    {d.th} <span className="text-[var(--dim)]">({d.en})</span>
                  </td>
                  <td className="py-1 text-right">{d.pm25 === null ? "—" : <span title={pm25Band(d.pm25).th}>{d.pm25}</span>}</td>
                  <td className="py-1 text-right text-[var(--dim)]">{d.sensors || "—"}</td>
                  <td className="py-1 text-right">{d.burnedLastSeasonRai?.toLocaleString("en-US") ?? "—"}</td>
                  <td className="py-1 text-right text-[var(--dim)]">{d.forestShare === null ? "—" : `${d.forestShare}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <details className="mt-4 print:hidden">
          <summary className="cursor-pointer text-[12px] text-[var(--dim)]">ข้อความที่จะคัดลอก (LINE)</summary>
          <pre lang="th" className="mt-2 whitespace-pre-wrap border border-[var(--line)] bg-[var(--bg-surface)] p-3 font-sans text-[12px] text-[var(--ink)]">
            {brief.text}
          </pre>
        </details>
      </div>
    </div>
  );
}
