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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MaplibreMap, ImageSource } from "maplibre-gl";
import type { ForecastFieldResponse } from "../../lib/cnx/wind-field";
import type { WindLevel } from "../../lib/cnx/wind-field-core";
import {
  RAIN_STOPS,
  buildScreenBasis,
  buildVelocityGrid,
  compassTh,
  fieldCorners,
  pm25Stops,
  rasterize,
  scalarReadout,
  velocityAt,
  windReadout,
  type Rgba,
  type ScreenBasis,
  type VelocityGrid,
} from "./forecast-render";

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
const TRAIL = 12;
const SOURCE_ID = "cnx-forecast-field-src";
const LAYER_ID = "cnx-forecast-field";
const RASTER_SIZE = 300;
const PLAY_MS = 900;

const timeFmt = new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

function cssRgb(name: string, fallback: Rgba): Rgba {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(raw);
  if (!m) return fallback;
  return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 255];
}

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

export default function CNXForecastLayer({ map, mapReady, styleKey, forecast, tone }: Props) {
  const field = forecast?.field ?? null;
  const [windOn, setWindOn] = useState(true);
  const [level, setLevel] = useState<WindLevel>("10m");
  const [overlay, setOverlay] = useState<ForecastOverlay>("none");
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const basisRef = useRef<ScreenBasis | null>(null);
  const gridRef = useRef<VelocityGrid | null>(null);
  const movingRef = useRef(false);

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
          }
          ctx.stroke();
        });
      };
      draw();
      const timer = window.setInterval(() => {
        if (!movingRef.current) draw();
      }, 1000);
      return () => window.clearInterval(timer);
    }

    const area = canvas.clientWidth * canvas.clientHeight;
    const count = Math.min(2200, Math.max(400, Math.round(area / 1100)));
    // Each particle keeps its last TRAIL positions and the whole tail is
    // redrawn every frame, fading towards its end. A cleared canvas each
    // frame leaves no residue (accumulated fades never reach zero in 8-bit
    // alpha) and nothing lingers after the wind or the view changes.
    const xs = new Float32Array(count * TRAIL);
    const ys = new Float32Array(count * TRAIL);
    const head = new Uint8Array(count);
    const filled = new Uint8Array(count);
    const spd = new Float32Array(count);
    const age = new Uint16Array(count);
    const life = new Uint16Array(count);
    const spawn = (i: number) => {
      const x = Math.random() * canvas.clientWidth;
      const y = Math.random() * canvas.clientHeight;
      xs[i * TRAIL] = x;
      ys[i * TRAIL] = y;
      head[i] = 0;
      filled[i] = 1;
      age[i] = 0;
      life[i] = 60 + Math.floor(Math.random() * 100);
    };
    for (let i = 0; i < count; i += 1) {
      spawn(i);
      age[i] = Math.floor(Math.random() * life[i]);
    }
    const TAIL_BUCKETS = 4;
    const paths: Path2D[] = [];
    let raf = 0;
    const frame = () => {
      raf = window.requestAnimationFrame(frame);
      const grid = gridRef.current;
      if (movingRef.current || !grid) return;
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      for (let k = 0; k < 4 * TAIL_BUCKETS; k += 1) paths[k] = new Path2D();
      for (let i = 0; i < count; i += 1) {
        const base = i * TRAIL;
        const hx = xs[base + head[i]];
        const hy = ys[base + head[i]];
        const v = age[i] < life[i] ? velocityAt(grid, hx, hy) : null;
        if (!v) {
          spawn(i);
          continue;
        }
        const nh = (head[i] + 1) % TRAIL;
        xs[base + nh] = hx + v[0];
        ys[base + nh] = hy + v[1];
        head[i] = nh;
        if (filled[i] < TRAIL) filled[i] += 1;
        spd[i] = v[2];
        age[i] += 1;
        // Newest segment first; older segments go to fainter buckets.
        const sb = bucketOf(spd[i]);
        for (let s = 0; s < filled[i] - 1; s += 1) {
          const a = (nh - s + TRAIL) % TRAIL;
          const b = (a - 1 + TRAIL) % TRAIL;
          const tb = Math.min(TAIL_BUCKETS - 1, Math.floor((s / (TRAIL - 1)) * TAIL_BUCKETS));
          const path = paths[sb * TAIL_BUCKETS + tb];
          path.moveTo(xs[base + a], ys[base + a]);
          path.lineTo(xs[base + b], ys[base + b]);
        }
      }
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      for (let sb = 0; sb < 4; sb += 1) {
        for (let tb = 0; tb < TAIL_BUCKETS; tb += 1) {
          ctx.strokeStyle = `rgba(${rgb},${(alphas[sb] * (1 - tb / TAIL_BUCKETS)).toFixed(3)})`;
          ctx.stroke(paths[sb * TAIL_BUCKETS + tb]);
        }
      }
    };
    raf = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [windOn, field, tone, reducedMotion]);

  // ── Rain / PM2.5 field as a MapLibre image beneath the labels. ──
  const sevStops = useMemo(
    () =>
      pm25Stops({
        good: cssRgb("--sev-good", [46, 160, 67, 255]),
        watch: cssRgb("--sev-watch", [234, 179, 8, 255]),
        alert: cssRgb("--sev-alert", [234, 88, 12, 255]),
        critical: cssRgb("--sev-critical", [220, 38, 38, 255]),
      }),
    // Re-read when the theme may have changed with the style.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [styleKey],
  );

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
    const pixels = rasterize(field, frames, t, overlay === "rain" ? RAIN_STOPS : sevStops, RASTER_SIZE, RASTER_SIZE);
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
  }, [map, mapReady, styleKey, overlay, field, t, sevStops]);

  // ── Read-outs for the bar. ──
  const wind = field ? windReadout(field, level, CITY[0], CITY[1], t) : null;
  const rainNow = field && overlay === "rain" ? scalarReadout(field, field.precip, CITY[0], CITY[1], t) : null;
  const pmNow = field && overlay === "pm25" ? scalarReadout(field, field.pm25, CITY[0], CITY[1], t) : null;
  const fetchedAgo = forecast?.fetchedAt ? Math.max(0, Math.round((Date.now() - Date.parse(forecast.fetchedAt)) / 3_600_000)) : null;

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] h-full w-full" />
      <section
        aria-label="พยากรณ์ลม ฝน และฝุ่น 48 ชั่วโมง"
        className="absolute bottom-8 left-1/2 z-10 w-[min(640px,calc(100%-1rem))] -translate-x-1/2 border border-[var(--line)] bg-[var(--bg-raised)] text-[var(--ink)]"
      >
        {!field ? (
          <p className="px-3 py-2 text-[13px] text-[var(--dim)]">
            พยากรณ์ลม/ฝน/ฝุ่น: ไม่มีข้อมูลขณะนี้ — {forecast?.note ?? "กำลังโหลด…"}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 px-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (!playing && hour >= maxHour) setHour(0);
                  setPlaying((p) => !p);
                }}
                aria-label={playing ? "หยุดเล่นพยากรณ์" : "เล่นพยากรณ์ 48 ชั่วโมง"}
                className="flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--line)] text-[16px]"
              >
                {playing ? "❚❚" : "▶"}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14px] font-semibold tabular-nums">{timeFmt.format(new Date(t * 1000))}</span>
                  <span className="shrink-0 text-[12px] text-[var(--dim)]">{hour === 0 ? "ตอนนี้" : `อีก ${hour} ชม.`}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={maxHour}
                  step={1}
                  value={hour}
                  onChange={(e) => {
                    setPlaying(false);
                    setHour(Number(e.target.value));
                  }}
                  aria-label="เวลาพยากรณ์"
                  aria-valuetext={`${timeFmt.format(new Date(t * 1000))}, อีก ${hour} ชั่วโมง`}
                  className="h-6 w-full cursor-pointer accent-[var(--cool)]"
                />
              </div>
              {hour > 0 && (
                <button type="button" onClick={() => { setPlaying(false); setHour(0); }} className="h-11 shrink-0 border border-[var(--line)] px-2 text-[12px] font-semibold">
                  กลับมาตอนนี้
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-2 pt-1 text-[12px]">
              <fieldset className="flex items-center gap-1">
                <legend className="sr-only">ชั้นลม</legend>
                <ChipButton pressed={windOn && level === "10m"} onClick={() => { setWindOn(true); setLevel("10m"); }} title="ลมที่ความสูง 10 เมตร — ลมที่คนบนพื้นรู้สึก">ลมผิวพื้น</ChipButton>
                <ChipButton pressed={windOn && level === "850hPa"} onClick={() => { setWindOn(true); setLevel("850hPa"); }} title="ลมระดับ 850 hPa (~1.5 กม.) — ระดับที่พาควันเดินทางข้ามเขา ใช้คำนวณแนวควัน">ลมพาควัน ~1.5 กม.</ChipButton>
                <ChipButton pressed={!windOn} onClick={() => setWindOn(false)} title="ซ่อนเส้นลม">ปิดลม</ChipButton>
              </fieldset>
              <fieldset className="flex items-center gap-1">
                <legend className="sr-only">ชั้นพยากรณ์</legend>
                <ChipButton pressed={overlay === "rain"} onClick={() => setOverlay((o) => (o === "rain" ? "none" : "rain"))} title="ฝนพยากรณ์รายชั่วโมง (มม./ชม.)">ฝน</ChipButton>
                <ChipButton pressed={overlay === "pm25"} onClick={() => setOverlay((o) => (o === "pm25" ? "none" : "pm25"))} disabled={!field.pm25} title={field.pm25 ? "PM2.5 พยากรณ์จากแบบจำลอง CAMS (µg/m³)" : "แบบจำลองฝุ่น CAMS ไม่ตอบ"}>PM2.5</ChipButton>
              </fieldset>
            </div>
            <p className="border-t border-[var(--line)] px-2 py-1.5 text-[12px] leading-snug text-[var(--dim)]">
              {wind && windOn ? (
                <>
                  ตัวเมือง: ลมจาก<b className="font-semibold text-[var(--ink)]">{compassTh(wind.fromDeg)}</b> {wind.speed.toFixed(1)} ม./วิ ({(wind.speed * 3.6).toFixed(0)} กม./ชม.)
                </>
              ) : null}
              {rainNow !== null && <> · ฝน {rainNow.toFixed(1)} มม./ชม.</>}
              {pmNow !== null && <> · PM2.5 {Math.round(pmNow)} µg/m³</>}
              {" · "}
              <span title={forecast?.note}>แบบจำลอง Open-Meteo{field.pm25 ? " · CAMS" : ""} ไม่ใช่ค่าวัด{fetchedAgo !== null ? ` · ดึงเมื่อ ${fetchedAgo} ชม.ก่อน` : ""}</span>
            </p>
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
      className={`min-h-9 border px-2 font-semibold disabled:opacity-40 ${pressed ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]" : "border-[var(--line)] text-[var(--ink)]"}`}
    >
      {children}
    </button>
  );
}

function Legend({ overlay }: { overlay: Exclude<ForecastOverlay, "none"> }) {
  if (overlay === "rain") {
    return (
      <div className="flex items-center gap-2 border-t border-[var(--line)] px-2 py-1.5 text-[12px] text-[var(--dim)]">
        <span>ฝน มม./ชม.</span>
        <span aria-hidden="true" className="h-2 flex-1" style={{ background: "linear-gradient(90deg, rgba(158,202,225,.45), rgb(66,146,198), rgb(8,81,156), rgb(63,0,125))" }} />
        <span className="tabular-nums">0.5 · 2.5 · 7.6 · 20+</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--line)] px-2 py-1.5 text-[12px] text-[var(--dim)]">
      <span>PM2.5 µg/m³</span>
      <span className="flex items-center gap-1"><i aria-hidden="true" className="inline-block h-2.5 w-2.5 bg-[var(--sev-watch,#eab308)]" />25 เฝ้าระวัง</span>
      <span className="flex items-center gap-1"><i aria-hidden="true" className="inline-block h-2.5 w-2.5 bg-[var(--sev-alert,#ea580c)]" />50 เตือนภัย</span>
      <span className="flex items-center gap-1"><i aria-hidden="true" className="inline-block h-2.5 w-2.5 bg-[var(--sev-critical,#dc2626)]" />90 วิกฤต</span>
    </div>
  );
}
