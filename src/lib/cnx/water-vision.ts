import { isIsoDate, isNum, isObj, isStr, readRelayJson } from "./relay-kv";
import { WATER_CAMERAS, WATER_CAPTURE_MAX_AGE_MS, WATER_CLOCK_SKEW_MS, WATER_METHODOLOGY, waterImageStatus, type WaterVisionPayload, type WaterVisionResponse, type WaterImageMetrics } from "./water-vision-core";
export type { WaterCamera, WaterVisionResponse, WaterVisionPayload } from "./water-vision-core";
export const WATER_VISION_KV_KEY = "water-vision-latest";

export function isWaterVisionPayload(value: unknown): value is WaterVisionPayload {
  if (!isObj(value) || !isIsoDate(value.generatedAt) || !Array.isArray(value.cameras) || value.cameras.length !== WATER_CAMERAS.length) return false;
  const generated = Date.parse(value.generatedAt);
  const seen = new Set();
  return value.cameras.every(camera => {
    if (!isObj(camera)) return false;
    const pinned = WATER_CAMERAS.find(c => c.cameraId === camera.cameraId);
    if (!pinned || seen.has(camera.cameraId) || !Object.entries(pinned).every(([key, v]) => camera[key] === v)) return false;
    seen.add(camera.cameraId);
    if (!(camera.note === null || isStr(camera.note, 500)) || !(camera.frameChanged === null || typeof camera.frameChanged === "boolean")) return false;
    if (!(camera.collectedAt === null || isIsoDate(camera.collectedAt) && Math.abs(generated - Date.parse(camera.collectedAt)) <= WATER_CLOCK_SKEW_MS)) return false;
    if (!(camera.observedAt === null || isIsoDate(camera.observedAt) && Date.parse(camera.observedAt) <= generated + WATER_CLOCK_SKEW_MS
      && camera.collectedAt !== null && Date.parse(camera.observedAt) <= Date.parse(camera.collectedAt as string) + WATER_CLOCK_SKEW_MS)) return false;
    if (camera.status === "unavailable") return camera.metrics === null && camera.observedAt === null && camera.frameChanged === null;
    if (!camera.collectedAt || !isObj(camera.metrics) || ![camera.metrics.meanLuminance, camera.metrics.contrast, camera.metrics.luminanceRange].every(n => isNum(n) && n >= 0 && n <= 1)) return false;
    return camera.status === waterImageStatus(camera.metrics as unknown as WaterImageMetrics, camera.observedAt as string | null, generated);
  });
}

export async function fetchCnxWaterVision(): Promise<WaterVisionResponse> {
  const data = await readRelayJson(WATER_VISION_KV_KEY, WATER_CAPTURE_MAX_AGE_MS, isWaterVisionPayload);
  if (data) return { ...data, cameras: data.cameras.map(camera => camera.metrics ? { ...camera, status: waterImageStatus(camera.metrics, camera.observedAt, Date.now()) } : camera), provenance: "live", methodology: WATER_METHODOLOGY, note: null };
  return { generatedAt: new Date().toISOString(), cameras: [], provenance: "unavailable", methodology: WATER_METHODOLOGY, note: "No recent water-camera relay batch. Missing imagery does not establish safe water or roads." };
}
