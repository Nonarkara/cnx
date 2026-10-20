"use client";

// The forecast layer: wind drawn as moving streaks (the classic
// earth.nullschool reading — direction by motion, strength by length and
// brightness), with the rain or PM2.5 forecast as a soft field beneath the
// map labels, and one time scrubber from "now" to +48 h.
//
// Why it is built this way:
//   - Particles live in screen space and read a velocity grid that is
//     rebuilt only when the view or forecast hour changes, so thousands of
//     streaks cost one table lookup each per frame.
//   - While the map moves the streaks are cleared, not smeared — a trail
//     drawn across a pan would show wind that does not exist.
//   - Reduced motion gets still streamlines; nothing moves without a reason.
//   - Everything here is a model forecast and says so on the bar.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MaplibreMap, ImageSource } from "maplibre-gl";
import type { ForecastFieldResponse } from "../../lib/cnx/wind-field";
import type { WindLevel } from "../../lib/cnx/wind-field-core";
import {
  RAIN_STOPS,
  buildScreenBasis,
  buildVelocityGrid,
  compassEn,
  compassTh,
  fieldCorners,
  pm25Stops,
  rasterize,
  scalarReadout,
  velocityAt,
  windReadout,
  windArrowSegments,
  type Rgba,
  type ScreenBasis,
  type VelocityGrid,
} from "./forecast-render";
import { useLang } from "../../hooks/useLang";

export type ForecastOverlay = "none" | "rain" | "pm25";

interface Props {
  map: MaplibreMap | null;
  mapReady: boolean;
  /** Changes when the base map style is replaced (sources are wiped). */
  styleKey: string;
  forecast: ForecastFieldResponse | null;
  /** Streak colour: light streaks on dark imagery, ink on the light street map. */
  tone: "light" | "dark";
}

const CITY: [number, number] = [98.985, 18.788];
const GRID_STEP = 10;
/** Screen speed = MOTION_K·√(m/s) px per frame: monotonic, so faster is
 *  always faster, but a 1 m/s valley breeze still visibly moves. */
const MOTION_K = 1.0;
const SOURCE_ID = "cnx-forecast-field-src";
const LAYER_ID = "cnx-forecast-field";
const RASTER_SIZE = 300;
const PLAY_MS = 900;

/** Map hazard colours are fixed, not theme tokens: the field sits on the base
 *  map (light street or dark imagery), not on the page ground, and must read
 *  the same on every base map. The legend below uses the same values. */
const HAZARD = { good: [46, 160, 67, 255], watch: [234, 179, 8, 255], alert: [234, 88, 12, 255], critical: [220, 38, 38, 255] } as const satisfies Record<string, Rgba>;
const PM25_STOPS = pm25Stops({ good: [...HAZARD.good], watch: [...HAZARD.watch], alert: [...HAZARD.alert], critical: [...HAZARD.critical] });

const TIME_OPTS: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" };
const timeFmt = { th: new Intl.DateTimeFormat("th-TH", TIME_OPTS), en: new Intl.DateTimeFormat("en-GB", TIME_OPTS) };

/** The module's notes are English; Thai mode states the same thing. */
const NOTE_TH_UNAVAILABLE = "แบบจำลองพยากรณ์ไม่ตอบและไม่มีรอบล่าสุดที่เก็บไว้ — จึงไม่แสดงพยากรณ์ลม ฝน หรือ PM2.5 ซึ่งไม่ได้แปลว่าพยากรณ์ว่าลมสงบ";
const NOTE_TH_GRID = "พยากรณ์จากแบบจำลองบนกริด 0.3° (~30 กม.) — แสดงการไหลของลมระดับภูมิภาค ไม่ใช่พายุหรือลมกระโชกในหุบเขาใดหุบเขาหนึ่ง ฝนและระดับน้ำที่วัดได้สำคัญกว่าเสมอ";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * The wind-direction arrow at the city point — the one glyph that says "this
 * moving thing is wind" rather than leaving it to be inferred from motion.
 *
 * It points DOWNWIND, the way the air is actually moving, because that is what
 * an arrow means to almost every reader. The bar's text readout says where the
 * wind comes FROM, which is the opposite end. Those are two different facts
 * about one vector, so both are shown and the legend names the arrow
 * explicitly — otherwise an arrow pointing south beside the words "from the
 * north" reads as the board contradicting itself.
 */
function drawWindArrow(
  ctx: CanvasRenderingContext2D,
  at: [number, number],
  fromDeg: number,
  rgb: string,
) {
  const toDeg = (fromDeg + 180) % 360;
  const R = 26;
  ctx.save();
  ctx.translate(at[0], at[1]);
  // Screen y grows downward while a bearing is clockwise from north, so a
  // due-east wind (90°) must leave the +x-pointing shape unrotated.
  ctx.rotate(((toDeg - 90) * Math.PI) / 180);
  ctx.beginPath();
  ctx.moveTo(-R, -3.5);
  ctx.lineTo(R - 11, -3.5);
  ctx.lineTo(R - 11, -10);
  ctx.lineTo(R, 0);
  ctx.lineTo(R - 11, 10);
  ctx.lineTo(R - 11, 3.5);
  ctx.lineTo(-R, 3.5);
  ctx.closePath();
  ctx.fillStyle = `rgba(${rgb},0.92)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${rgb},0.92)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

export default function CNXForecastLayer({ map, mapReady, styleKey, forecast, tone }: Props) {
  const { lang, t: tr } = useLang();
  const field = forecast?.field ?? null;
  const [windOn, setWindOn] = useState(true);
  const [level, setLevel] = useState<WindLevel>("10m");
  const [overlay, setOverlay] = useState<ForecastOverlay>("none");
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const basisRef = useRef<ScreenBasis | null>(null);
  const gridRef = useRef<VelocityGrid | null>(null);
  const movingRef = useRef(false);
  /** City point in screen space, for the wind arrow. Updated with the basis. */
  const cityScreenRef = useRef<[number, number] | null>(null);
  /** "Wind comes FROM" bearing at the city, for the current hour and level.
   *  Held in a ref because the render loop must not re-subscribe every time
   *  the scrubber moves; `rebuildGrid` already tracks exactly these inputs. */
  const windArrowRef = useRef<number | null>(null);

  const maxHour = field ? field.times.length - 1 : 0;
  const t = field ? field.times[Math.min(hour, maxHour)] : 0;

  // Keep the hour in range when a new forecast run arrives.
  useEffect(() => {
    if (hour > maxHour) setHour(maxHour);
  }, [hour, maxHour]);

  // Play: one model hour per step, stop at the end of the forecast.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setHour((h) => {
        if (h >= maxHour) {
          setPlaying(false);
          return h;
        }
        return h + 1;
      });
    }, PLAY_MS);
    return () => window.clearInterval(timer);
  }, [playing, maxHour]);

  const rebuildGrid = useCallback(() => {
    const basis = basisRef.current;
    gridRef.current = basis && field && windOn ? buildVelocityGrid(field, level, t, basis, MOTION_K) : null;
    const w = field ? windReadout(field, level, CITY[0], CITY[1], t) : null;
    windArrowRef.current = w ? w.fromDeg : null;
  }, [field, level, t, windOn]);
  // The view listener must not re-subscribe (and re-unproject the whole
  // screen) on every forecast hour, so it reads the latest rebuild via a ref.
  const rebuildGridRef = useRef(rebuildGrid);
  rebuildGridRef.current = rebuildGrid;

  // ── View changes: clear while moving, rebuild the screen basis after. ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!map || !mapReady || !canvas) return;
    let settle: number | null = null;
    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const rebuildBasis = () => {
      resizeCanvas();
      basisRef.current = buildScreenBasis(
        canvas.clientWidth,
        canvas.clientHeight,
        GRID_STEP,
        (ll) => map.project(ll),
        (px) => map.unproject(px),
      );
      const city = map.project(CITY);
      cityScreenRef.current = [city.x, city.y];
      rebuildGridRef.current();
      movingRef.current = false;
    };
    const onMove = () => {
      if (!movingRef.current) {
        movingRef.current = true;
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      if (settle !== null) window.clearTimeout(settle);
      settle = window.setTimeout(rebuildBasis, 140);
    };
    rebuildBasis();
    map.on("move", onMove);
    map.on("resize", onMove);
    return () => {
      map.off("move", onMove);
      map.off("resize", onMove);
      if (settle !== null) window.clearTimeout(settle);
    };
  }, [map, mapReady]);

  // Forecast hour / height / on-off changes only need the cheap grid rebuild.
  useEffect(() => {
    rebuildGrid();
  }, [rebuildGrid]);

  // ── The particle loop (or still streamlines under reduced motion). ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !windOn || !field) {
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rgb = tone === "light" ? "255,255,255" : "17,24,39";
    const alphas = tone === "light" ? [0.5, 0.6, 0.72, 0.85] : [0.42, 0.5, 0.6, 0.72];
    const bucketOf = (speed: number) => (speed < 1.5 ? 0 : speed < 3.5 ? 1 : speed < 7 ? 2 : 3);

    if (reducedMotion) {
      // Still streamlines: trace each seed along the field and stop.
      const draw = () => {
        const grid = gridRef.current;
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        if (!grid) return;
        const paths: number[][][] = [[], [], [], []];
        for (let y = 12; y < canvas.clientHeight; y += 34) {
          for (let x = 12; x < canvas.clientWidth; x += 34) {
            let px = x + ((x * 7 + y * 13) % 11) - 5;
            let py = y + ((x * 3 + y * 5) % 11) - 5;
            const line: number[] = [px, py];
            let speed = 0;
            for (let s = 0; s < 18; s += 1) {
              const v = velocityAt(grid, px, py);
              if (!v) break;
              px += v[0] * 3;
              py += v[1] * 3;
              speed = v[2];
              line.push(px, py);
            }
            if (line.length > 4) paths[bucketOf(speed)].push(line);
          }
        }
        paths.forEach((lines, b) => {
          ctx.strokeStyle = `rgba(${rgb},${alphas[b]})`;
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          for (const l of lines) {
            ctx.moveTo(l[0], l[1]);
            for (let k = 2; k < l.length; k += 2) ctx.lineTo(l[k], l[k + 1]);
            const end = l.length - 2;
            const arrow = windArrowSegments(l[end] - l[end - 2], l[end + 1] - l[end - 1]);
            if (arrow) {
              const [, tip, left, right] = arrow;
              ctx.moveTo(l[end] + left[0], l[end + 1] + left[1]);
              ctx.lineTo(l[end] + tip[0], l[end + 1] + tip[1]);
              ctx.lineTo(l[end] + right[0], l[end + 1] + right[1]);
            }
          }
          ctx.stroke();
        });
        const city = cityScreenRef.current;
        const bearing = windArrowRef.current;
        if (city && bearing !== null) drawWindArrow(ctx, city, bearing, rgb);
      };
      draw();
      const timer = window.setInterval(() => {
        if (!movingRef.current) draw();
      }, 1000);
      return () => window.clearInterval(timer);
    }

    const area = canvas.clientWidth * canvas.clientHeight;
    const count = Math.min(500, Math.max(60, Math.round(area / 6000)));
    // Open arrows have a fixed readable silhouette even in very light wind.
    // Motion and brightness convey speed; arrowheads convey direction.
    const xs = new Float32Array(count);
    const ys = new Float32Array(count);
    const age = new Uint16Array(count);
    const life = new Uint16Array(count);
    const spawn = (i: number) => {
      xs[i] = Math.random() * canvas.clientWidth;
      ys[i] = Math.random() * canvas.clientHeight;
      age[i] = 0;
      life[i] = 60 + Math.floor(Math.random() * 100);
    };
    for (let i = 0; i < count; i += 1) {
      spawn(i);
      age[i] = Math.floor(Math.random() * life[i]);
    }
    let raf = 0;
    const frame = () => {
      raf = window.requestAnimationFrame(frame);
      const grid = gridRef.current;
      if (movingRef.current || !grid) return;
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      const paths = Array.from({ length: 4 }, () => new Path2D());
      for (let i = 0; i < count; i += 1) {
        const v = age[i] < life[i] ? velocityAt(grid, xs[i], ys[i]) : null;
        if (!v) { spawn(i); continue; }
        xs[i] += v[0];
        ys[i] += v[1];
        age[i] += 1;
        const arrow = windArrowSegments(v[0], v[1]);
        if (!arrow) continue;
        const [tail, tip, left, right] = arrow;
        const path = paths[bucketOf(v[2])];
        path.moveTo(xs[i] + tail[0], ys[i] + tail[1]);
        path.lineTo(xs[i] + tip[0], ys[i] + tip[1]);
        path.moveTo(xs[i] + left[0], ys[i] + left[1]);
        path.lineTo(xs[i] + tip[0], ys[i] + tip[1]);
        path.lineTo(xs[i] + right[0], ys[i] + right[1]);
      }
      ctx.lineWidth = 1.5;
      ctx.lineCap = "butt";
      for (let sb = 0; sb < 4; sb += 1) {
        ctx.strokeStyle = `rgba(${rgb},${alphas[sb]})`;
        ctx.stroke(paths[sb]);
      }
      const city = cityScreenRef.current;
      const bearing = windArrowRef.current;
      if (city && bearing !== null) drawWindArrow(ctx, city, bearing, rgb);
    };
    raf = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [windOn, field, tone, reducedMotion]);

  // ── Rain / PM2.5 field as a MapLibre image beneath the labels. ──
  useEffect(() => {
    if (!map || !mapReady) return;
    const remove = () => {
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // The style may already be gone during a base-map swap.
      }
    };
    const frames = overlay === "rain" ? field?.precip : overlay === "pm25" ? field?.pm25 : null;
    if (!field || !frames) {
      remove();
      return;
    }
    const pixels = rasterize(field, frames, t, overlay === "rain" ? RAIN_STOPS : PM25_STOPS, RASTER_SIZE, RASTER_SIZE);
    if (!pixels) {
      remove();
      return;
    }
    const off = document.createElement("canvas");
    off.width = RASTER_SIZE;
    off.height = RASTER_SIZE;
    off.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(pixels), RASTER_SIZE, RASTER_SIZE), 0, 0);
    const url = off.toDataURL("image/png");
    const coordinates = fieldCorners(field);
    const apply = () => {
      try {
        const src = map.getSource(SOURCE_ID) as ImageSource | undefined;
        if (src) {
          src.updateImage({ url, coordinates });
          return;
        }
        map.addSource(SOURCE_ID, { type: "image", url, coordinates });
        const firstSymbol = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
        map.addLayer({ id: LAYER_ID, type: "raster", source: SOURCE_ID, paint: { "raster-opacity": 0.85, "raster-fade-duration": 0 } }, firstSymbol);
      } catch (e) {
        console.warn(`[forecast-layer] ${(e as Error).message}`);
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
  }, [map, mapReady, styleKey, overlay, field, t]);

  // ── Read-outs for the bar. ──
  const wind = field ? windReadout(field, level, CITY[0], CITY[1], t) : null;
  const rainNow = field && overlay === "rain" ? scalarReadout(field, field.precip, CITY[0], CITY[1], t) : null;
  const pmNow = field && overlay === "pm25" ? scalarReadout(field, field.pm25, CITY[0], CITY[1], t) : null;
  const fetchedAgo = forecast?.fetchedAt ? Math.max(0, Math.round((Date.now() - Date.parse(forecast.fetchedAt)) / 3_600_000)) : null;

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] h-full w-full" />
      <section
        aria-label={tr("พยากรณ์ลม ฝน และฝุ่น 48 ชั่วโมง", "48-hour wind, rain and PM2.5 forecast")}
        className="absolute bottom-8 left-1/2 z-10 w-fit max-w-[calc(100%-1rem)] -translate-x-1/2 border border-[var(--line)] bg-[var(--bg-raised)] text-[var(--ink)]"
      >
        {!field ? (
          <p className="max-w-[320px] px-2 py-1 text-[12px] text-[var(--dim)]">
            {tr("พยากรณ์ลม/ฝน/ฝุ่น: ไม่มีข้อมูลขณะนี้", "Wind/rain/PM2.5 forecast: no data right now")} — {forecast ? tr(NOTE_TH_UNAVAILABLE, forecast.note) : tr("กำลังโหลด…", "loading…")}
          </p>
        ) : (
          <>
            <div className="flex w-[320px] max-w-full items-center gap-1 px-1">
              <button
                type="button"
                onClick={() => {
                  if (!playing && hour >= maxHour) setHour(0);
                  setPlaying((p) => !p);
                }}
                aria-label={playing ? tr("หยุดเล่นพยากรณ์", "Pause forecast") : tr("เล่นพยากรณ์ 48 ชั่วโมง", "Play 48-hour forecast")}
                aria-pressed={playing}
                className="flex h-11 w-11 shrink-0 items-center justify-center text-[14px] focus-visible:outline-2 focus-visible:outline-[var(--cool)]"
              >
                {playing ? "❚❚" : "▶"}
              </button>
              <div className="min-w-0 flex-1 text-[12px] leading-tight">
                <time dateTime={new Date(t * 1000).toISOString()} title={timeFmt[lang].format(new Date(t * 1000))} className="block truncate text-[13px] font-semibold tabular-nums">
                  {new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(t * 1000))}
                </time>
                <span className="block truncate text-[var(--dim)]" title={tr("แบบจำลอง ไม่ใช่ค่าวัด", "Model, not a measurement")}>
                  {tr("แบบจำลอง", "Model")} · {windOn ? level === "10m" ? tr("ลม 10 ม.", "Wind 10 m") : tr("ลม 850 hPa", "Wind 850 hPa") : tr("ปิดลม", "Wind off")}{overlay !== "none" ? ` · ${overlay === "rain" ? tr("ฝน", "Rain") : "PM2.5"}` : ""}
                </span>
              </div>
              <input
                type="range" min={0} max={maxHour} step={1} value={hour}
                onChange={(e) => { setPlaying(false); setHour(Number(e.target.value)); }}
                aria-label={tr("เวลาพยากรณ์", "Forecast time")}
                aria-valuetext={`${timeFmt[lang].format(new Date(t * 1000))}, ${tr(`อีก ${hour} ชั่วโมง`, `in ${hour} ${hour === 1 ? "hour" : "hours"}`)}`}
                className="h-11 w-16 shrink-0 cursor-pointer accent-[var(--cool)] focus-visible:outline-2 focus-visible:outline-[var(--cool)]"
              />
              <button type="button" aria-expanded={detailsOpen} aria-controls="cnx-forecast-details" onClick={() => setDetailsOpen(open => !open)}
                aria-label={tr("รายละเอียดและชั้นพยากรณ์", "Forecast layers and details")}
                className="flex h-11 w-11 shrink-0 items-center justify-center text-[16px] focus-visible:outline-2 focus-visible:outline-[var(--cool)]">
                <span aria-hidden="true">{detailsOpen ? "⌃" : "⋯"}</span>
              </button>
            </div>
            <div id="cnx-forecast-details" hidden={!detailsOpen} className="max-w-[320px]">
              <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] px-2 text-[12px]">
                <span>{hour === 0 ? tr("ตอนนี้ · UTC+7", "Now · UTC+7") : tr(`อีก ${hour} ชม. · UTC+7`, `+${hour} h · UTC+7`)}</span>
                <button type="button" onClick={() => { setPlaying(false); setHour(0); }} className="min-h-11 px-1 text-[var(--cool)] underline focus-visible:outline-2 focus-visible:outline-[var(--cool)]">{tr("กลับมาตอนนี้", "Back to now")}</button>
              </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-2 pt-1 text-[12px]">
              <fieldset className="flex flex-wrap items-center gap-1">
                <legend className="sr-only">{tr("ชั้นลม", "Wind layer")}</legend>
                <ChipButton pressed={windOn && level === "10m"} onClick={() => { setWindOn(true); setLevel("10m"); }} title={tr("ลมที่ความสูง 10 เมตร — ลมที่คนบนพื้นรู้สึก", "Wind at 10 m — the wind people feel on the ground")}>{tr("ลมผิวพื้น", "Surface wind")}</ChipButton>
                <ChipButton pressed={windOn && level === "850hPa"} onClick={() => { setWindOn(true); setLevel("850hPa"); }} title={tr("ลมระดับ 850 hPa (~1.5 กม.) — ระดับที่พาควันเดินทางข้ามเขา ใช้คำนวณแนวควัน", "Wind at 850 hPa (~1.5 km) — the level that carries smoke over the hills; used for smoke paths")}>{tr("ลมพาควัน ~1.5 กม.", "Smoke wind ~1.5 km")}</ChipButton>
                <ChipButton pressed={!windOn} onClick={() => setWindOn(false)} title={tr("ซ่อนลูกศรลม", "Hide wind arrows")}>{tr("ปิดลม", "Wind off")}</ChipButton>
              </fieldset>
              <fieldset className="flex flex-wrap items-center gap-1">
                <legend className="sr-only">{tr("ชั้นพยากรณ์", "Forecast layer")}</legend>
                <ChipButton pressed={overlay === "rain"} onClick={() => setOverlay((o) => (o === "rain" ? "none" : "rain"))} title={tr("ฝนพยากรณ์รายชั่วโมง (มม./ชม.)", "Hourly rain forecast (mm/h)")}>{tr("ฝน", "Rain")}</ChipButton>
                <ChipButton pressed={overlay === "pm25"} onClick={() => setOverlay((o) => (o === "pm25" ? "none" : "pm25"))} disabled={!field.pm25} title={field.pm25 ? tr("PM2.5 พยากรณ์จากแบบจำลอง CAMS (µg/m³)", "PM2.5 forecast from the CAMS model (µg/m³)") : tr("แบบจำลองฝุ่น CAMS ไม่ตอบ", "The CAMS dust model did not answer")}>PM2.5</ChipButton>
              </fieldset>
            </div>
            <p className="border-t border-[var(--line)] px-2 py-1.5 text-[12px] leading-snug text-[var(--dim)]">
              {wind && windOn ? (
                <>
                  {lang === "en" ? <>City: wind from the <b className="font-semibold text-[var(--ink)]">{compassEn(wind.fromDeg)}</b> {wind.speed.toFixed(1)} m/s ({(wind.speed * 3.6).toFixed(0)} km/h)</> : <>ตัวเมือง: ลมจาก<b className="font-semibold text-[var(--ink)]">{compassTh(wind.fromDeg)}</b> {wind.speed.toFixed(1)} ม./วิ ({(wind.speed * 3.6).toFixed(0)} กม./ชม.)</>}
                </>
              ) : null}
              {rainNow !== null && <> · {tr(`ฝน ${rainNow.toFixed(1)} มม./ชม.`, `rain ${rainNow.toFixed(1)} mm/h`)}</>}
              {pmNow !== null && <> · PM2.5 {Math.round(pmNow)} µg/m³</>}
              {" · "}
              <span title={forecast?.note ? tr(NOTE_TH_GRID, forecast.note) : undefined}>{tr(`แบบจำลอง Open-Meteo${field.pm25 ? " · CAMS" : ""} ไม่ใช่ค่าวัด`, `Open-Meteo${field.pm25 ? " · CAMS" : ""} model, not a measurement`)}{fetchedAgo !== null ? tr(` · ดึงเมื่อ ${fetchedAgo} ชม.ก่อน`, ` · fetched ${fetchedAgo} h ago`) : ""}</span>
            </p>
            </div>
            {overlay !== "none" && <Legend overlay={overlay} />}
          </>
        )}
      </section>
    </>
  );
}

function ChipButton({ pressed, onClick, children, title, disabled }: { pressed: boolean; onClick: () => void; children: React.ReactNode; title?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`min-h-11 border px-2 font-semibold focus-visible:outline-2 focus-visible:outline-[var(--cool)] disabled:cursor-not-allowed disabled:text-[var(--dim)] ${pressed ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]" : "border-[var(--line)] text-[var(--ink)]"}`}
    >
      {children}
    </button>
  );
}

function Legend({ overlay }: { overlay: Exclude<ForecastOverlay, "none"> }) {
  const { t } = useLang();
  if (overlay === "rain") {
    return (
      <div className="flex items-center gap-2 border-t border-[var(--line)] px-2 py-1.5 text-[12px] text-[var(--dim)]">
        <span>{t("ฝน มม./ชม.", "Rain mm/h")}</span>
        <span aria-hidden="true" className="h-2 flex-1" style={{ background: "linear-gradient(90deg, rgba(158,202,225,.45), rgb(66,146,198), rgb(8,81,156), rgb(63,0,125))" }} />
        <span className="tabular-nums">0.5 · 2.5 · 7.6 · 20+</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--line)] px-2 py-1.5 text-[12px] text-[var(--dim)]">
      <span>PM2.5 µg/m³</span>
      <span className="flex items-center gap-1"><i aria-hidden="true" className="inline-block h-2.5 w-2.5 bg-[rgb(234,179,8)]" />25 {t("เฝ้าระวัง", "watch")}</span>
      <span className="flex items-center gap-1"><i aria-hidden="true" className="inline-block h-2.5 w-2.5 bg-[rgb(234,88,12)]" />50 {t("เตือนภัย", "alert")}</span>
      <span className="flex items-center gap-1"><i aria-hidden="true" className="inline-block h-2.5 w-2.5 bg-[rgb(220,38,38)]" />90 {t("วิกฤต", "critical")}</span>
    </div>
  );
}
