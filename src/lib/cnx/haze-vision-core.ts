// Haze detection from public webcam snapshots — pure maths, no I/O.
//
// Imported by the off-Cloudflare relay (scripts/haze-vision.mjs runs it
// under Node's native TypeScript stripping), so this file must stay
// import-free and use only erasable type syntax.
//
// Method (classical image statistics, not a trained model):
//   - Dark channel (He, Sun & Tang, "Single Image Haze Removal Using Dark
//     Channel Prior", CVPR 2009): in haze-free outdoor scenes most local
//     patches have some pixel near zero in at least one colour channel;
//     airlight from haze lifts that minimum. Mean dark channel ≈ haze.
//   - RMS contrast of luminance: haze flattens the scene.
//   - Mean saturation: haze greys colours out.
// Each camera is compared with the clearest frames IT has produced over the
// history window, because absolute values depend on the scene. The top
// quarter of the frame is ignored (usually sky, which is bright and
// low-contrast whatever the air quality).
//
// Known failure modes, surfaced to users in HAZE_METHODOLOGY: rain, fog,
// low cloud and a dirty lens look like haze; night frames are skipped; a
// camera that has only seen hazy days calibrates to haze and under-reports.

export interface FrameMetrics {
  /** Mean luminance 0–1 of the analysed region. */
  meanLuminance: number;
  /** Std-dev of luminance 0–1 (RMS contrast). */
  contrast: number;
  /** Mean dark channel 0–1 (7×7 patch minimum of min(R,G,B)). */
  darkChannel: number;
  /** Mean HSV saturation 0–1. */
  saturation: number;
}

export interface Baseline {
  darkChannel: number;
  contrast: number;
  samples: number;
}

export type HazeLabel = "haze-likely" | "some-haze" | "clear" | "too-dark" | "calibrating";

export interface HazeVerdict {
  label: HazeLabel;
  /** 0 (as clear as this camera's clearest frames) … 1 (heavy haze). Null
   *  when the frame could not be scored. */
  score: number | null;
}

/** Frames darker than this are night/dusk — the statistics are meaningless. */
export const MIN_DAYLIGHT_LUMINANCE = 0.14;
/** Daylight frames needed before a camera's baseline is trusted. */
export const MIN_BASELINE_SAMPLES = 12;
const PATCH_RADIUS = 3;
const SKY_FRACTION = 0.25;

/** Computes haze statistics from interleaved 8-bit RGB(A) pixels. */
export function computeFrameMetrics(pixels: Uint8Array, width: number, height: number, channels: number): FrameMetrics {
  const top = Math.floor(height * SKY_FRACTION);
  const rows = height - top;
  const n = rows * width;
  const minRgb = new Float32Array(n);
  let lumSum = 0;
  let lumSq = 0;
  let satSum = 0;
  for (let y = top; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = pixels[i] / 255;
      const g = pixels[i + 1] / 255;
      const b = pixels[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      lumSum += lum;
      lumSq += lum * lum;
      satSum += max === 0 ? 0 : (max - min) / max;
      minRgb[(y - top) * width + x] = min;
    }
  }
  const mean = lumSum / n;
  return {
    meanLuminance: mean,
    contrast: Math.sqrt(Math.max(0, lumSq / n - mean * mean)),
    darkChannel: meanOfPatchMin(minRgb, width, rows),
    saturation: satSum / n,
  };
}

/** Separable min-filter (horizontal then vertical), then the mean. */
function meanOfPatchMin(src: Float32Array, width: number, height: number): number {
  const tmp = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let m = 1;
      for (let dx = -PATCH_RADIUS; dx <= PATCH_RADIUS; dx++) {
        const xx = Math.min(width - 1, Math.max(0, x + dx));
        m = Math.min(m, src[y * width + xx]);
      }
      tmp[y * width + x] = m;
    }
  }
  let sum = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let m = 1;
      for (let dy = -PATCH_RADIUS; dy <= PATCH_RADIUS; dy++) {
        const yy = Math.min(height - 1, Math.max(0, y + dy));
        m = Math.min(m, tmp[yy * width + x]);
      }
      sum += m;
    }
  }
  return sum / src.length;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

export function isDaylight(m: FrameMetrics): boolean {
  return m.meanLuminance >= MIN_DAYLIGHT_LUMINANCE;
}

/** The camera's "clear day": low dark channel, high contrast, taken as
 *  robust percentiles of its daylight history. */
export function baselineFrom(history: FrameMetrics[]): Baseline | null {
  const day = history.filter(isDaylight);
  if (day.length < MIN_BASELINE_SAMPLES) return null;
  return {
    darkChannel: percentile(day.map((m) => m.darkChannel), 0.2),
    contrast: percentile(day.map((m) => m.contrast), 0.8),
    samples: day.length,
  };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 0–1: how far this frame has moved from the camera's clear baseline. */
export function hazeScore(m: FrameMetrics, base: Baseline): number {
  const dcRise = clamp01((m.darkChannel - base.darkChannel) / 0.25);
  const contrastDrop = base.contrast > 0 ? clamp01((base.contrast - m.contrast) / (base.contrast * 0.6)) : 0;
  return Math.round((0.6 * dcRise + 0.4 * contrastDrop) * 100) / 100;
}

export function classifyFrame(m: FrameMetrics, history: FrameMetrics[]): HazeVerdict {
  if (!isDaylight(m)) return { label: "too-dark", score: null };
  const base = baselineFrom(history);
  if (!base) return { label: "calibrating", score: null };
  const score = hazeScore(m, base);
  return { label: score >= 0.5 ? "haze-likely" : score >= 0.25 ? "some-haze" : "clear", score };
}

/** Pearson correlation; null below 8 pairs (too few to mean anything). */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 8) return null;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return Math.round((sxy / Math.sqrt(sxx * syy)) * 100) / 100;
}

export const HAZE_METHODOLOGY =
  "Classical image statistics on public webcam snapshots (dark-channel prior, He et al. 2009; luminance contrast; saturation), each camera compared with its own clearest daylight frames. Not a trained model and not a PM2.5 measurement: rain, fog, low cloud and a dirty lens also read as haze; night frames are skipped; a camera that has only seen hazy days under-reports. The agreement figure compares scores with the nearest DustBoy ground sensor.";
