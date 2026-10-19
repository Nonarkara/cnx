// One decision-clock view for the haze panel, watch list and map overlays.
// Fetch/assembly times never refresh an observation or a camera frame.
import type { AirQualityResponse } from "../../types/cnx";
import type { DustboyResponse } from "./dustboy";
import type { CameraHaze, HazeVisionResponse } from "./haze-vision";
import type { AerosolResponse } from "./aerosol";
import type { CitizenResponse } from "./citizen-reports";
import type { SmokeTrajectoryResponse } from "./smoke-trajectory";
import { isScorable, MIN_BASELINE_SAMPLES } from "./haze-vision-core";

const HOUR = 3_600_000;
export function currentHazeEvidence(stamp: string | null | undefined, now: number, limitMs: number): boolean {
  const age = stamp ? now - Date.parse(stamp) : NaN;
  return Number.isFinite(age) && age >= -5 * 60_000 && age <= limitMs;
}
const validPm = (pm: unknown): pm is number => typeof pm === "number" && Number.isFinite(pm) && pm >= 0;
export function isAssessedHazeCamera(cam: CameraHaze): boolean {
  if (cam.metrics && ![cam.metrics.meanLuminance, cam.metrics.contrast, cam.metrics.darkChannel, cam.metrics.saturation, cam.metrics.luminanceRange].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1)) return false;
  if (cam.score === null || !Number.isFinite(cam.score) || cam.score < 0 || cam.score > 1 || !cam.metrics || !isScorable(cam.metrics)
    || !Number.isInteger(cam.baselineSamples) || cam.baselineSamples < MIN_BASELINE_SAMPLES) return false;
  return cam.verdict === (cam.score >= 0.5 ? "haze-likely" : cam.score >= 0.25 ? "some-haze" : "clear");
}

export interface HazeWatchInput {
  now: number;
  air?: AirQualityResponse | null;
  dustboy?: DustboyResponse | null;
  aerosol?: AerosolResponse | null;
  hazeVision?: HazeVisionResponse | null;
  citizen?: CitizenResponse | null;
  smoke?: SmokeTrajectoryResponse | null;
}
export function buildHazeWatchState({ now, air, dustboy, aerosol, hazeVision, citizen, smoke }: HazeWatchInput) {
  const freshAir = (air?.stations ?? []).filter(s => validPm(s.pm25) && currentHazeEvidence(s.observedAt, now, 3 * HOUR));
  const freshDustboy = dustboy?.provenance === "live" ? dustboy.stations.filter(s => !s.suspect && validPm(s.pm25) && currentHazeEvidence(s.observedAt, now, 3 * HOUR)) : [];
  const relayCurrent = hazeVision?.provenance === "live" && currentHazeEvidence(hazeVision.generatedAt, now, 45 * 60_000);
  const currentCameras = relayCurrent ? hazeVision!.cameras.filter(c => currentHazeEvidence(c.observedAt, now, 45 * 60_000)) : [];
  const assessedCameras = currentCameras.filter(isAssessedHazeCamera);
  const currentReports = citizen?.provenance === "live" && currentHazeEvidence(citizen.generatedAt, now, 3 * HOUR);
  return {
    freshPcd: freshAir.filter(s => s.source === "pcd"),
    freshModel: freshAir.filter(s => s.source === "open-meteo"),
    freshDustboy,
    chiangMaiDustboy: freshDustboy.filter(s => s.province === "เชียงใหม่"),
    relayCurrent,
    currentCameras,
    staleCameras: (hazeVision?.cameras ?? []).filter(c => !currentCameras.includes(c)),
    assessedCameras,
    hazyCameras: assessedCameras.filter(c => c.verdict !== "clear"),
    currentAerosol: aerosol?.provenance === "model" && validPm(aerosol.aod550) && currentHazeEvidence(aerosol.observedAt, now, 2 * HOUR),
    currentSmoke: smoke?.provenance === "live" && currentHazeEvidence(smoke.generatedAt, now, HOUR),
    reports: currentReports ? citizen!.reports.filter(r => currentHazeEvidence(r.publishedAt, now, 7 * 24 * HOUR)) : [],
  };
}
