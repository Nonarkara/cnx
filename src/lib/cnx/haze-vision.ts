// Webcam haze read-out: what the relay (scripts/haze-vision.mjs) pushes and
// what /api/cnx/haze-vision serves. Scoring maths lives in haze-vision-core.ts.

import { HAZE_METHODOLOGY, type FrameMetrics, type HazeLabel } from "./haze-vision-core";
import { isAssessedHazeCamera } from "./haze-watch-state";
import { isHttpsUrl, isIsoDate, isNum, isNumOrNull, isObj, isStr, readRelayJson } from "./relay-kv";

export const HAZE_VISION_KV_KEY = "haze-vision-latest";
/** The relay scores every 10 min; 45 min without a push means it is down. */
const STALE_MS = 45 * 60_000;
const MAX_CAMERAS = 60;
const LABELS: HazeLabel[] = ["haze-likely", "some-haze", "clear", "too-dark", "no-colour", "unusable", "calibrating"];

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
   * Pearson r between mean camera score and time-matched DustBoy PM2.5
   * over the relay's history window. Each station/timestamp is counted
   * once, even if several frames or cameras pair with that reading.
   *
   * The context fields exist because a bare `r` is misleading on its own.
   * An association needs a varied window to be informative; it does not
   * establish detection accuracy. The first window had no haze event: every paired PM2.5 in the first
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
    /** How many paired readings reached the operational HAZE_EVENT_UG threshold. */
    eventReadings: number;
    /** Most independent high-reading stations in any three-hour window. Absent in older payloads. */
    eventStations?: number;
    /**
     * A varied, corroborated high-reading window: robust spread
     * (p95 − median ≥ 20 µg/m³), with readings ≥50 from 3 independent
     * station IDs within three hours. This is not certification of a
     * regional haze episode, a health assessment, or detection accuracy.
     */
    spansHazeEvent: boolean;
  };
}

/** Operational high-reading threshold for inspecting agreement, not a health assessment. */
export const HAZE_EVENT_UG = 50;
/** Minimum eventReadings before a window counts as an episode, not a spike. */
export const HAZE_EVENT_MIN_READINGS = 3;

export interface HazeVisionResponse extends HazeVisionPayload {
  provenance: "live" | "unavailable";
  methodology: string;
  note: string | null;
}

function isMetrics(v: unknown): v is FrameMetrics {
  return isObj(v) && [v.meanLuminance, v.contrast, v.darkChannel, v.saturation].every(n => isNum(n) && n >= 0 && n <= 1)
    && (v.luminanceRange === undefined || isNum(v.luminanceRange) && v.luminanceRange >= 0 && v.luminanceRange <= 1);
}

function isCamera(v: unknown): v is CameraHaze {
  if (!isObj(v)) return false;
  const pm = v.nearestPm25;
  const pmOk =
    pm === null ||
    (isObj(pm) && isStr(pm.stationName, 200) && isNum(pm.pm25) && pm.pm25 >= 0 && isNum(pm.distanceKm) && pm.distanceKm >= 0 && pm.distanceKm <= 15 && isIsoDate(pm.observedAt)
      && isIsoDate(v.observedAt) && Math.abs(Date.parse(pm.observedAt) - Date.parse(v.observedAt)) <= 90 * 60_000);
  return (
    isStr(v.cameraId, 100) &&
    isStr(v.label, 200) &&
    isNum(v.latitude) && v.latitude >= -90 && v.latitude <= 90 &&
    isNum(v.longitude) && v.longitude >= -180 && v.longitude <= 180 &&
    isHttpsUrl(v.snapshotUrl) &&
    isIsoDate(v.observedAt) &&
    LABELS.includes(v.verdict as HazeLabel) &&
    isNumOrNull(v.score) &&
    (v.metrics === null || isMetrics(v.metrics)) &&
    isNum(v.baselineSamples) && Number.isInteger(v.baselineSamples) && v.baselineSamples >= 0 &&
    pmOk && (["clear", "some-haze", "haze-likely"].includes(v.verdict as string)
      ? isAssessedHazeCamera(v as unknown as CameraHaze) : v.score === null)
  );
}

export function isHazeVisionPayload(v: unknown): v is HazeVisionPayload {
  return (
    isObj(v) &&
    isIsoDate(v.generatedAt) &&
    Array.isArray(v.cameras) &&
    v.cameras.length <= MAX_CAMERAS &&
    v.cameras.every(isCamera) &&
    v.cameras.every(c => {
      const age = Date.parse(v.generatedAt as string) - Date.parse(c.observedAt);
      return age >= -5 * 60_000 && age <= 6 * 3_600_000 &&
        (!c.nearestPm25 || Date.parse(c.nearestPm25.observedAt) <= Date.parse(v.generatedAt as string) + 5 * 60_000);
    }) &&
    isObj(v.agreement) &&
    isNumOrNull(v.agreement.r) &&
    isNum(v.agreement.pairs) &&
    isNumOrNull(v.agreement.pm25Min) &&
    isNumOrNull(v.agreement.pm25Max) &&
    isNumOrNull(v.agreement.pm25Median) &&
    isNumOrNull(v.agreement.pm25P95) &&
    isNum(v.agreement.eventReadings) &&
    (v.agreement.eventStations === undefined || isNum(v.agreement.eventStations) && Number.isInteger(v.agreement.eventStations) && v.agreement.eventStations >= 0 && v.agreement.eventStations <= v.agreement.eventReadings) &&
    typeof v.agreement.spansHazeEvent === "boolean" &&
    (!v.agreement.spansHazeEvent || isNum(v.agreement.eventStations) && v.agreement.eventStations >= 3
      && isNum(v.agreement.pm25Median) && isNum(v.agreement.pm25P95) && v.agreement.pm25P95 - v.agreement.pm25Median >= HAZE_TESTABLE_SPREAD)
  );
}

/**
 * Minimum PM2.5 spread, in µg/m³, before the board calls the agreement
 * window varied enough to inspect against a high-reading episode.
 *
 * This is an engineering diversity gate, not a WHO health guideline or
 * a validation result. A varied response is necessary to interpret the
 * association; it does not establish detection accuracy.
 */
export const HAZE_TESTABLE_SPREAD = 20;

export async function fetchCnxHazeVision(): Promise<HazeVisionResponse> {
  const data = await readRelayJson(HAZE_VISION_KV_KEY, STALE_MS, isHazeVisionPayload);
  if (data) return { ...data, provenance: "live", methodology: HAZE_METHODOLOGY, note: null };
  return {
    generatedAt: new Date().toISOString(),
    cameras: [],
    agreement: { r: null, pairs: 0, pm25Min: null, pm25Max: null, pm25Median: null, pm25P95: null, eventReadings: 0, eventStations: 0, spansHazeEvent: false },
    provenance: "unavailable",
    methodology: HAZE_METHODOLOGY,
    note: "The webcam haze relay has not reported in the last 45 minutes — no camera verdicts are shown.",
  };
}
