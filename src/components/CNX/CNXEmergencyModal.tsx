"use client";

// CNX emergency hotline modal — a compact, storm-ready quick-reference
// card. Same shell as CNXManualModal / CNXStoryModal, but styled with
// a danger accent since this one matters most when things are already
// going wrong.
//
// Curated from three sources so numbers aren't invented:
//   - Chiang Mai PAO / municipal storm hotlines (operator-provided,
//     Sep 2026)
//   - changpuakmagazine.com/en-article/EMERGENCY/751083
//   - chiangmailocator.com/wiki-emergency-telephone-numbers-chiang-mai-p98
// Every entry keeps its source so a stale number can be traced back
// and re-verified rather than silently trusted forever.

import { useEffect } from "react";
import { X, PhoneCall } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface HotlineEntry {
  label: string;
  phone: string;
  note?: string;
}

interface HotlineGroup {
  title: string;
  source: string;
  entries: HotlineEntry[];
}

const GROUPS: HotlineGroup[] = [
  {
    title: "Storm / flood response (Chiang Mai municipal)",
    source: "Operator-provided, Sep 2026",
    entries: [
      { label: "CMFORCE (Chiang Mai Municipality)", phone: "083-905-3186 / 062-112-2500" },
      { label: "Chiang Mai Provincial Hotline", phone: "1567" },
      { label: "Traffic / Flooded Roads / Accidents", phone: "053-235595" },
      { label: "Chiang Mai PAO EMS (Medical Emergency)", phone: "1669" },
    ],
  },
  {
    title: "General emergency",
    source: "changpuakmagazine.com/en-article/EMERGENCY/751083",
    entries: [
      { label: "Police / Emergency / Crime", phone: "191" },
      { label: "Fire Department", phone: "199" },
      { label: "Ambulance (nationwide)", phone: "1669" },
      { label: "Tourist Police", phone: "1155 / 1699" },
      { label: "Traffic Police", phone: "1197" },
      { label: "Traffic Accident", phone: "1193" },
      { label: "Vehicle Theft Police", phone: "1192" },
      { label: "Chiang Mai Immigration", phone: "053-201-755" },
    ],
  },
  {
    title: "Hospitals",
    source: "chiangmailocator.com/wiki-emergency-telephone-numbers-chiang-mai-p98",
    entries: [
      { label: "Maharaj Hospital (CMU)", phone: "053-947-000" },
      { label: "Chiang Mai Ram Hospital", phone: "053-920-300" },
      { label: "Nakornping Hospital", phone: "053-999-200" },
      { label: "Lanna Hospital", phone: "053-999-777" },
      { label: "McCormick Hospital", phone: "053-921-777" },
    ],
  },
];

export default function CnxEmergencyModal({ isOpen, onClose }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cnx-emergency-heading"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[88vh] w-full max-w-[640px] overflow-y-auto border-2 border-[var(--danger)] bg-[var(--bg-raised)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close emergency numbers"
          className="absolute right-3 top-3 rounded-full border border-[var(--line)] p-1 text-[var(--dim)] hover:bg-[var(--sun-dim)] hover:text-[var(--ink)]"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-1 flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-[var(--danger)]" />
          <h2 id="cnx-emergency-heading" className="text-[20px] font-bold text-[var(--ink)]">
            Emergency Hotlines — Chiang Mai
          </h2>
        </div>
        <p className="mb-5 text-[12px] text-[var(--dim)]">
          Storm and flood response numbers first, then general emergency and hospitals.
        </p>

        <div className="space-y-5">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--cool)]">
                  {g.title}
                </h3>
                <span className="truncate font-mono text-[8px] text-[var(--dim)]">{g.source}</span>
              </div>
              <ul className="divide-y divide-[var(--line)] border border-[var(--line)]">
                {g.entries.map((e) => (
                  <li key={e.label} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="text-[12px] text-[var(--ink)]">{e.label}</span>
                    <a
                      href={`tel:${e.phone.replace(/[^\d+]/g, "").split("/")[0]}`}
                      className="shrink-0 font-mono text-[13px] font-bold tabular-nums text-[var(--danger)] hover:underline"
                    >
                      {e.phone}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-[var(--line)] pt-3 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--dim)]">
          <span>Verify before publishing to the public — numbers can go stale</span>
          <span>Press ESC to close</span>
        </div>
      </div>
    </div>
  );
}
