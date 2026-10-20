// Import-free contract shared by Node's image relay and the edge API.
// These are public DWR snapshots, never device addresses or camera credentials.
export const WATER_CAPTURE_MAX_AGE_MS = 45 * 60_000;
export const WATER_CLOCK_SKEW_MS = 5 * 60_000;
export const WATER_CAMERAS = [
  { cameraId: "dwr-TA060503", dwrId: "5037139b-443d-4fa7-8bb9-3d2c42697890", label: "สะพานประชานิมิต · แม่น้ำปิง / Prachanimit Bridge · Ping River", latitude: 18.94562, longitude: 98.97523,
    contextTh: "สันโป่ง แม่ริม · จุดดูแม่น้ำปิงนอกตัวเมือง ไม่ใช่ระดับน้ำหรือเวลาน้ำถึงเมือง", contextEn: "San Pong, Mae Rim · Ping viewpoint outside the city; not city water level or an arrival-time forecast" },
  { cameraId: "dwr-TA061016", dwrId: "c14fae72-5023-4f62-8744-dca2d845bdf0", label: "บ้านท่าเดื่อ · น้ำแม่ขาน / Ban Tha Duea · Mae Khan River", latitude: 18.61199, longitude: 98.85105,
    contextTh: "บ้านแม สันป่าตอง · น้ำแม่ขานทางใต้ของตัวเมือง ไม่ใช้เป็นคำเตือนต้นน้ำเมืองเชียงใหม่", contextEn: "Ban Mae, San Pa Tong · Mae Khan south of the city; not an upstream Chiang Mai city warning" },
  { cameraId: "dwr-TA061802", dwrId: "acc67a4e-a1b1-44bf-b2be-70803dd4a040", label: "บ้านโป่ง · น้ำแม่หาด / Ban Pong · Mae Hat River", latitude: 17.85103, longitude: 98.74661,
    contextTh: "โปงทุ่ง ดอยเต่า · ภาคใต้ของจังหวัด ห่างตัวเมือง ไม่ใช้เป็นคำเตือนต้นน้ำเมืองเชียงใหม่", contextEn: "Pong Thung, Doi Tao · southern Chiang Mai province, far outside the city; not an upstream city warning" },
].map(({ dwrId, ...camera }) => ({ ...camera, snapshotUrl: `https://flood.nonarkara.org/api/cctv/dwr?id=${dwrId}`, sourceUrl: "https://telemetry.dwr.go.th/reportCctv", credit: "Department of Water Resources (DWR) · กรมทรัพยากรน้ำ; snapshot relay: FloodDash" }));

export const WATER_METHODOLOGY = "Image visibility and scene-change checks on three public DWR riverside snapshots via FloodDash. Not flood recognition, water depth, flow, road safety or an official warning. Ten-minute source snapshots cannot support a five-second temporal flooding test. Night, glare, obstruction and missing images limit inspection. No person tracking or recognition; only fingerprints and image summary metrics are retained.";
export type WaterImageStatus = "inspectable" | "low-light" | "low-detail" | "stale" | "capture-time-unknown" | "unavailable";
export interface WaterImageMetrics { meanLuminance: number; contrast: number; luminanceRange: number }
export interface WaterCamera extends Omit<(typeof WATER_CAMERAS)[number], never> {
  observedAt: string | null;
  collectedAt: string | null;
  status: WaterImageStatus;
  /** Pixel change only; neither change nor no change establishes water movement. */
  frameChanged: boolean | null;
  metrics: WaterImageMetrics | null;
  note: string | null;
}
export interface WaterVisionPayload { generatedAt: string; cameras: WaterCamera[] }
export interface WaterVisionResponse extends WaterVisionPayload { provenance: "live" | "unavailable"; methodology: string; note: string | null }

export function waterImageStatus(metrics: WaterImageMetrics, observedAt: string | null, now: number): WaterImageStatus {
  const at = Date.parse(observedAt ?? "");
  if (!Number.isFinite(at) || at > now + WATER_CLOCK_SKEW_MS) return "capture-time-unknown";
  if (now - at > WATER_CAPTURE_MAX_AGE_MS) return "stale";
  // Engineering image-readability gates, not validated flood classification.
  if (metrics.meanLuminance < 0.08) return "low-light";
  if (metrics.contrast < 0.025 || metrics.luminanceRange < 0.1) return "low-detail";
  return "inspectable";
}
