"use client";

// Governor brief — one screen a governor can read in 30 seconds and forward
// to a LINE group: four hazards in plain Thai with source and age, the
// districts to call (worst air now, with last season's burned area beside
// it), and "copy for LINE" / print. Logic lives in lib/cnx/governor-brief.ts.

import type { RainResponse } from "../../lib/cnx/rain";
import { airActionTh, airActionEn, rainActionTh, rainActionEn, type ProvinceOutlook } from "../../lib/cnx/outlook";
import { useEffect, useMemo, useState } from "react";
import { Copy, Printer, X } from "lucide-react";
import { useModalDialog } from "../../hooks/useModalDialog";
import { fetchJsonOrNull } from "../../lib/client-requests";
import type { ArrivalsResponse } from "../../lib/cnx/arrivals";
import type { BurnSeasonDoc } from "../../lib/cnx/burn-season";
import type { DustboyResponse } from "../../lib/cnx/dustboy";
import { currentFloodHub, type FloodHubResponse } from "../../lib/cnx/floodhub";
import { buildTiles, districtTable, isBriefObservationCurrent, lineText, pm25Band, type BriefLevel, type BriefTile } from "../../lib/cnx/governor-brief";
import { buildExecutiveBrief, type ExecutiveMetric } from "../../lib/cnx/executive-brief";
import type { FetchResult } from "../../lib/cnx/opensky";
import type { RiverGauge } from "../../lib/cnx/river-level";
import type { CnxTwinResponse } from "../../lib/cnx/twin";
import type { AirQualityResponse, CnxFiresResponse } from "../../types/cnx";
import { DataAge } from "./CNXDataAge";
import { useLang } from "../../hooks/useLang";
import { metricUnit } from "./CNXMetricEvidence";

interface Props {
  operationalNotes?: { th: string; en: string }[];
  isOpen: boolean;
  onClose: () => void;
  onOpenMetric?: (id: ExecutiveMetric["id"]) => void;
  air: AirQualityResponse | null;
  dustboy: DustboyResponse | null;
  fires: CnxFiresResponse | null;
  twin: CnxTwinResponse | null;
  riverGauges: RiverGauge[];
  flights: FetchResult | null;
  rain?: RainResponse | null;
  /** 48 h forecast outlook: its first rain and air warnings join the actions. */
  outlook?: ProvinceOutlook | null;
}

const LEVEL_CLS: Record<BriefLevel, string> = {
  good: "border-[var(--sev-good)]",
  watch: "border-[var(--sev-watch)]",
  alert: "border-[var(--sev-alert)]",
  critical: "border-[var(--sev-critical)]",
  unknown: "border-[var(--line)]",
};
const LEVEL_LABEL: Record<BriefLevel, [string, string]> = {
  good: ["ปกติ", "Normal"],
  watch: ["เฝ้าระวัง", "Watch"],
  alert: ["แจ้งเตือน", "Alert"],
  critical: ["วิกฤต", "Critical"],
  unknown: ["ไม่มีข้อมูล", "No data"],
};
// lib/cnx/governor-brief carries Thai-only tile titles and PM2.5 band
// names (the LINE text is Thai); the on-screen English lives here.
const TILE_TITLE_EN: Record<BriefTile["key"], string> = {
  air: "Air quality",
  fire: "Wildfire / hotspots",
  water: "Water",
  visitors: "Aviation · historical",
};
const PM25_BAND_EN: Record<string, string> = {
  "ดีมาก": "Very good",
  "ดี": "Good",
  "ปานกลาง": "Moderate",
  "เริ่มมีผลกระทบต่อสุขภาพ": "Starting to affect health",
  "มีผลกระทบต่อสุขภาพ": "Affecting health",
};

export default function CnxGovernorBrief({ isOpen, onClose, onOpenMetric, air, dustboy, fires, twin, riverGauges, flights, rain = null, outlook = null, operationalNotes = [] }: Props) {
  const dialogRef = useModalDialog(isOpen, onClose);
  const { lang, t } = useLang();
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [isOpen]);
  const [arrivals, setArrivals] = useState<ArrivalsResponse | null>(null);
  const [floodhub, setFloodhub] = useState<FloodHubResponse | null>(null);
  const [floodStatus, setFloodStatus] = useState<"loading" | "ready" | "error">("loading");
  const [burn, setBurn] = useState<BurnSeasonDoc | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    const opts = { signal: controller.signal };
    void fetchJsonOrNull<ArrivalsResponse>("/api/cnx/arrivals", opts).then((d) => d && setArrivals(d));
    setFloodhub(null);
    setFloodStatus("loading");
    void fetchJsonOrNull<FloodHubResponse>("/api/cnx/floodhub", opts).then((d) => {
      if (controller.signal.aborted) return;
      setFloodhub(d);
      setFloodStatus(d ? "ready" : "error");
    });
    void fetchJsonOrNull<BurnSeasonDoc>("/data/cnx/burn-season.json", opts).then((d) => d && setBurn(d));
    return () => controller.abort();
  }, [isOpen]);

  const brief = useMemo(() => {
    const now = new Date(isOpen ? Math.max(clock, Date.now()) : clock);
    const executive = buildExecutiveBrief({ air, dustboy, fires, twin, riverGauges, flights, rain, now });
    const historicalDistricts = districtTable(dustboy?.provenance === "live" ? dustboy.stations : [], burn, now);
    const districts = historicalDistricts.length ? historicalDistricts : executive.districts.map((d) => ({ ...d, burnedLastSeasonRai: null, forestShare: null }));
    const freshDust = dustboy?.provenance === "live" ? dustboy.stations.filter((s) => s.province === "เชียงใหม่" && s.pm25 !== null && !s.suspect && isBriefObservationCurrent(s.observedAt, now)) : [];
    const pcd = (air?.stations ?? []).filter((s) => s.source === "pcd" && typeof s.pm25 === "number" && isBriefObservationCurrent(s.observedAt, now));
    const airMetric = executive.metrics.find((m) => m.id === "air")!;
    const airGround = { avg: airMetric.state === "current" ? Number(airMetric.value) : null, stations: pcd.length || freshDust.length, observedAt: airMetric.observedAt, source: airMetric.source };
    const water = executive.metrics.find((m) => m.id === "water")!;
    const river = water.state === "current" ? { th: `${water.value} ${water.unit} · ${water.summaryTh}`, en: `${water.value} ${metricUnit(water.unit, "en")} · ${water.summaryEn}`, level: water.level, observedAt: water.observedAt, source: water.source, kind: water.source === "ThaiWater rain gauges" ? "rain" as const : "river" as const } : null;
    const latestDetection = executive.metrics.find(m => m.id === "fire")!.observedAt;
    const yesterday = arrivals?.days[1];
    const tiles = buildTiles({
      now,
      airGround,
      worstDistrict: districts.find((d) => d.pm25 !== null) ?? null,
      fires: {
        live: fires?.provenance === "live" && isBriefObservationCurrent(fires.generatedAt, now),
        count: fires?.provenance === "live" ? (fires.provinceCount ?? fires.totalCount) : null,
        observedAt: latestDetection,
        source: fires?.liveSource === "open-24h" ? "NASA VIIRS (open 24 h)" : "NASA FIRMS",
      },
      river,
      floodForecast: floodhub,
      arrivals: yesterday
        ? { date: yesterday.date, flights: yesterday.totalFlights, international: yesterday.internationalFlights, estimatedVisitors: yesterday.estimatedVisitors }
        : null,
    });
    const url = "https://cnx.nonarkara.org/cnx";
    const airTile = tiles.find((tile) => tile.key === "air");
    if (airTile) airTile.level = airMetric.level;
    const checks = executive.metrics.filter((m) => m.level !== "good");
    const actions = [
      ...checks.map((metric) => ({ id: metric.id, th: `${metric.titleTh}: ${metric.actionTh}`, en: `${metric.titleEn}: ${metric.actionEn}` })),
      ...(outlook?.rain[0] ? [{ id: "forecast-rain", th: `48 ชม. ฝน (แบบจำลอง): ${rainActionTh(outlook.rain[0])}`, en: `48 h rain (model): ${rainActionEn(outlook.rain[0])}` }] : []),
      ...(outlook?.air[0] ? [{ id: "forecast-air", th: `48 ชม. ฝุ่น (แบบจำลอง): ${airActionTh(outlook.air[0])}`, en: `48 h air (model): ${airActionEn(outlook.air[0])}` }] : []),
    ];
    return { now, tiles, districts, actions, currentFloodForecast: currentFloodHub(floodhub, now), text: [lineText(tiles, districts, now, url, actions.map(action => action.th)), ...(operationalNotes.length ? ["หลักฐานปฏิบัติการเพิ่มเติม:", ...operationalNotes.map(note => `• ${note.th}`)] : [])].join("\n") };
  }, [air, dustboy, fires, twin, riverGauges, flights, rain, outlook, arrivals, floodhub, burn, clock, isOpen, operationalNotes]);

  if (!isOpen) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief.text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <div data-governor-brief="true" className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/60 p-4 print:static print:bg-white print:p-0" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("สรุปสถานการณ์สำหรับผู้ว่าฯ", "Governor brief")}
        lang={lang}
        className="relative my-6 w-full max-w-[1040px] border border-[var(--line)] bg-[var(--bg)] p-5 sm:p-8 print:my-0 print:border-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-start justify-between gap-5 border-b border-[var(--line)] pb-6 sm:flex-row">
          <div>
            <div className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--cool)]">{t("สรุปสำหรับผู้ว่าฯ", "Governor brief")}</div>
            <h2 className="mt-1 text-[25px] font-semibold sm:text-[30px] text-[var(--ink)]">{t("สรุปสถานการณ์จังหวัดเชียงใหม่", "Chiang Mai situation summary")}</h2>
            <p className="text-[12px] text-[var(--dim)]">{t(brief.text.split("\n")[0].replace("สรุปสถานการณ์จังหวัดเชียงใหม่ ", ""), brief.now.toLocaleString("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "long", timeStyle: "short" }))}</p>
          </div>
          <div className="flex w-full shrink-0 flex-wrap gap-2 print:hidden sm:w-auto">
            <button type="button" onClick={copy} className="cnx-primary-action flex min-h-11 items-center gap-2 border px-4 text-[13px] font-semibold">
              <Copy className="h-3.5 w-3.5" />
              {copyState === "copied" ? t("คัดลอกแล้ว", "Copied") : t("คัดลอกส่ง LINE", "Copy Thai text for LINE")}
            </button>
            <button type="button" onClick={() => window.print()} className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] px-3 text-[12px]">
              <Printer className="h-3.5 w-3.5" /> {t("พิมพ์", "Print")}
            </button>
            <button type="button" onClick={onClose} aria-label={t("ปิดสรุปผู้ว่าฯ", "Close governor brief")} className="ml-auto flex min-h-11 min-w-11 items-center justify-center border border-[var(--line)]">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <p role="status" className="mt-3 text-sm text-[var(--dim)] print:hidden">{copyState === "failed" ? t("คัดลอกไม่สำเร็จ เปิดข้อความด้านล่างแล้วเลือกคัดลอกด้วยตนเอง", "Copy failed; open the text below and copy it manually.") : copyState === "copied" ? t("คัดลอกข้อความพร้อมแหล่งที่มาและเวลาอ้างอิงแล้ว", "Copied, with sources and reference times.") : t("พร้อมส่งต่อทาง LINE หรือพิมพ์ โดยคงแหล่งที่มาและเวลาอ้างอิง", "Ready to forward on LINE (in Thai) or print, with sources and reference times kept.")}</p>
        {floodStatus !== "loading" && !brief.currentFloodForecast && <p role="status" className="mt-2 text-[12px] text-[var(--dim)]">{floodStatus === "error"
          ? t("Google Flood Hub อ่านไม่ได้ในรอบนี้ ไม่ใช้ค่าที่เก็บจากรอบก่อน ให้ดูระดับน้ำและประกาศทางการ", "Google Flood Hub is unavailable this check. Prior results are excluded; use measured river levels and official notices.")
          : t("ไม่มีพยากรณ์ Google Flood Hub ที่ยังใช้ได้ในขณะนี้ ไม่ใช่การยืนยันว่าไม่มีน้ำท่วม", "No current Google Flood Hub forecast is available; this does not confirm an absence of flooding.")}</p>}
        <section className="mt-6 grid items-start gap-3 sm:grid-cols-2">
          {brief.tiles.map((tile) => (
            <div key={tile.key} className={`border-l-4 ${LEVEL_CLS[tile.level]} border-y border-r border-y-[var(--line)] border-r-[var(--line)] bg-[var(--bg-surface)] p-4`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-bold text-[var(--ink)]">{t(tile.titleTh, TILE_TITLE_EN[tile.key])}</span>
                <span className="font-mono text-[11px] uppercase text-[var(--dim)]">{tile.key === "visitors" && tile.level === "good" ? t("ข้อมูลย้อนหลัง", "Historical") : t(...LEVEL_LABEL[tile.level])}</span>
              </div>
              <p className="mt-1 text-[17px] leading-relaxed text-[var(--ink)]">{t(tile.th, tile.en)}</p>
              <p className="mt-3 text-[12px] text-[var(--dim)]">
                {/* DataAge prints the source itself; without a time, print it plainly. */}
                {tile.observedAt ? <DataAge observedAt={tile.observedAt} source={tile.key === "fire" ? `${tile.source} · ${t("ตรวจพบล่าสุด", "latest detection")}` : tile.source} staleAfterMs={(tile.key === "fire" ? 24 : tile.key === "water" && tile.source.includes("rain gauges") ? 6 : 3) * 3600_000} className="!text-[12px] !tracking-normal" /> : tile.source}
              </p>
              {onOpenMetric && <button type="button" onClick={() => {
                onClose();
                onOpenMetric(tile.key === "visitors" ? "mobility" : tile.key);
              }} className="mt-2 inline-flex min-h-11 items-center border border-[var(--line)] px-3 text-[12px] font-semibold text-[var(--cool)] print:hidden">
                {t("ตรวจหลักฐาน", "Inspect evidence")}<span className="sr-only"> · {t(tile.titleTh, TILE_TITLE_EN[tile.key])}</span>
              </button>}
            </div>
          ))}
        </section>

        {operationalNotes.length > 0 && <section className="mt-6 border-t border-[var(--line)] pt-5">
          <h3 className="text-lg font-semibold">{t("หลักฐานปฏิบัติการเพิ่มเติม", "Additional operational evidence")}</h3>
          <ul className="mt-3 grid items-start gap-x-6 gap-y-3 md:grid-cols-2">{operationalNotes.map((note, index) => <li key={index} className="min-w-0 max-w-[65ch] break-words text-sm leading-relaxed">{t(note.th, note.en)}</li>)}</ul>
        </section>}
        {brief.actions.length > 0 && <section className="mt-6 border-t border-[var(--line)] pt-5">
          <h3 className="text-lg font-semibold">{t("ประเด็นที่ควรตรวจสอบต่อ", "Points to check next")}</h3>
          <ol className="mt-3 space-y-3">{brief.actions.map((action) => <li key={action.id} className="min-w-0 max-w-[65ch] break-words text-sm leading-relaxed">{t(action.th, action.en)}</li>)}</ol>
        </section>}
        <section className="mt-6 overflow-x-auto">
          <h3 className="text-[13px] font-bold text-[var(--ink)]">{t("อำเภอที่มีหลักฐานสำหรับติดตาม", "Districts with evidence to follow")}</h3>
          <p className="max-w-[65ch] text-[11px] text-[var(--dim)]">
            {t(
              "PM2.5 คือค่าเฉลี่ยสถานี DustBoy ที่ใช้ได้ในอำเภอ ไม่ครอบคลุมทุกพื้นที่ ส่วนพื้นที่เผาปีก่อนมาจาก HII Tamroypao และอาจนับพื้นที่เดิมซ้ำเมื่อเผาหลายครั้ง ไม่ใช่เหตุการณ์วันนี้",
              "PM2.5 is the average of usable DustBoy stations in the district and does not cover every area. Last season's burned area comes from HII Tamroypao and may count the same land twice when it burned more than once; it is not today's event.",
            )}
          </p>
          <table className="mt-2 w-full border-collapse text-[12px] tabular-nums">
            <thead>
              <tr className="text-left font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--dim)]">
                <th className="py-1 font-normal">{t("อำเภอ", "District")}</th>
                <th className="py-1 text-right font-normal">PM2.5 (µg/m³)</th>
                <th className="py-1 text-right font-normal">{t("สถานี", "Stations")}</th>
                <th className="py-1 text-right font-normal">{t("พื้นที่เผาย้อนหลัง (ไร่)", "Burned last season (rai)")}</th>
                <th className="py-1 text-right font-normal">{t("สัดส่วนป่า", "Forest share")}</th>
              </tr>
            </thead>
            <tbody>
              {brief.districts.length === 0 && <tr><td colSpan={5} className="py-5 text-sm text-[var(--dim)]">{t("ยังไม่มีข้อมูลรายอำเภอที่ผ่านเงื่อนไข", "No qualifying district evidence yet.")}</td></tr>}
              {brief.districts.slice(0, 10).map((d) => (
                <tr key={d.th} className="border-t border-[var(--line)]">
                  <td className="py-1">
                    {t(d.th, d.en)}
                    {d.observedAt && <span className="mt-1 block text-[11px] text-[var(--dim)]">{new Date(d.observedAt).toLocaleString(lang === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" })}</span>}
                  </td>
                  <td className="py-1 text-right">{d.pm25 === null ? "—" : <span title={t(pm25Band(d.pm25).th, PM25_BAND_EN[pm25Band(d.pm25).th])}>{d.pm25}</span>}</td>
                  <td className="py-1 text-right text-[var(--dim)]">{d.sensors || "—"}</td>
                  <td className="py-1 text-right">{d.burnedLastSeasonRai?.toLocaleString("en-US") ?? "—"}</td>
                  <td className="py-1 text-right text-[var(--dim)]">{d.forestShare === null ? "—" : `${d.forestShare}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <details className="mt-4 print:hidden">
          <summary className="cursor-pointer text-[12px] text-[var(--dim)]">{t("ข้อความที่จะคัดลอก (LINE)", "Text that will be copied (LINE, in Thai)")}</summary>
          <pre lang="th" className="mt-2 whitespace-pre-wrap border border-[var(--line)] bg-[var(--bg-surface)] p-3 font-sans text-[12px] text-[var(--ink)]">
            {brief.text}
          </pre>
        </details>
      </div>
    </div>
  );
}
