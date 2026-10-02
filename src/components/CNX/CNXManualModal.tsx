"use client";

// CNX manual modal — same shape as Lopburi's manual: a quick
// walkthrough of the dashboard's streams and the data source behind
// each one. Diagrams over text, per the user's preference.

import { useModalDialog } from "../../hooks/useModalDialog";
import { X } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function CnxManualModal({ isOpen, onClose }: Props) {
  const dialogRef = useModalDialog(isOpen, onClose);

  if (!isOpen) return null;
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cnx-manual-heading"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[88vh] w-full max-w-[920px] overflow-y-auto border border-[var(--line)] bg-[var(--bg-raised)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close manual"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] text-[var(--dim)] hover:bg-[var(--sun-dim)] hover:text-[var(--ink)]"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 id="cnx-manual-heading" className="mb-1 pr-12 text-[20px] font-bold text-[var(--ink)]">
          CNX Dashboard Manual
        </h2>
        <p className="mb-5 text-[12px] text-[var(--dim)]">
          How to read the Chiang Mai war room — and where every number comes from.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Architecture diagram — keeps the user's "diagrams over text" preference */}
          <div className="rounded border border-[var(--line)] bg-[var(--bg)] p-4">
            <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--cool)]">
              Architecture
            </div>
            <pre className="overflow-x-auto text-[10px] leading-relaxed text-[var(--ink)]">
{`┌─────────────── CNX Dashboard ───────────────┐
│                                              │
│  Top bar   (identity + source/status pills)  │
│  CCTV strip (snapshots / available streams)     │
│  ┌─────────┬───────────────┬────────────┐    │
│  │ Social  │  Map + planes │ Flood /    │    │
│  │ listen. │  + heritage   │ Air /Fire  │    │
│  │  (left) │  + buildings  │  (right)   │    │
│  │         │   (3D toggle) │            │    │
│  │         │               ├ Open data  │    │
│  │         │               │  (right)   │    │
│  └─────────┴───────────────┴────────────┘    │
│  Ticker  (feeds · fires · flights · news)     │
└──────────────────────────────────────────────┘`}
            </pre>
          </div>

          <div className="space-y-2 text-[11px] text-[var(--ink)]">
            <h3 className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--cool)]">
              Stream → Source
            </h3>
            <ul className="space-y-1.5">
              <li><strong>Social listening</strong> · Google News RSS (TH+EN) + GDELT 2.0</li>
              <li><strong>Flood</strong> · Google Flood Hub (riverine model at virtual gauges) — labelled scenario values when the model is unavailable; <strong>separate from measured river levels</strong></li>
              <li><strong>Measured river levels</strong> · ThaiWater Ping-basin physical gauges, observation times and published critical levels where available; bank-level distance is a separate field</li>
              <li><strong>Air quality</strong> · PCD official monitors + Open-Meteo CAMS model grids (Copernicus), labeled separately</li>
              <li><strong>Fires</strong> · NASA FIRMS (VIIRS SNPP / NOAA-20)</li>
              <li><strong>CCTV</strong> · Windy webcam snapshots + available Longdo/iTIC feeds; public road/flood camera catalogues credit each operating agency</li>
              <li><strong>Heritage</strong> · curated (Wat Phra Singh, Doi Suthep, …)</li>
              <li><strong>Open Data</strong> · data.go.th CKAN catalogue for Chiang Mai; current available records are listed in the Data workbench</li>
              <li><strong>Flights</strong> · OpenSky Network /states/all bbox 17.5–20.5°N / 97.5–100.5°E</li>
            </ul>
          </div>

          <div className="rounded border border-[var(--line)] bg-[var(--bg)] p-4 md:col-span-2">
            <h3 className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--cool)]">
              Scenario URLs
            </h3>
            <p className="mb-3 text-[11px] text-[var(--dim)]">
              Deterministic demo states for screen-grabs and sales walks:
            </p>
            <div className="grid gap-1.5 md:grid-cols-2">
              <code className="rounded bg-[var(--cool-dim)] px-2 py-1 font-mono text-[10px] text-[var(--ink)]">?scenario=burning-season-peak</code>
              <code className="rounded bg-[var(--cool-dim)] px-2 py-1 font-mono text-[10px] text-[var(--ink)]">?scenario=monsoon-flood-watch</code>
              <code className="rounded bg-[var(--cool-dim)] px-2 py-1 font-mono text-[10px] text-[var(--ink)]">?scenario=songkran-surge-week</code>
              <code className="rounded bg-[var(--cool-dim)] px-2 py-1 font-mono text-[10px] text-[var(--ink)]">?scenario=stable-winter-day</code>
            </div>
          </div>

          <div className="md:col-span-2">
            <h3 className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--cool)]">
              Keyboard shortcuts
            </h3>
            <ul className="grid grid-cols-2 gap-1 text-[11px] text-[var(--ink)] md:grid-cols-4">
              <li><code className="rounded bg-[var(--bg)] px-1 py-0.5 text-[10px]">S</code> · story modal</li>
              <li><code className="rounded bg-[var(--bg)] px-1 py-0.5 text-[10px]">M</code> · this manual</li>
              <li><code className="rounded bg-[var(--bg)] px-1 py-0.5 text-[10px]">Esc</code> · close modal</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-[var(--line)] pt-3 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--dim)]">
          <span>© Dr Non · cnx.nonarkara.org</span>
          <span>Press ESC to close</span>
        </div>
      </div>
    </div>
  );
}