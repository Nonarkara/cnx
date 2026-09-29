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
  /** Pearson r between haze score and nearest DustBoy PM2.5 over the
   *  relay's history window, with how many frame/sensor pairs it rests on. */
  agreement: { r: number | null; pairs: number };
}

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
    isNum(v.agreement.pairs)
  );
}

export async function fetchCnxHazeVision(): Promise<HazeVisionResponse> {
  const data = await readRelayJson(HAZE_VISION_KV_KEY, STALE_MS, isHazeVisionPayload);
  if (data) return { ...data, provenance: "live", methodology: HAZE_METHODOLOGY, note: null };
  return {
    generatedAt: new Date().toISOString(),
    cameras: [],
    agreement: { r: null, pairs: 0 },
    provenance: "unavailable",
    methodology: HAZE_METHODOLOGY,
    note: "The webcam haze relay has not reported in the last 45 minutes — no camera verdicts are shown.",
  };
}
