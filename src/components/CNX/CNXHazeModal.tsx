"use client";

// Haze Watch — one screen that puts every haze signal side by side, each
// with its source, age and limits: ground monitors (PCD Air4Thai, CMU
// DustBoy), model (Open-Meteo CAMS), satellite (MODIS AOD) and ground
// photometer (NASA AERONET), webcam haze scoring, and citizen / local-news
// reports. Nothing here is fused into one number — disagreements between
// sources are information the operator should see.

import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import type { AeronetResponse } from "../../lib/cnx/aeronet";
import type { CitizenResponse } from "../../lib/cnx/citizen-reports";
import type { DustboyResponse } from "../../lib/cnx/dustboy";
import type { SmokeTrajectoryResponse } from "../../lib/cnx/smoke-trajectory";
import type { CameraHaze, HazeVisionResponse } from "../../lib/cnx/haze-vision";
import { MIN_BASELINE_SAMPLES, type HazeLabel } from "../../lib/cnx/haze-vision-core";
import type { AerosolResponse } from "../../lib/cnx/aerosol";
import type { AirQualityResponse } from "../../types/cnx";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  air: AirQualityResponse | null;
  aerosol: AerosolResponse | null;
  dustboy: DustboyResponse | null;
  hazeVision: HazeVisionResponse | null;
  citizen: CitizenResponse | null;
  smoke: SmokeTrajectoryResponse | null;
}

const VERDICT: Record<HazeLabel, { th: string; en: string; cls: string }> = {
  "haze-likely": { th: "น่าจะมีหมอกควัน", en: "Haze likely", cls: "border-[var(--danger)] text-[var(--danger)]" },
  "some-haze": { th: "มีหมอกควันบ้าง", en: "Some haze", cls: "border-[var(--sun)] text-[var(--ink)]" },
  clear: { th: "ฟ้าใส", en: "Clear", cls: "border-[var(--cool)] text-[var(--cool)]" },
  "too-dark": { th: "มืดเกินประเมิน", en: "Too dark to judge", cls: "border-[var(--line)] text-[var(--dim)]" },
  calibrating: { th: "กำลังเรียนรู้ภาพฟ้าใส", en: "Calibrating", cls: "border-[var(--line)] text-[var(--dim)]" },
};

function ago(iso: string | undefined | null): string {
  if (!iso) return "—";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min)) return "—";
  if (min < 60) return `${Math.max(0, min)} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} d ago`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="border border-[var(--line)] bg-[var(--bg-surface)] p-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--dim)]">{label}</div>
      <div className="mt-1 text-[22px] font-bold tabular-nums text-[var(--ink)]">{value}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-[var(--dim)]">{sub}</div>
    </div>
  );
}

function CameraCard({ cam }: { cam: CameraHaze }) {
  const v = VERDICT[cam.verdict];
  return (
    <figure className="border border-[var(--line)] bg-[var(--bg-surface)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cam.snapshotUrl} alt={cam.label} loading="lazy" className="aspect-video w-full object-cover" />
      <figcaption className="space-y-1 p-2 text-[11px]">
        <div className="truncate font-bold text-[var(--ink)]" title={cam.label}>{cam.label}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] ${v.cls}`}>
            {v.en} · <span lang="th">{v.th}</span>
          </span>
          {cam.score !== null && <span className="font-mono tabular-nums text-[var(--dim)]">score {cam.score.toFixed(2)}</span>}
        </div>
        <div className="text-[var(--dim)]">
          frame taken {ago(cam.observedAt)}
          {cam.verdict === "calibrating" && ` · ${cam.baselineSamples}/${MIN_BASELINE_SAMPLES} daylight frames`}
        </div>
        <div className="text-[var(--dim)]">
          {cam.nearestPm25
            ? `nearest DustBoy ${cam.nearestPm25.distanceKm} km: PM2.5 ${cam.nearestPm25.pm25} µg/m³`
            : "no DustBoy sensor reporting within 15 km"}
        </div>
      </figcaption>
    </figure>
  );
}

export default function CnxHazeModal({ isOpen, onClose, air, aerosol, dustboy, hazeVision, citizen, smoke }: Props) {
  const [aeronet, setAeronet] = useState<AeronetResponse | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    if (!aeronet) void fetchJsonOrNull<AeronetResponse>("/api/cnx/aeronet").then(setAeronet);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, aeronet]);

  if (!isOpen) return null;

  const pcd = (air?.stations ?? []).filter((s) => s.source === "pcd");
  const model = (air?.stations ?? []).filter((s) => s.source === "open-meteo");
  const avg = (xs: (number | undefined)[]) => {
    const v = xs.filter((x): x is number => typeof x === "number");
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const pcdAvg = avg(pcd.map((s) => s.pm25));
  const modelAvg = avg(model.map((s) => s.pm25));
  const cams = hazeVision?.cameras ?? [];
  const hazyCams = cams.filter((c) => c.verdict === "haze-likely" || c.verdict === "some-haze").length;
  const reports = citizen?.reports ?? [];
  const agreement = hazeVision?.agreement;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Haze watch"
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative my-6 w-full max-w-[1100px] border border-[var(--line)] bg-[var(--bg)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close haze watch"
          className="absolute right-4 top-4 rounded-full border border-[var(--line)] bg-[var(--bg-raised)] p-1.5 text-[var(--dim)] hover:text-[var(--ink)]"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--cool)]">Haze watch</div>
        <h2 lang="th" className="mt-1 text-[22px] font-bold text-[var(--ink)]">เฝ้าระวังหมอกควัน — ทุกแหล่งข้อมูลเทียบกัน</h2>
        <p className="mt-1 max-w-[80ch] text-[13px] leading-relaxed text-[var(--dim)]">
          Every haze signal side by side with its source and age. They are not merged into one number: ground
          sensors, a forecast model, satellites, cameras and people each see something different, and disagreement is
          worth noticing.
        </p>

        <section className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="PCD ground (Air4Thai)"
            value={pcdAvg === null ? "—" : `${pcdAvg}`}
            sub={pcd.length ? `µg/m³ · ${pcd.length} official monitor(s) · ${ago(pcd[0]?.observedAt)}` : "no fresh PCD reading"}
          />
          <Stat
            label="DustBoy ground (CMU)"
            value={dustboy?.basin.chiangMai.avgPm25 != null ? `${dustboy.basin.chiangMai.avgPm25}` : "—"}
            sub={
              dustboy?.provenance === "live" && dustboy.basin.chiangMai.onlineCount > 0
                ? `µg/m³ · Chiang Mai ${dustboy.basin.chiangMai.onlineCount} online · upper north ${dustboy.basin.avgPm25 ?? "—"} (${dustboy.basin.onlineCount})`
                : `${dustboy?.basin.stationCount ?? 0} sensors, none with a Chiang Mai reading < 3 h old`
            }
          />
          <Stat
            label="Model (Open-Meteo CAMS)"
            value={modelAvg === null ? "—" : `${modelAvg}`}
            sub={`µg/m³ · forecast model, ${model.length} grid points — not a measurement`}
          />
          <Stat
            label="Satellite AOD (MODIS)"
            value={aerosol ? aerosol.aod550.toFixed(2) : "—"}
            sub="aerosol optical depth, 550 nm · >0.5 = heavy smoke"
          />
          <Stat
            label="Ground AOD (AERONET)"
            value={aeronet?.latest ? aeronet.latest.aod500.toFixed(2) : "—"}
            sub={aeronet?.latest ? `500 nm · ${aeronet.latest.date} · Level 1.5 provisional` : aeronet ? "no reading in 30 days" : "loading…"}
          />
          <Stat
            label="Webcams"
            value={cams.length ? `${hazyCams}/${cams.length}` : "—"}
            sub={cams.length ? "cameras showing haze" : hazeVision?.note ?? "loading…"}
          />
        </section>

        <section className="mt-6">
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
            Where the smoke is going (6 h)
          </h3>
          <p className="mt-1 max-w-[90ch] text-[12px] leading-relaxed text-[var(--dim)]">
            {smoke?.methodology_en ?? "Straight-line advection from surface wind. Not a forecast."}
          </p>
          {smoke?.provenance === "live" ? (
            <p className="mt-2 text-[13px] text-[var(--ink)]">
              Wind {smoke.wind ? `${smoke.wind.speedKmh} km/h from ${smoke.wind.fromDirectionDeg}°` : "unavailable"}.
              {" "}Fires sit <span className="font-semibold">{smoke.summary.origin_en}</span>
              {" "}(<span lang="th">{smoke.summary.origin_th}</span>).
              {" "}{smoke.summary.nearCnx} plume{smoke.summary.nearCnx === 1 ? "" : "s"} within 50 km of the city,
              {" "}{smoke.summary.hitsCnx} enter the province,
              {" "}{smoke.summary.total} detection{smoke.summary.total === 1 ? "" : "s"} in the 350 km window
              {smoke.summary.shown < smoke.summary.total ? ` (map shows ${smoke.summary.shown})` : ""}.
            </p>
          ) : (
            <p className="mt-2 border border-[var(--line)] bg-[var(--bg-surface)] p-3 text-[12px] text-[var(--dim)]">
              {smoke?.note ?? "Loading the live VIIRS pass…"}
            </p>
          )}
        </section>

        <section className="mt-6">
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">Webcam haze scoring</h3>
          <p className="mt-1 max-w-[90ch] text-[12px] leading-relaxed text-[var(--dim)]">{hazeVision?.methodology}</p>
          <p className="mt-1 text-[12px] text-[var(--ink)]">
            {agreement && agreement.r !== null
              ? `Agreement with nearest DustBoy sensor so far: r = ${agreement.r.toFixed(2)} over ${agreement.pairs} frame/sensor pairs.`
              : `Not enough frames paired with a live ground sensor yet to measure agreement (${agreement?.pairs ?? 0} pairs; needs 8).`}
          </p>
          {cams.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
              {cams.map((c) => (
                <CameraCard key={c.cameraId} cam={c} />
              ))}
            </div>
          ) : (
            <p className="mt-3 border border-[var(--line)] bg-[var(--bg-surface)] p-3 text-[12px] text-[var(--dim)]">
              {hazeVision?.note ?? "Loading…"} Public Chiang Mai webcams (Windy) refresh only a few times a day, and frames
              older than 6 h are not scored.
            </p>
          )}
        </section>

        <section className="mt-6">
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
            Citizen &amp; local-news reports ({reports.length}, last 7 days)
          </h3>
          <p className="mt-1 max-w-[90ch] text-[12px] leading-relaxed text-[var(--dim)]">{citizen?.note}</p>
          {reports.length > 0 ? (
            <ul className="mt-2 divide-y divide-[var(--line)] border border-[var(--line)]">
              {reports.slice(0, 60).map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2 text-[12px]">
                  <span className="font-mono text-[9px] uppercase text-[var(--cool)]">{r.source === "reddit" ? "Reddit" : "News"}</span>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" lang="th" className="min-w-0 flex-1 text-[var(--ink)] hover:underline">
                    {r.title} <ExternalLink className="inline h-3 w-3" />
                  </a>
                  <span className="text-[var(--dim)]">
                    {r.place
                      ? `📍 ${r.place.nameEn || r.place.nameTh} (±${r.place.precisionKm} km)`
                      : "no place named — not pinned"}{" "}
                    · {ago(r.publishedAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-[var(--dim)]">No haze reports in the last 7 days.</p>
          )}
          {citizen && citizen.sources.length > 0 && (
            <p className="mt-2 font-mono text-[10px] text-[var(--dim)]">
              Sources this cycle: {citizen.sources.map((s) => `${s.label} ${s.ok ? `✓ ${s.items}` : "✗ failed"}`).join(" · ")}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
