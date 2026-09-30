// Webcam haze read-out: what the relay (scripts/haze-vision.mjs) pushes and
// what /api/cnx/haze-vision serves. Scoring maths lives in haze-vision-core.ts.

import { HAZE_METHODOLOGY, type FrameMetrics, type HazeLabel } from "./haze-vision-core";
import { isHttpsUrl, isIsoDate, isNum, isNumOrNull, isObj, isStr, readRelayJson } from "./relay-kv";

export const HAZE_VISION_KV_KEY = "haze-vision-latest";
/** The relay scores every 10 min; 45 min without a push means it is down. */
const STALE_MS = 45 * 60_000;
const MAX_CAMERAS = 60;
const LABELS: HazeLabel[] = ["haze-likely", "some-haze", "clear", "too-dark", "no-colour", "calibrating"];

export interface NearestPm25 {
  stationName: string;
  pm25: number;
  distanceKm: number;
  observedAt: string;
}

export interface CameraHaze {
  cameraId: string;
  label: string;
  latitude: number;
  longitude: number;
  snapshotUrl: string;
  observedAt: string;
  verdict: HazeLabel;
  score: number | null;
  metrics: FrameMetrics | null;
  baselineSamples: number;
  nearestPm25: NearestPm25 | null;
}

export interface HazeVisionPayload {
  generatedAt: string;
  cameras: CameraHaze[];
  /**
   * Pearson r between haze score and nearest DustBoy PM2.5 over the
   * relay's history window, with how many frame/sensor pairs it rests on.
   *
   * The context fields exist because a bare `r` is misleading on its own.
   * A correlation can only validate the scorer if the window actually
   * contained a haze EVENT to detect: every paired PM2.5 in the first
   * month of operation sat between 3 and 20 µg/m³ (median 7), i.e. clean
   * air throughout. Pearson against a near-constant response returns a
   * small number whether the scorer is excellent or useless, so a bare
   * `r = 0.12` reads as "the cameras do not track reality" when the truth
   * is "the cameras have never been tested." Report the range and say so.
   */
  agreement: {
    r: number | null;
    pairs: number;
    /** Lowest / highest paired ground reading, µg/m³. */
    pm25Min: number | null;
    pm25Max: number | null;
    /** Median and 95th percentile of the same readings — the robust spread. */
    pm25Median: number | null;
    pm25P95: number | null;
    /** How many paired readings reached HAZE_EVENT_UG (unhealthy). */
    eventReadings: number;
    /**
     * True when the window contains a real regional haze episode, not a
     * spike. Requires both a robust spread (p95 − median ≥ 20 µg/m³) AND
     * at least 3 unhealthy readings, because a lone faulted sensor at 149
     * µg/m³ is not an event — it is the sensor fault we already detect in
     * dustboy.ts. Using min/max here would let one broken unit manufacture
     * a "testable" window and print a meaningless correlation.
     */
    spansHazeEvent: boolean;
  };
}

/** A paired PM2.5 at or above this counts toward a real haze event. */
export const HAZE_EVENT_UG = 50;
/** Minimum eventReadings before a window counts as an episode, not a spike. */
export const HAZE_EVENT_MIN_READINGS = 3;

export interface HazeVisionResponse extends HazeVisionPayload {
  provenance: "live" | "unavailable";
  methodology: string;
  note: string | null;
}

function isMetrics(v: unknown): v is FrameMetrics {
  return isObj(v) && isNum(v.meanLuminance) && isNum(v.contrast) && isNum(v.darkChannel) && isNum(v.saturation);
}

function isCamera(v: unknown): v is CameraHaze {
  if (!isObj(v)) return false;
  const pm = v.nearestPm25;
  const pmOk =
    pm === null ||
    (isObj(pm) && isStr(pm.stationName, 200) && isNum(pm.pm25) && isNum(pm.distanceKm) && isIsoDate(pm.observedAt));
  return (
    isStr(v.cameraId, 100) &&
    isStr(v.label, 200) &&
    isNum(v.latitude) &&
    isNum(v.longitude) &&
    isHttpsUrl(v.snapshotUrl) &&
    isIsoDate(v.observedAt) &&
    LABELS.includes(v.verdict as HazeLabel) &&
    isNumOrNull(v.score) &&
    (v.metrics === null || isMetrics(v.metrics)) &&
    isNum(v.baselineSamples) &&
    pmOk
  );
}

export function isHazeVisionPayload(v: unknown): v is HazeVisionPayload {
  return (
    isObj(v) &&
    isIsoDate(v.generatedAt) &&
    Array.isArray(v.cameras) &&
    v.cameras.length <= MAX_CAMERAS &&
    v.cameras.every(isCamera) &&
    isObj(v.agreement) &&
    isNumOrNull(v.agreement.r) &&
    isNum(v.agreement.pairs) &&
    isNumOrNull(v.agreement.pm25Min) &&
    isNumOrNull(v.agreement.pm25Max) &&
    isNumOrNull(v.agreement.pm25Median) &&
    isNumOrNull(v.agreement.pm25P95) &&
    isNum(v.agreement.eventReadings) &&
    typeof v.agreement.spansHazeEvent === "boolean"
  );
}

/**
 * PM2.5 spread, in µg/m³, below which a correlation cannot discriminate a
 * working scorer from a broken one.
 *
 * 20 µg/m³ is roughly the WHO 24-hour guideline. Observed clean-air days in
 * the first month of operation spanned 3–20, so the whole dataset fell
 * inside it. A real episode in the burning season clears 50–120, which is
 * what will finally make the number meaningful.
 */
export const HAZE_TESTABLE_SPREAD = 20;

export async function fetchCnxHazeVision(): Promise<HazeVisionResponse> {
  const data = await readRelayJson(HAZE_VISION_KV_KEY, STALE_MS, isHazeVisionPayload);
  if (data) return { ...data, provenance: "live", methodology: HAZE_METHODOLOGY, note: null };
  return {
    generatedAt: new Date().toISOString(),
    cameras: [],
    agreement: { r: null, pairs: 0, pm25Min: null, pm25Max: null, pm25Median: null, pm25P95: null, eventReadings: 0, spansHazeEvent: false },
    provenance: "unavailable",
    methodology: HAZE_METHODOLOGY,
    note: "The webcam haze relay has not reported in the last 45 minutes — no camera verdicts are shown.",
  };
}
