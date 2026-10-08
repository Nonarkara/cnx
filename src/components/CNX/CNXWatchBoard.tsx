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
import { fetchJsonOrNull } from "../../lib/client-requests";
import { buildWatchList, type WatchItem, type WatchKind } from "../../lib/cnx/watch-list";
import { DataAge } from "./CNXDataAge";

const LEVEL_CLASSES: Record<string, string> = {
  unknown: "bg-[var(--line)] text-[var(--dim)]",
  good: "bg-[var(--success)] text-white",
  watch: "bg-[#f99d1b] text-black",
  alert: "bg-[#fb923c] text-black",
  critical: "bg-[var(--danger)] text-white",
};
const LEVEL_TH: Record<string, string> = { unknown: "ไม่มีข้อมูล", good: "ปกติ", watch: "เฝ้าระวัง", alert: "เตือนภัย", critical: "วิกฤต" };
const KIND_TH: Record<WatchKind, string> = { measured: "ภาคพื้นดิน", satellite: "ดาวเทียม", model: "โมเดล", vision: "กล้อง", imagery: "ภาพ" };

function LevelChip({ level }: { level: string }) {
  return <span className={`shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] ${LEVEL_CLASSES[level] ?? LEVEL_CLASSES.unknown}`}>{LEVEL_TH[level] ?? level}</span>;
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
  onOpenMetric: (id: "water" | "air" | "fire" | "mobility" | "model" | "watch") => void;
}

function EvidenceButton({ item, onOpenMetric }: { item: WatchItem; onOpenMetric: Props["onOpenMetric"] }) {
  if (!item.openMetric) return null;
  return (
    <button
      type="button"
      onClick={() => onOpenMetric(item.openMetric!)}
      className="min-h-11 shrink-0 self-center rounded-sm border border-[var(--line)] px-3 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--cool-dim)]"
    >
      ดูหลักฐาน <span className="text-[10px] text-[var(--dim)]">Evidence</span>
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
  onOpenMetric,
}: Props) {
  const [aeronet, setAeronet] = useState<AeronetResponse | null>(null);
  const [jaxa, setJaxa] = useState<JaxaAotResponse | null>(null);
  const [floodhub, setFloodhub] = useState<FloodHubResponse | null>(null);
  const [gistda, setGistda] = useState<GistdaPm25Response | null>(null);

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
    () => buildWatchList({ metrics, firesRfd, aerosol, aeronet, jaxa, floodhub, gistda, smoke, hazeVision, dustboy, weatherLayers, riverGauges, rain }),
    [metrics, firesRfd, aerosol, aeronet, jaxa, floodhub, gistda, smoke, hazeVision, dustboy, weatherLayers, riverGauges, rain],
  );

  return (
    <section aria-label="Province watch list" className="flex flex-col gap-4 p-3">
      <header className="flex flex-wrap items-center gap-2">
        <Satellite aria-hidden="true" className="h-4 w-4 text-[var(--cool)]" />
        <h2 lang="th" className="text-[14px] font-bold">เฝ้าระวังเชียงใหม่</h2>
        <span className="text-[11px] text-[var(--dim)]">What Chiang Mai must watch now</span>
        <span className="ml-auto flex items-center gap-2">
          {board.attentionCount > 0 && (
            <span className="flex items-center gap-1 rounded-sm bg-[var(--sun-dim)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--sun)]">
              <AlertTriangle aria-hidden="true" className="h-3 w-3" /> {board.attentionCount} จุดเฝ้าระวัง
            </span>
          )}
          {board.gapCount > 0 && (
            <span className="rounded-sm bg-[var(--line)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--dim)]" title="ข้อมูลที่ไม่มีจะแสดงว่าไม่มีเสมอ">
              {board.gapCount} ระบบไม่มีข้อมูล
            </span>
          )}
        </span>
      </header>

      <section aria-label="Watching now" aria-labelledby="watch-now">
        <h3 id="watch-now" lang="th" className="mb-2 border-b border-[var(--line)] pb-1 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">
          ต้องเฝ้าระวังตอนนี้ · Watching now
        </h3>
        {board.watch.length === 0 ? (
          <p className="rounded-sm border border-[var(--line)] bg-[var(--bg)] p-3 text-[12px] text-[var(--dim)]">
            <span lang="th">ไม่มีสัญญาณเฝ้าระวังจากข้อมูลที่วัดได้ในขณะนี้ — ไม่ใช่การยืนยันว่าทั้งจังหวัดปลอดภัย</span>
            <span className="block text-[11px]">No current concern from measured evidence; this is not a province-wide all-clear.</span>
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {board.watch.map((item) => (
              <li key={item.id} className="rounded-sm border border-[var(--line)] bg-[var(--bg)] p-2.5">
                <div className="flex items-start gap-2">
                  <LevelChip level={item.level} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold"><span lang="th">{item.systemTh}</span> <span className="text-[10px] font-normal text-[var(--dim)]">{KIND_TH[item.kind]}</span></p>
                    <p lang="th" className="mt-0.5 text-[13px] text-[var(--ink)]">{item.valueTh}</p>
                    <p className="sr-only">{item.valueEn}</p>
                    {item.actionTh && <p lang="th" className="mt-1 text-[12px] font-semibold text-[var(--sun)]">▸ {item.actionTh}</p>}
                    <p lang="th" className="mt-1 text-[11px] leading-snug text-[var(--dim)]">{item.evidenceTh}</p>
                    <p className="sr-only">{item.evidenceEn}</p>
                    <DataAge observedAt={item.observedAt} source={item.source} className="mt-1 block" />
                  </div>
                  <EvidenceButton item={item} onOpenMetric={onOpenMetric} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="All warning systems" aria-labelledby="watch-systems">
        <h3 id="watch-systems" lang="th" className="mb-2 border-b border-[var(--line)] pb-1 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">
          ระบบเฝ้าระวังทั้งหมด ({board.systems.length}) · All warning systems
        </h3>
        <ul className="flex flex-col divide-y divide-[var(--line)] rounded-sm border border-[var(--line)] bg-[var(--bg)]">
          {board.systems.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 p-2">
              <LevelChip level={item.level} />
              <span lang="th" className="text-[12px] font-semibold">{item.systemTh}</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--cool)]">{KIND_TH[item.kind]}</span>
              <span lang="th" className="min-w-0 flex-1 basis-52 text-[12px] text-[var(--ink)]">{item.valueTh}</span>
              <span className="sr-only">{item.valueEn}</span>
              <DataAge
                observedAt={item.observedAt}
                source={item.source}
                missing={item.kind === "imagery" ? "ชั้นข้อมูลแผนที่ · map layer" : undefined}
                className="basis-full sm:basis-auto"
              />
              {item.openMetric && (
                <button
                  type="button"
                  onClick={() => onOpenMetric(item.openMetric!)}
                  className="min-h-11 shrink-0 rounded-sm border border-[var(--line)] px-2 text-[11px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--cool-dim)] sm:px-2.5"
                  title={`${item.systemTh} — เปิดหลักฐานประกอบ`}
                >
                  ดู<span className="sr-only">หลักฐาน {item.systemTh}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
        <p lang="th" className="mt-2 text-[11px] leading-snug text-[var(--dim)]">
          ทุกระบบปรากฏทุกรอบ: ข้อมูลที่ไม่มีแสดงว่าไม่มีเสมอ — ไม่มีข้อมูลไม่ใช่การยืนยันความปลอดภัย · Every system appears every cycle; a missing feed is a gap, never an all-clear.
        </p>
      </section>
    </section>
  );
}
