"use client";

// CNX — watch board: "สิ่งที่เชียงใหม่ต้องเฝ้าระวังตอนนี้".
//
// Two honest sections:
//   1. WATCHING NOW — ranked items with a current concern (level above
//      good), each carrying its own evidence, limits and a jump to the
//      desk that holds the underlying panel.
//   2. ALL WARNING SYSTEMS — the full sensor inventory: satellite, ground,
//      model, camera vision and imagery layers. Every system appears
//      every cycle; a dead feed shows as "ไม่มีข้อมูล" with its own age
//      stamp, so the board is proof the organism is alive, not a claim
//      that it is always right.
//
// The four slowly-changing satellite feeds the rest of the board does not
// poll (AERONET, JAXA GCOM-C, FloodHub, GISTDA districts) are fetched
// here on a 10-minute cycle — their routes are edge-cached anyway.
//
// Above both sections sits the official channel: TMD's CAP warnings for
// Chiang Mai (useOfficialWarnings, shared with the map). It is always
// present — a warning, "no TMD warning in force", or "unavailable" — and
// framed apart from the board's own model and measured rows.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Satellite } from "lucide-react";
import type { ExecutiveMetric } from "../../lib/cnx/executive-brief";
import type { RfdFiresResponse } from "../../lib/cnx/fire-rfd";
import type { AerosolResponse } from "../../lib/cnx/aerosol";
import type { AeronetResponse } from "../../lib/cnx/aeronet";
import type { JaxaAotResponse } from "../../lib/cnx/jaxa-aot";
import type { FloodHubResponse } from "../../lib/cnx/floodhub";
import type { GistdaPm25Response } from "../../lib/cnx/gistda-pm25";
import type { SmokeTrajectoryResponse } from "../../lib/cnx/smoke-trajectory";
import type { HazeVisionResponse } from "../../lib/cnx/haze-vision";
import type { DustboyResponse } from "../../lib/cnx/dustboy";
import type { WeatherLayerUrls } from "../../lib/cnx/weather-layers";
import type { RiverGauge } from "../../lib/cnx/river-level";
import type { RainResponse } from "../../lib/cnx/rain";
import type { ProvinceOutlook } from "../../lib/cnx/outlook";
import { fetchJsonOrNull } from "../../lib/client-requests";
import { buildWatchList, type WatchItem, type WatchKind } from "../../lib/cnx/watch-list";
import { DataAge } from "./CNXDataAge";
import { useLang } from "../../hooks/useLang";
import { useOfficialWarnings } from "../../hooks/useOfficialWarnings";

const LEVEL_CLASSES: Record<string, string> = {
  unknown: "bg-[var(--line)] text-[var(--dim)]",
  good: "sev-fill-good",
  watch: "sev-fill-watch",
  alert: "sev-fill-alert",
  critical: "sev-fill-critical",
};
const LEVEL_LABEL: Record<string, [string, string]> = {
  unknown: ["ไม่มีข้อมูล", "No data"],
  good: ["ปกติ", "Normal"],
  watch: ["เฝ้าระวัง", "Watch"],
  alert: ["เตือนภัย", "Warning"],
  critical: ["วิกฤต", "Critical"],
};
const KIND_LABEL: Record<WatchKind, [string, string]> = {
  official: ["ทางการ", "Official"],
  measured: ["ภาคพื้นดิน", "Ground"],
  satellite: ["ดาวเทียม", "Satellite"],
  model: ["โมเดล", "Model"],
  vision: ["กล้อง", "Camera"],
  imagery: ["ภาพ", "Imagery"],
};

/** Frame of an official row: the severity colour, or plain ink when no warning is in force. */
const OFFICIAL_FRAME: Record<string, string> = {
  unknown: "border-[var(--sev-unknown)]",
  good: "border-[var(--ink)]",
  watch: "border-[var(--sev-watch)]",
  alert: "border-[var(--sev-alert)]",
  critical: "border-[var(--sev-critical)]",
};

function LevelChip({ level, chipTh, chipEn }: { level: string; chipTh?: string; chipEn?: string }) {
  const { t } = useLang();
  const label = LEVEL_LABEL[level];
  // An overridden chip ("no official warning") is neutral — never a green "normal".
  if (chipTh && chipEn) return <span className={`shrink-0 px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] ${LEVEL_CLASSES.unknown}`}>{t(chipTh, chipEn)}</span>;
  return <span className={`shrink-0 px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] ${LEVEL_CLASSES[level] ?? LEVEL_CLASSES.unknown}`}>{label ? t(...label) : level}</span>;
}

/** The official channel, framed apart from the board's own evidence. */
function OfficialRows({ items }: { items: WatchItem[] }) {
  const { t } = useLang();
  return (
    <section aria-labelledby="watch-official" className="flex flex-col gap-2">
      <h3 id="watch-official" className="sr-only">{t("ประกาศทางการ", "Official warnings")}</h3>
      {items.map((item) => (
        <div key={item.id} className={`border-2 ${OFFICIAL_FRAME[item.level] ?? OFFICIAL_FRAME.unknown} bg-[var(--bg-raised)] p-2.5`}>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink)]">{t(item.systemTh, item.systemEn)}</p>
          <div className="mt-1.5 flex items-start gap-2">
            <LevelChip level={item.level} chipTh={item.chipTh} chipEn={item.chipEn} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-[var(--ink)]">{t(item.valueTh, item.valueEn)}</p>
              {item.actionTh && <p className="mt-1 text-[12px] font-semibold text-[var(--cool)]">▸ {t(item.actionTh, item.actionEn)}</p>}
              <p className="mt-1 text-[11px] leading-snug text-[var(--dim)]">{t(item.evidenceTh, item.evidenceEn)}</p>
              <DataAge observedAt={item.observedAt} source={item.source} staleAfterMs={45 * 60_000} className="mt-1 block" />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

interface Props {
  metrics: ExecutiveMetric[];
  firesRfd: RfdFiresResponse | null;
  aerosol: AerosolResponse | null;
  smoke: SmokeTrajectoryResponse | null;
  hazeVision: HazeVisionResponse | null;
  dustboy: DustboyResponse | null;
  weatherLayers: WeatherLayerUrls | null;
  riverGauges: RiverGauge[];
  rain: RainResponse | null;
  outlook?: ProvinceOutlook | null;
  onOpenMetric: (id: "water" | "air" | "fire" | "mobility" | "model" | "watch") => void;
}

function EvidenceButton({ item, onOpenMetric }: { item: WatchItem; onOpenMetric: Props["onOpenMetric"] }) {
  const { t } = useLang();
  if (!item.openMetric) return null;
  return (
    <button
      type="button"
      onClick={() => onOpenMetric(item.openMetric!)}
      className="min-h-11 shrink-0 self-center border border-[var(--line)] px-3 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--cool-dim)]"
    >
      {t("ดูหลักฐาน", "View evidence")}
    </button>
  );
}

export default function CnxWatchBoard({
  metrics,
  firesRfd,
  aerosol,
  smoke,
  hazeVision,
  dustboy,
  weatherLayers,
  riverGauges,
  rain,
  outlook = null,
  onOpenMetric,
}: Props) {
  const { lang, t } = useLang();
  const [aeronet, setAeronet] = useState<AeronetResponse | null>(null);
  const [jaxa, setJaxa] = useState<JaxaAotResponse | null>(null);
  const [floodhub, setFloodhub] = useState<FloodHubResponse | null>(null);
  const [gistda, setGistda] = useState<GistdaPm25Response | null>(null);
  const officialWarnings = useOfficialWarnings();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await Promise.all([
        fetchJsonOrNull<AeronetResponse>("/api/cnx/aeronet").then((d) => { if (!cancelled && d) setAeronet(d); }),
        fetchJsonOrNull<JaxaAotResponse>("/api/cnx/jaxa-aot").then((d) => { if (!cancelled && d) setJaxa(d); }),
        fetchJsonOrNull<FloodHubResponse>("/api/cnx/floodhub").then((d) => { if (!cancelled && d) setFloodhub(d); }),
        fetchJsonOrNull<GistdaPm25Response>("/api/cnx/aqi-amphoe").then((d) => { if (!cancelled && d) setGistda(d); }),
      ]);
    };
    void load();
    const interval = window.setInterval(() => void load(), 10 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const board = useMemo(
    () => buildWatchList({ metrics, firesRfd, aerosol, aeronet, jaxa, floodhub, gistda, smoke, hazeVision, dustboy, weatherLayers, riverGauges, rain, outlook, officialWarnings }),
    [metrics, firesRfd, aerosol, aeronet, jaxa, floodhub, gistda, smoke, hazeVision, dustboy, weatherLayers, riverGauges, rain, outlook, officialWarnings],
  );
  const official = board.systems.filter((item) => item.kind === "official");
  // Official rows have their own frame above; "Watching now" is the board's own evidence.
  const watchNow = board.watch.filter((item) => item.kind !== "official");

  return (
    <section lang={lang} aria-label={t("รายการเฝ้าระวังของจังหวัด", "Province watch list")} className="flex flex-col gap-4 p-3">
      <header className="flex flex-wrap items-center gap-2">
        <Satellite aria-hidden="true" className="h-4 w-4 text-[var(--cool)]" />
        <h2 className="text-[14px] font-bold">{t("เฝ้าระวังเชียงใหม่", "What Chiang Mai must watch now")}</h2>
        <span className="ml-auto flex items-center gap-2">
          {board.attentionCount > 0 && (
            <span className="flex items-center gap-1 border border-[var(--sev-watch)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--sev-watch)]">
              <AlertTriangle aria-hidden="true" className="h-3 w-3" /> {t(`${board.attentionCount} จุดเฝ้าระวัง`, `${board.attentionCount} on watch`)}
            </span>
          )}
          {board.gapCount > 0 && (
            <span className="bg-[var(--line)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--dim)]" title={t("ข้อมูลที่ไม่มีจะแสดงว่าไม่มีเสมอ", "A missing feed is always shown as missing")}>
              {t(`${board.gapCount} ระบบไม่มีข้อมูล`, `${board.gapCount} ${board.gapCount === 1 ? "system" : "systems"} without data`)}
            </span>
          )}
        </span>
      </header>

      <OfficialRows items={official} />

      <section aria-labelledby="watch-now">
        <h3 id="watch-now" className="mb-2 border-b border-[var(--line)] pb-1 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">
          {t("ต้องเฝ้าระวังตอนนี้", "Watching now")}
        </h3>
        {watchNow.length === 0 ? (
          <p className="border border-[var(--line)] bg-[var(--bg)] p-3 text-[12px] text-[var(--dim)]">
            {t("ไม่มีสัญญาณเฝ้าระวังจากข้อมูลที่วัดได้ในขณะนี้ — ไม่ใช่การยืนยันว่าทั้งจังหวัดปลอดภัย", "No current concern from measured evidence; this is not a province-wide all-clear.")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {watchNow.map((item) => (
              <li key={item.id} className="border border-[var(--line)] bg-[var(--bg)] p-2.5">
                <div className="flex items-start gap-2">
                  <LevelChip level={item.level} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold">{t(item.systemTh, item.systemEn)} <span className="text-[11px] font-normal text-[var(--dim)]">{t(...KIND_LABEL[item.kind])}</span></p>
                    <p className="mt-0.5 text-[13px] text-[var(--ink)]">{t(item.valueTh, item.valueEn)}</p>
                    {item.actionTh && <p className="mt-1 text-[12px] font-semibold text-[var(--cool)]">▸ {t(item.actionTh, item.actionEn)}</p>}
                    <p className="mt-1 text-[11px] leading-snug text-[var(--dim)]">{t(item.evidenceTh, item.evidenceEn)}</p>
                    <DataAge observedAt={item.observedAt} source={item.source} className="mt-1 block" />
                  </div>
                  <EvidenceButton item={item} onOpenMetric={onOpenMetric} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="watch-systems">
        <h3 id="watch-systems" className="mb-2 border-b border-[var(--line)] pb-1 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">
          {t(`ระบบเฝ้าระวังทั้งหมด (${board.systems.length})`, `All warning systems (${board.systems.length})`)}
        </h3>
        <ul className="flex flex-col divide-y divide-[var(--line)] border border-[var(--line)] bg-[var(--bg)]">
          {board.systems.map((item) => (
            <li key={item.id} className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 p-2 ${item.kind === "official" ? `border-l-4 ${OFFICIAL_FRAME[item.level] ?? OFFICIAL_FRAME.unknown}` : ""}`}>
              <LevelChip level={item.level} chipTh={item.chipTh} chipEn={item.chipEn} />
              <span className="text-[12px] font-semibold">{t(item.systemTh, item.systemEn)}</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--cool)]">{t(...KIND_LABEL[item.kind])}</span>
              <span className="min-w-0 flex-1 basis-52 text-[12px] text-[var(--ink)]">{t(item.valueTh, item.valueEn)}</span>
              <DataAge
                observedAt={item.observedAt}
                source={item.source}
                missing={item.kind === "imagery" ? t("ชั้นข้อมูลแผนที่", "map layer") : undefined}
                className="basis-full sm:basis-auto"
              />
              {item.openMetric && (
                <button
                  type="button"
                  onClick={() => onOpenMetric(item.openMetric!)}
                  className="min-h-11 shrink-0 border border-[var(--line)] px-2 text-[11px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--cool-dim)] sm:px-2.5"
                  title={t(`${item.systemTh} — เปิดหลักฐานประกอบ`, `${item.systemEn} — open the supporting evidence`)}
                >
                  {t("ดู", "View")}<span className="sr-only">{t(`หลักฐาน ${item.systemTh}`, ` evidence for ${item.systemEn}`)}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-snug text-[var(--dim)]">
          {t("ทุกระบบปรากฏทุกรอบ: ข้อมูลที่ไม่มีแสดงว่าไม่มีเสมอ — ไม่มีข้อมูลไม่ใช่การยืนยันความปลอดภัย", "Every system appears every cycle; a missing feed is a gap, never an all-clear.")}
        </p>
      </section>
    </section>
  );
}
