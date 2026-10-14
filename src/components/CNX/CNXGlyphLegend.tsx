"use client";

// The map's key. Every phenomenon that draws a mark on CNXMap appears here
// with the SAME shape it draws, and — the part that matters more — labelled
// with where the number came from.
//
// The board's standing rule is that "not enough data" must never render as
// green or authoritative. A legend that showed three blue swatches with no
// provenance would break exactly that rule while looking helpful: a reader
// would have no way to know that the rain DROPLETS are gauge totals measured
// on the ground and the rain RASTER is an Open-Meteo forecast for a different
// hour. Two blue things meaning different things is how a number/label split
// happens, so every row carries its origin.

import { useState } from "react";
import { glyphMarkup, type GlyphName } from "../../lib/cnx/map-glyphs";
import { useLang } from "../../hooks/useLang";

/**
 * How a mark is drawn on the map. Exported so a test can assert the legend
 * covers every way the map actually marks things — a legend that silently
 * omits a layer is worse than no legend, because it implies absence.
 */
export type LegendShape = "flame" | "droplet" | "arrow" | "streak" | "rainRamp" | "pmRamp" | "dot";

export interface LegendRow {
  id: string;
  shape: LegendShape;
  labelTh: string;
  labelEn: string;
  /** Provenance of the NUMBER behind the mark, in the operator's words. */
  originTh: string;
  originEn: string;
  /** Swatch colour, or null for the streaks/arrows which draw in ink. */
  color: string | null;
}

const FIRE_COLORS = { critical: "rgb(255,60,30)", alert: "rgb(255,140,0)", base: "rgb(255,200,0)" } as const;
const RAIN_COLORS = { heavy: "rgb(37,99,235)", moderate: "rgb(96,165,250)" } as const;

export const LEGEND_ROWS: LegendRow[] = [
  {
    id: "wind",
    shape: "arrow",
    labelTh: "ทิศลม (ลูกศรชี้ทางที่ลมพัดไป)",
    labelEn: "Wind direction (arrow points where the air is moving)",
    originTh: "แบบจำลอง",
    originEn: "model",
    color: null,
  },
  {
    id: "wind-streaks",
    shape: "streak",
    labelTh: "เส้นที่เคลื่อนคือลม (สว่างและเร็วกว่าคือลมแรงกว่า)",
    labelEn: "Moving lines are wind (brighter and faster means stronger)",
    originTh: "แบบจำลอง",
    originEn: "model",
    color: null,
  },
  {
    id: "rain-gauge",
    shape: "droplet",
    labelTh: "ฝน 24 ชม. ที่สถานีวัด",
    labelEn: "Rain 24 h at gauges",
    originTh: "วัดจริง",
    originEn: "measured",
    color: RAIN_COLORS.heavy,
  },
  {
    id: "rain-forecast",
    shape: "rainRamp",
    labelTh: "ฝนพยากรณ์ เป็นสีบนแผนที่ (มม./ชม.)",
    labelEn: "Rain forecast, the colour wash (mm/h)",
    originTh: "แบบจำลอง",
    originEn: "model",
    color: "rgb(8,81,156)",
  },
  {
    id: "fire",
    shape: "flame",
    labelTh: "จุดความร้อน (ขนาดตามพลังงานความร้อน)",
    labelEn: "Fire hotspots (size = radiative power)",
    originTh: "ดาวเทียม",
    originEn: "satellite",
    color: FIRE_COLORS.alert,
  },
  {
    id: "pm25",
    shape: "pmRamp",
    labelTh: "PM2.5 (µg/m³)",
    labelEn: "PM2.5 (µg/m³)",
    originTh: "แบบจำลอง",
    originEn: "model",
    color: "rgb(234,88,12)",
  },
  {
    id: "citizen",
    shape: "dot",
    labelTh: "รายงานจากประชาชน/สื่อ",
    labelEn: "Citizen and media reports",
    originTh: "การรายงาน",
    originEn: "reported",
    color: "rgb(147,51,234)",
  },
  {
    id: "gauge",
    shape: "dot",
    labelTh: "สถานีวัดระดับน้ำ",
    labelEn: "River gauges",
    originTh: "วัดจริง",
    originEn: "measured",
    color: "rgb(29,78,216)",
  },
];

/** Swatch for one row — same geometry as the map mark it explains. */
export function LegendSwatch({ shape, color }: { shape: LegendShape; color: string | null }) {
  if (shape === "flame" || shape === "droplet") {
    return <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center" dangerouslySetInnerHTML={{ __html: glyphMarkup(shape as GlyphName, 16, color ?? "currentColor") }} />;
  }
  if (shape === "arrow") {
    // The map arrow points downwind; the swatch must not imply otherwise.
    return <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center" dangerouslySetInnerHTML={{ __html: glyphMarkup("arrow", 16, color ?? "currentColor") }} />;
  }
  if (shape === "streak") {
    return (
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M1 8h7M5 4h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (shape === "rainRamp" || shape === "pmRamp") {
    const stops = shape === "rainRamp" ? ["rgba(158,202,225,.6)", "rgb(66,146,198)", "rgb(8,81,156)"] : ["rgba(234,179,8,.5)", "rgb(234,88,12)", "rgb(220,38,38)"];
    return (
      <span
        aria-hidden="true"
        className="inline-block h-2 w-6 align-middle"
        style={{ background: `linear-gradient(90deg, ${stops.join(", ")})` }}
      />
    );
  }
  return <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: color ?? "currentColor" }} />;
}

export default function CnxGlyphLegend() {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const th = lang === "th";

  return (
    // top-10, not top-2: CNXMap already owns the top-right corner with the
    // flight-count badge (and the top-left with its layer <details>), so
    // sitting at top-2 would stack the key underneath the badge.
    <section
      aria-label={th ? "กุญแจสัญลักษณ์บนแผนที่" : "Map symbol key"}
      className="pointer-events-auto absolute right-2 top-10 z-10 border border-[var(--line)] bg-[var(--bg-raised)] text-[var(--ink)]"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-9 items-center gap-2 px-2 text-[12px] font-semibold"
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        <span className="flex flex-col items-start leading-tight">
          <span>{th ? "กุญแจสัญลักษณ์" : "Symbol key"}</span>
          <span className="font-normal text-[var(--dim)]">{th ? "เส้นที่เคลื่อนคือลม" : "Moving lines are wind"}</span>
        </span>
      </button>
      {open && (
        <ul className="max-h-[52vh] overflow-y-auto border-t border-[var(--line)] px-2 py-1.5 text-[12px]">
          {LEGEND_ROWS.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-[3px]">
              <LegendSwatch shape={r.shape} color={r.color} />
              <span className="min-w-0 flex-1 leading-snug">{th ? r.labelTh : r.labelEn}</span>
              <span className="shrink-0 text-[11px] text-[var(--dim)]">{th ? r.originTh : r.originEn}</span>
            </li>
          ))}
          <li className="mt-1 border-t border-[var(--line)] pt-1 text-[11px] leading-snug text-[var(--dim)]">
            {th
              ? "คอลัมน์ขวาบอกที่มาของตัวเลข: วัดจริง = วัดจากพื้นดิน · แบบจำลอง = คำนวณล่วงหน้า ไม่ใช่ค่าที่เกิดขึ้นแล้ว"
              : "Right column says where the number comes from: measured = observed on the ground · model = computed ahead, not an observation"}
          </li>
        </ul>
      )}
    </section>
  );
}