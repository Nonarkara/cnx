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
export type LegendShape = "flame" | "droplet" | "arrow" | "streak" | "smoke" | "rainRamp" | "pmRamp" | "dot" | "compound" | "roof";

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
    id: "smoke", shape: "smoke",
    labelTh: "แนวพาควันจำลอง · 0–6 ชม.", labelEn: "Modeled smoke transport · 0–6 h",
    originTh: "แบบจำลอง", originEn: "model", color: "var(--cool)",
  },
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
    // NOT "arrow". The map draws these as many short STROKED shafts with an
    // open V head; the city row above is one solid filled dart. Giving both
    // rows the "arrow" swatch put the same shape in front of the operator
    // twice with different captions, and the caption is the only thing left
    // to tell two model-sourced wind marks apart.
    shape: "streak",
    labelTh: "ลูกศรลมเคลื่อนที่ (การเคลื่อนที่และความสว่างแสดงความเร็ว)",
    labelEn: "Moving wind arrows (motion and brightness = speed)",
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
    labelTh: "สีฝนพยากรณ์บนแผนที่ (มม./ชม.)",
    labelEn: "Forecast rain wash (mm/h)",
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
    // The temple compounds are the one layer on this map that mixes a
    // survey with a model in the SAME picture, so the key has to show
    // both at once: the saturated square is a mapped footprint, the
    // faded one is the compound grammar's. A single swatch would let a
    // modelled chedi be read as a surveyed one.
    id: "temple-compound",
    shape: "compound",
    labelTh: "อาณาจักรวัด (กำแพง ประตู ลาน โบสถ์ เจดีย์)",
    labelEn: "Temple compounds (wall, gate, court, halls, chedi)",
    originTh: "ผังจริง + แบบจำลอง",
    originEn: "mapped + model",
    color: "rgb(245,158,11)",
  },
  {
    // The roofs are the one thing on this board whose FORM is entirely
    // the model's: OpenStreetMap carries roof tags for 0.26% of the
    // Old City's buildings, so which roof a building gets is decided by
    // a stated rule, not read off the map. The key has to say so.
    id: "roofs",
    shape: "roof",
    labelTh: "หลังคาอาคาร (จั่ว / แบน)",
    labelEn: "Building roofs (schematic gable / flat)",
    originTh: "แบบจำลอง",
    originEn: "model",
    color: "rgb(168,78,46)",
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
    // Mirrors the mark CNXForecastLayer actually draws: a shaft ending in an
    // OPEN V head (forecast-render `windArrowSegments` returns a bar and two
    // barbs, stroked — never filled). The previous swatch was two bare
    // parallel lines with no head at all, so it matched neither wind mark.
    return (
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M1 8H9.5M9 4.5 13 8l-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
  if (shape === "roof") {
    // The two roof kinds, as the map draws them: a tiled gable and a
    // flat concrete cap. The key has to show BOTH, because the whole
    // point of the roof layer is that an operator can tell them apart.
    return (
      <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-[3px]">
        <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
          <path d="M1 11 L7 2 L13 11 Z" fill={color ?? "rgb(168,78,46)"} />
        </svg>
        <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
          <rect x="1" y="7" width="12" height="3" fill="rgb(126,130,134)" />
        </svg>
      </span>
    );
  }
  if (shape === "compound") {
    return (
      <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-[2px]">
        <span className="inline-block h-2.5 w-2.5" style={{ background: "rgb(245,158,11)" }} />
        <span className="inline-block h-2.5 w-2.5" style={{ background: "rgb(232,165,60)", opacity: 0.5 }} />
      </span>
    );
  }
  if (shape === "smoke") return <svg aria-hidden="true" className="h-3.5 w-6 shrink-0" viewBox="0 0 24 14"><path d="M3 3 L8 7 L3 11 M14 3 L19 7 L14 11" fill="none" stroke={color ?? "currentColor"} strokeWidth="2" /></svg>;
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
    //
    // The width cap matters as much as the offset. An absolutely positioned
    // box with no width shrink-wraps to its longest label, which is longer
    // than the map itself — measured at a 513 px viewport the open key covered
    // ~95% of the map's width and ~54% of its height. The map is the hero of
    // this board; a key that hides it when opened is worse than no key. Capped
    // so a column of map stays visible on the left, and the list scrolls.
    <section
      aria-label={th ? "กุญแจสัญลักษณ์บนแผนที่" : "Map symbol key"}
      data-cnx-map-ui
      className={`pointer-events-auto absolute right-2 top-10 z-10 flex max-h-[calc(100%_-_8.5rem)] flex-col ${open ? "w-[min(20rem,calc(100%_-_1rem))]" : "max-w-[calc(100%_-_1rem)]"} border border-[var(--line)] bg-[var(--bg-raised)] text-[var(--ink)]`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-9 shrink-0 items-center gap-2 px-2 text-[12px] font-semibold"
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        {th ? "สัญลักษณ์ · ลมและควัน" : "Symbols · wind & smoke"}
      </button>
      {open && (
        <ul className="min-h-0 max-h-[52vh] overflow-y-auto border-t border-[var(--line)] px-2 py-1.5 text-[12px]">
          {LEGEND_ROWS.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-[3px]">
              <LegendSwatch shape={r.shape} color={r.color} />
              <span className="min-w-0 flex-1 leading-snug">{th ? r.labelTh : r.labelEn}</span>
              <span className="shrink-0 text-[11px] text-[var(--dim)]">{th ? r.originTh : r.originEn}</span>
            </li>
          ))}
          <li className="mt-1 border-t border-[var(--line)] pt-1 text-[12px] leading-snug text-[var(--dim)]">{th ? "ลูกศรพาควัน: คำนวณจากจุด VIIRS ไม่ใช่ลมที่ตรวจวัดหรือการยืนยันว่าควันมาถึง" : "Smoke arrows: modeled from VIIRS detections, not measured wind or observed smoke arrival."}</li>
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
