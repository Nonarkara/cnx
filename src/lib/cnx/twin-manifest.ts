// CNX twin manifest — the machine-readable list of what this twin is made of.
//
// ISO/IEC 30173 §3.1.1 defines a digital twin by its data connections and
// "an appropriate rate of synchronization". This file is where CNX declares
// that rate for every feed: how often it should arrive (`cadenceSec`), when
// it counts as late (`staleAfterSec`), how it reaches the board
// (`transport`), what the number is good for (`fidelity`) and what it must
// never be used to conclude. `/api/cnx/manifest.json` serves it with live
// fields added; the top bar's freshness strip reads it back.
//
// Same rule as `getLayerContract()`: a data route that is not in this
// registry, and not on `MANIFEST_EXCLUDED_ROUTES` with a reason, fails the
// test in twin-manifest.test.ts. An unknown feed is not a clean feed.
//
// Pure and client-safe: no I/O here. The server-side probes live in
// twin-manifest-live.ts.

import { LAYER_CONTRACTS, type ValidationStatus } from "./layer-contract";

export type TwinKind = "measured" | "satellite" | "model" | "vision" | "static" | "derived";
export type TwinTransport = "direct" | "relay" | "baked";

/**
 * What `lastObservedAt` is the time OF. The board's rule (CNXDataAge) is to
 * age the observation, not the response; where an upstream publishes no
 * observation time, the manifest says which clock it used instead rather
 * than passing a fetch time off as a measurement time.
 */
export type TwinClock =
  /** The upstream's own measurement time (newest reading). */
  | "observation"
  /** Model run / forecast issuance time. */
  | "issuance"
  /** When the off-Cloudflare relay last wrote this feed's KV key. */
  | "relay-push"
  /** When the upstream last answered with live data; it publishes no observation time. */
  | "upstream-answer"
  /** When the baked file was built. */
  | "bake"
  /** Nothing to age (static reference data, or an output of this board). */
  | "none";

export interface Bilingual {
  th: string;
  en: string;
}

export interface TwinEntity {
  id: string;
  name_th: string;
  name_en: string;
  kind: TwinKind;
  upstream: { agency: string; host: string };
  licence: string;
  /** Where the board reads it: an `/api/cnx/…` route, or a baked `/data/…` file. */
  route: string;
  /** Expected interval between fresh values. Null = no schedule (static). */
  cadenceSec: number | null;
  /** Past this age the feed is late. Null = no freshness SLO declared. */
  staleAfterSec: number | null;
  transport: TwinTransport;
  /** KV key the relay writes, for `transport: "relay"`. */
  relayKey: string | null;
  /** What the value is good for, in one sentence. */
  fidelity: string;
  mustNotConclude: Bilingual;
  /** LAYER_CONTRACTS id whose boundary is reused, if any. */
  layerContract: string | null;
  validation: ValidationStatus;
  failureMode: string;
  clock: TwinClock;
}

/** Live fields the route adds per entity. */
export interface LiveReading {
  lastObservedAt: string | null;
  /** The feed's own provenance word ("live", "model", "unavailable", …), or null when not probed. */
  provenance: string | null;
}

export type SloState = "within" | "stale" | "missing" | "no-slo";

export interface ManifestEntity extends TwinEntity, LiveReading {
  /** True within the SLO; false when stale OR when there is no observation; null when no SLO is declared. */
  withinSlo: boolean | null;
  sloState: SloState;
  ageSec: number | null;
}

export interface RelayHealth {
  /** Newest relay-written payload across RELAY_HEALTH_IDS. */
  newestAt: string | null;
  ageSec: number | null;
  offline: boolean;
  offlineAfterSec: number;
  feeds: { id: string; key: string; generatedAt: string | null }[];
}

export interface TwinManifest {
  schema: "cnx-twin-manifest/1";
  name: string;
  version: string;
  commit: string;
  generatedAt: string;
  entities: ManifestEntity[];
  relay: RelayHealth;
  slo: { onTime: number; total: number };
  excludedRoutes: Record<string, string>;
}

const MIN = 60;
const HOUR = 3_600;
const DAY = 86_400;

/** The relay is offline when its newest payload is older than this. */
export const RELAY_OFFLINE_AFTER_SEC = 45 * MIN;

/** Relay-written feeds whose newest `generatedAt` is the relay's heartbeat. */
export const RELAY_HEALTH_IDS = ["river-level", "rain", "social", "citizen", "haze-vision", "water-vision", "flights", "dam"] as const;

const NOT_STATED = "Not stated by the publisher; public keyless endpoint, attributed on the panel";
const OPEN_METEO = "CC BY 4.0 (Open-Meteo), attributed";
const THAIWATER = { agency: "HII ThaiWater (สสน.)", host: "api-v3.thaiwater.net" };

const contract = (id: keyof typeof LAYER_CONTRACTS): { mustNotConclude: Bilingual; layerContract: string } => ({
  mustNotConclude: LAYER_CONTRACTS[id].mustNotConclude,
  layerContract: id,
});

/**
 * The registry, built from docs/SOURCES.md §1–5 and §8. Cadences and
 * stale limits mirror the modules' own constants (asserted in the test),
 * so a change in one place that is not made in the other is caught.
 */
export const TWIN_ENTITIES: readonly TwinEntity[] = [
  // ── Air ──
  {
    id: "air4thai", name_th: "สถานีคุณภาพอากาศ คพ. (Air4Thai)", name_en: "PCD air stations (Air4Thai)",
    kind: "measured", upstream: { agency: "Pollution Control Department (กรมควบคุมมลพิษ)", host: "air4thai.pcd.go.th" },
    licence: NOT_STATED, route: "/api/cnx/air-quality", cadenceSec: 5 * MIN, staleAfterSec: 3 * HOUR,
    transport: "direct", relayKey: null,
    fidelity: "Official reference-grade PM2.5/PM10 at a handful of fixed stations; the province average is a mean of the few reporting.",
    mustNotConclude: { th: "ค่าที่สถานีไม่ใช่ค่าทั้งจังหวัด และสถานีที่เงียบตอนกลางคืนไม่ได้แปลว่าอากาศดี", en: "A station reading is not the whole province, and a station gone quiet overnight is not clean air" },
    layerContract: null, validation: "cross-checked",
    failureMode: "Provincial stations go quiet overnight; the board reports 0 fresh monitors rather than carrying yesterday's reading forward.",
    clock: "observation",
  },
  {
    id: "dustboy", name_th: "เซนเซอร์ DustBoy (มช.)", name_en: "DustBoy sensors (CMU CCDC)",
    kind: "measured", upstream: { agency: "CMU Climate Change Data Center", host: "www-old.cmuccdc.org" },
    licence: NOT_STATED, route: "/api/cnx/dustboy", cadenceSec: 10 * MIN, staleAfterSec: 3 * HOUR,
    transport: "direct", relayKey: null,
    fidelity: "Low-cost optical PM2.5 sensors, dense across the basin; one hourly batch, outliers flagged against provincial peers.",
    mustNotConclude: { th: "ค่าเซนเซอร์ราคาประหยัดไม่ใช่ค่าอ้างอิงทางการ ห้ามใช้แทนประกาศ คพ.", en: "A low-cost sensor value is not an official reference reading and must not stand in for a PCD notice" },
    layerContract: null, validation: "cross-checked",
    failureMode: "The feed is one hourly batch, not 236 independent clocks; after 3 h the board says stale. log_datetime is UTC despite looking Bangkok-local.",
    clock: "observation",
  },
  {
    id: "cams-aod", name_th: "ฝุ่นละอองทั้งคอลัมน์ (แบบจำลอง CAMS)", name_en: "Column aerosol (CAMS model)",
    kind: "model", upstream: { agency: "Copernicus CAMS via Open-Meteo", host: "air-quality-api.open-meteo.com" },
    licence: OPEN_METEO, route: "/api/cnx/aerosol", cadenceSec: 30 * MIN, staleAfterSec: 2 * HOUR,
    transport: "direct", relayKey: null,
    fidelity: "Global model aerosol optical depth for one grid cell; regional context, not a local measurement.",
    mustNotConclude: { th: "AOD ทั้งคอลัมน์ไม่ใช่ PM2.5 ที่ผิวดินและไม่ใช่เกณฑ์สุขภาพ", en: "Column AOD is not surface PM2.5 and not a health threshold" },
    layerContract: null, validation: "none",
    failureMode: "A model, not a measurement; one grid cell, so map dots are scaled copies of it. Missing → no model output, never clear sky.",
    clock: "upstream-answer",
  },
  {
    id: "aeronet", name_th: "โฟโตมิเตอร์ AERONET เชียงใหม่", name_en: "AERONET photometer, Chiang Mai",
    kind: "measured", upstream: { agency: "NASA GSFC AERONET", host: "aeronet.gsfc.nasa.gov" },
    licence: "NASA open data, attributed", route: "/api/cnx/aeronet", cadenceSec: HOUR, staleAfterSec: 3 * DAY,
    transport: "direct", relayKey: null,
    fidelity: "Ground sun-photometer daily AOD and Ångström exponent at one site; tells smoke from dust, not surface concentration.",
    mustNotConclude: { th: "วันที่ไม่มีข้อมูลเพราะเมฆบังไม่ได้แปลว่าอากาศสะอาด", en: "A day missing because of cloud is not a clean day" },
    layerContract: null, validation: "ground-truthed",
    failureMode: "Cloud-screened: cloudy days are simply missing, not zero. A gap in the series is not a clean day.",
    clock: "observation",
  },
  {
    id: "gistda-pm25", name_th: "PM2.5 รายอำเภอ (GISTDA)", name_en: "Per-district PM2.5 (GISTDA)",
    kind: "satellite", upstream: { agency: "GISTDA via Longdo Map", host: "map.longdo.com" },
    licence: NOT_STATED, route: "/api/cnx/aqi-amphoe", cadenceSec: 5 * MIN, staleAfterSec: 3 * HOUR,
    transport: "direct", relayKey: null,
    fidelity: "Satellite/model-derived PM2.5 per district; fills the gaps between stations at district resolution.",
    mustNotConclude: { th: "ค่ารายอำเภอจากดาวเทียมไม่ใช่การวัดที่ผิวดิน ต้องตรวจกับสถานีภาคพื้น", en: "A satellite district value is not a surface measurement; cross-check with ground stations" },
    layerContract: null, validation: "none",
    failureMode: "A tile service, not a documented API; shape changes surface as unavailable, never as a reading.",
    clock: "observation",
  },
  // ── Fire and smoke ──
  {
    id: "firms", name_th: "จุดความร้อน NASA FIRMS (VIIRS)", name_en: "NASA FIRMS hotspots (VIIRS)",
    kind: "satellite", upstream: { agency: "NASA LANCE FIRMS", host: "firms.modaps.eosdis.nasa.gov" },
    licence: "NASA open data, attributed", route: "/api/cnx/fires", cadenceSec: 10 * MIN, staleAfterSec: HOUR,
    transport: "direct", relayKey: null,
    fidelity: "Thermal anomalies from VIIRS passes over the Chiang Mai box, published within ~3 h of the pass.",
    mustNotConclude: { th: "ไม่มีจุดความร้อนไม่ได้แปลว่าไม่มีไฟ — เมฆและเวลาโคจรบังได้", en: "No hotspot is not no fire — cloud and pass timing can hide it" },
    layerContract: null, validation: "none",
    failureMode: "A 1-day window can return a valid empty body indistinguishable from no fires; the module fetches 2 days as the liveness proof and reports 24 h. Failure → illustrated scenario, never scored.",
    clock: "upstream-answer",
  },
  {
    id: "rfd-fires", name_th: "จุดความร้อนกรมป่าไม้", name_en: "Royal Forest Department hotspots",
    kind: "satellite", upstream: { agency: "Royal Forest Department (กรมป่าไม้)", host: "wildfire.forest.go.th" },
    licence: NOT_STATED, route: "/api/cnx/fires-rfd", cadenceSec: 30 * MIN, staleAfterSec: 2 * HOUR,
    transport: "direct", relayKey: null,
    fidelity: "Seven-day accumulation of agency hotspots classified by land tenure (reserve, park, community forest).",
    mustNotConclude: { th: "จุดสะสม 7 วันไม่ใช่ไฟที่กำลังไหม้อยู่", en: "A 7-day accumulation is not fire burning now" },
    layerContract: null, validation: "none",
    failureMode: "Often 0 in the Chiang Mai box for days; an unreachable host is reported unavailable, not zero.",
    clock: "upstream-answer",
  },
  {
    id: "smoke-trajectory", name_th: "ทิศทางควัน (คำนวณแนวตรง)", name_en: "Smoke trajectory (straight-line)",
    kind: "derived", upstream: { agency: "Open-Meteo wind + NASA FIRMS", host: "api.open-meteo.com" },
    licence: OPEN_METEO, route: "/api/cnx/smoke-trajectory", cadenceSec: 10 * MIN, staleAfterSec: HOUR,
    transport: "direct", relayKey: null,
    fidelity: "1/3/6 h straight-line advection of live VIIRS hotspots inside 350 km by surface wind.",
    mustNotConclude: { th: "เส้นทางควันแนวตรงไม่ใช่การพยากรณ์การกระจายตัว", en: "A straight-line plume is not a dispersion forecast" },
    layerContract: null, validation: "none",
    failureMode: "Drawn only from a live VIIRS pass; without one provenance is unavailable and no segment is drawn.",
    clock: "upstream-answer",
  },
  // ── Water ──
  {
    id: "river-level", name_th: "ระดับน้ำแม่น้ำ (สถานีวัด)", name_en: "River levels (gauges)",
    kind: "measured", upstream: THAIWATER,
    licence: NOT_STATED, route: "/api/cnx/river-level", cadenceSec: 10 * MIN, staleAfterSec: 45 * MIN,
    transport: "relay", relayKey: "river-level-latest",
    fidelity: "Telemetered water level at Ping-basin gauges against bank height; the projection runs at the edge, not on the relay.",
    ...contract("ping-gauges"), validation: "none",
    failureMode: "ThaiWater rate-limits Cloudflare egress (429), so the relay reads it; relay copies older than 45 min fall back to the direct read, which may 429 and leave the axis blind.",
    clock: "relay-push",
  },
  {
    id: "rain", name_th: "ฝนสะสม 24 ชม. (สถานีวัด)", name_en: "24-hour rainfall (gauges)",
    kind: "measured", upstream: THAIWATER,
    licence: NOT_STATED, route: "/api/cnx/rain", cadenceSec: 15 * MIN, staleAfterSec: HOUR,
    transport: "relay", relayKey: "rain-24h-latest",
    fidelity: "Measured 24 h rainfall at ~340 Chiang Mai gauges (DWR, RID, TMD, HII), banded on TMD classes.",
    ...contract("rainfall-stations"), validation: "none",
    failureMode: "Relay silent > 60 min, or no gauge reading inside 6 h → unavailable: rainfall is unknown, not zero.",
    clock: "relay-push",
  },
  {
    id: "dam", name_th: "ปริมาณน้ำในเขื่อน (รายงานกรมชลประทาน)", name_en: "Reservoir storage (RID daily report)",
    kind: "measured", upstream: THAIWATER,
    licence: NOT_STATED, route: "/api/cnx/dam", cadenceSec: HOUR, staleAfterSec: 3 * HOUR,
    transport: "relay", relayKey: "dam-daily-latest",
    fidelity: "RID daily report: storage, % of normal storage, inflow, release and spill for Ping-basin large dams and Chiang Mai reservoirs.",
    ...contract("reservoirs"), validation: "cross-checked",
    failureMode: "A daily report, not a sensor; reports older than 2 days are dropped. Relay silent > 3 h → unavailable: storage is unknown, not normal.",
    clock: "relay-push",
  },
  {
    id: "floodhub", name_th: "พยากรณ์น้ำท่วม Google Flood Hub", name_en: "Google Flood Hub forecast",
    kind: "model", upstream: { agency: "Google Flood Forecasting", host: "floodforecasting.googleapis.com" },
    licence: "Data CC BY 4.0; API terms limit use to non-commercial", route: "/api/cnx/floodhub", cadenceSec: 30 * MIN, staleAfterSec: 30 * HOUR,
    transport: "direct", relayKey: null,
    fidelity: "7-day riverine model forecast at virtual gauges; none of the 12 nearest Chiang Mai is quality-verified.",
    mustNotConclude: { th: "ไม่มีการพยากรณ์น้ำท่วมไม่ได้แปลว่าปลอดภัย และจุดเสมือนไม่ใช่สถานีวัดจริง", en: "No forecast flooding is not safety, and a virtual gauge is not a physical one" },
    layerContract: null, validation: "none",
    failureMode: "Model only; newest issuance older than 30 h is stale. No key or no answer → unavailable, outlook unknown, never safe.",
    clock: "issuance",
  },
  {
    id: "forecast-field", name_th: "สนามพยากรณ์ฝนและลม 48 ชม.", name_en: "48-hour rain and wind forecast field",
    kind: "model", upstream: { agency: "Open-Meteo forecast and CAMS grids", host: "api.open-meteo.com" },
    licence: OPEN_METEO, route: "/api/cnx/forecast-field", cadenceSec: 3 * HOUR, staleAfterSec: 6 * HOUR,
    transport: "direct", relayKey: null,
    fidelity: "~30 km model grid of hourly wind, precipitation and PM2.5 for 48 h, shared in KV and refreshed at most every 3 h.",
    mustNotConclude: { th: "แบบจำลองช่องละ ~30 กม. มองไม่เห็นพายุในหุบเขา ไม่ใช่คำเตือนทางการ", en: "A ~30 km model cell cannot see a valley storm, and it is not an official warning" },
    layerContract: null, validation: "none",
    failureMode: "Refresh failure serves the last run only while it still covers now, else unavailable and no field is drawn; missing PM2.5 → 'no PM2.5 forecast', never 'clean'.",
    clock: "issuance",
  },
  {
    id: "official-warnings", name_th: "ประกาศเตือนภัยทางการ (กรมอุตุนิยมวิทยา)", name_en: "Official warnings (TMD CAP)",
    kind: "derived", upstream: { agency: "Thai Meteorological Department (WMO alerting authority)", host: "www.tmd.go.th" },
    licence: "Public domain (marked in the CAP feed)", route: "/api/cnx/official-warnings", cadenceSec: 10 * MIN, staleAfterSec: 40 * MIN,
    transport: "direct", relayKey: null,
    fidelity: "TMD's signed CAP 1.2 alerts filtered to TH-50 or polygons touching the province, passed through as issued.",
    mustNotConclude: { th: "ไม่มีประกาศ TMD ที่มีผลไม่ได้แปลว่าปลอดภัย", en: "No active TMD alert is not an all-clear" },
    layerContract: null, validation: "none",
    failureMode: "Feed unreachable or throttled → unavailable, cached 30 min; the board says no TMD alert is in effect, never safe.",
    clock: "upstream-answer",
  },
  {
    id: "cap-export", name_th: "ส่งออก CAP 1.2 ของกระดาน", name_en: "Board CAP 1.2 export",
    kind: "derived", upstream: { agency: "This board (CNX)", host: "cnx.nonarkara.org" },
    licence: "Restricted scope: decision support, not a public warning", route: "/api/cnx/cap.xml", cadenceSec: 10 * MIN, staleAfterSec: null,
    transport: "direct", relayKey: null,
    fidelity: "The board's own active outlook and verdict items as CAP 1.2 with scope=Restricted, for integrators.",
    mustNotConclude: { th: "ไม่ใช่ประกาศเตือนภัยทางการ แหล่งทางการคือ กรมอุตุนิยมวิทยา และ ปภ.", en: "Not an official public warning; official sources are TMD and DDPM" },
    layerContract: null, validation: "none",
    failureMode: "An output of this board, not an observation; it inherits every input's gaps.",
    clock: "none",
  },
  {
    id: "shelters", name_th: "ศูนย์พักพิงชั่วคราว", name_en: "Temporary flood shelters",
    kind: "static", upstream: { agency: "Chiang Mai Provincial Office (สำนักงานจังหวัดเชียงใหม่)", host: "chiangmai.gdcatalog.go.th" },
    licence: "Per gdcatalog dataset licence; geocodes © OpenStreetMap contributors (ODbL)", route: "/data/cnx/shelters.json", cadenceSec: null, staleAfterSec: null,
    transport: "baked", relayKey: null,
    fidelity: "177 official shelters geocoded at building, subdistrict or district precision; every point carries its precision.",
    mustNotConclude: { th: "ตำแหน่งโดยประมาณไม่ใช่ที่ตั้งจริงของอาคาร และรายชื่อไม่ได้บอกว่าศูนย์เปิดอยู่", en: "An approximate point is not the building, and the list does not say a shelter is open" },
    layerContract: null, validation: "cross-checked",
    failureMode: "The official list has no coordinates; rows the provincial office verifies override any geocode. A rebuild is manual.",
    clock: "bake",
  },
  // ── Cameras and vision ──
  {
    id: "cctv", name_th: "กล้องสาธารณะ", name_en: "Public cameras",
    kind: "vision", upstream: { agency: "Longdo, ITIC, Windy, municipal", host: "camera.longdo.com" },
    licence: NOT_STATED, route: "/api/cnx/cctv", cadenceSec: MIN, staleAfterSec: 10 * MIN,
    transport: "direct", relayKey: null,
    fidelity: "Positions and reachability of public cameras in the operations box; no video is recorded.",
    mustNotConclude: { th: "กล้องที่เข้าถึงได้ไม่ได้แปลว่ามีคนเฝ้าดูอยู่", en: "A reachable camera does not mean anyone is watching it" },
    layerContract: null, validation: "none",
    failureMode: "Hosts drop in and out (4 of 9 Longdo reachable at last check); unreachable cameras are listed as such.",
    clock: "upstream-answer",
  },
  {
    id: "flood-cameras", name_th: "กล้องเฝ้าระวังน้ำท่วม (Maholan)", name_en: "Flood cameras (Maholan)",
    kind: "vision", upstream: { agency: "Maholan flood CCTV wall", host: "cctv.maholan.net" },
    licence: "Community catalogue, credited verbatim", route: "/api/cnx/flood-cameras", cadenceSec: 15 * MIN, staleAfterSec: HOUR,
    transport: "direct", relayKey: null,
    fidelity: "Catalogue metadata for the flood cameras inside the Chiang Mai box; stills are fetched by the viewer, not stored.",
    mustNotConclude: { th: "ภาพนิ่งจากกล้องไม่ใช่การวัดระดับน้ำ", en: "A camera still is not a water-level measurement" },
    layerContract: null, validation: "none",
    failureMode: "A 906 KB national catalogue with no filter; failure → unavailable with the last catalogue time.",
    clock: "observation",
  },
  {
    id: "haze-vision", name_th: "ประเมินหมอกควันจากภาพกล้อง", name_en: "Camera haze vision",
    kind: "vision", upstream: { agency: "Windy webcams, scored on the relay", host: "webcams.windy.com" },
    licence: NOT_STATED, route: "/api/cnx/haze-vision", cadenceSec: 10 * MIN, staleAfterSec: 45 * MIN,
    transport: "relay", relayKey: "haze-vision-latest",
    fidelity: "Image statistics from a few cameras turned into a haze screening verdict; no images are kept.",
    mustNotConclude: { th: "คำตัดสินจากภาพเป็นการคัดกรอง ไม่ใช่การวัดฝุ่น", en: "An image verdict is screening, not a dust measurement" },
    layerContract: null, validation: "cross-checked",
    failureMode: "Agreement requires varied paired readings and at least 3 independent station IDs in a 3-hour high-reading window; this is an engineering corroboration gate, not validated detection accuracy. Relay silent > 45 min → unavailable.",
    clock: "relay-push",
  },
  {
    id: "water-vision", name_th: "ตรวจคุณภาพภาพแม่น้ำ", name_en: "River image inspection",
    kind: "vision", upstream: { agency: "Department of Water Resources snapshots via FloodDash", host: "flood.nonarkara.org" },
    licence: NOT_STATED, route: "/api/cnx/water-vision", cadenceSec: 15 * MIN, staleAfterSec: 45 * MIN,
    transport: "relay", relayKey: "water-vision-latest",
    fidelity: "Image quality and repeated-pixel checks on three pinned public DWR riverside snapshots; not flood detection, water segmentation, depth or flow measurement.",
    mustNotConclude: { th: "ภาพที่ตรวจได้ไม่ยืนยันน้ำท่วม ระดับน้ำ หรือความปลอดภัยของถนน", en: "An inspectable image is not flood detection, a water-level measurement or road-safety evidence" },
    layerContract: null, validation: "none",
    failureMode: "Relay batch silent > 45 min → unavailable. Capture timestamps are aged separately at 45 min; unknown capture time, low light, low detail or repeated old pixels never establish current water conditions. Manifest clock is relay-push, not camera capture.",
    clock: "relay-push",
  },
  // ── Civic and media ──
  {
    id: "citizen", name_th: "รายงานจากประชาชนและสื่อท้องถิ่น", name_en: "Citizen and local media reports",
    kind: "derived", upstream: { agency: "Reddit and local news, geocoded with OSM", host: "www.reddit.com" },
    licence: "Headlines quoted with attribution; gazetteer © OpenStreetMap contributors (ODbL)", route: "/api/cnx/citizen", cadenceSec: 30 * MIN, staleAfterSec: 3 * HOUR,
    transport: "relay", relayKey: "citizen-reports-latest",
    fidelity: "Place-pinned haze mentions at the precision the text supports, without author identity.",
    mustNotConclude: { th: "การกล่าวถึงไม่ใช่การยืนยันเหตุการณ์ และตำแหน่งระดับอำเภอไม่ใช่ที่อยู่", en: "A mention is not a confirmed event, and a district-level pin is not an address" },
    layerContract: null, validation: "none",
    failureMode: "Relay silent > 3 h → unavailable; a district-level mention is never drawn as a street address.",
    clock: "relay-push",
  },
  {
    id: "social", name_th: "ข่าวและการรับฟังสื่อ", name_en: "News listening",
    kind: "derived", upstream: { agency: "Google News RSS and GDELT", host: "news.google.com" },
    licence: "Headlines quoted with attribution (Google News, GDELT)", route: "/api/cnx/social", cadenceSec: 10 * MIN, staleAfterSec: 20 * MIN,
    transport: "relay", relayKey: "social-rss-latest",
    fidelity: "Thai and English headlines about the province, toned by keyword; a reading of coverage, not of events.",
    mustNotConclude: { th: "พาดหัวข่าวไม่ใช่การยืนยันสถานการณ์", en: "A headline is not a confirmed situation" },
    layerContract: null, validation: "none",
    failureMode: "Relay copy older than 20 min falls back to direct reads; cold-start placeholders are badged and excluded from the answer corpus.",
    clock: "relay-push",
  },
  // ── Mobility ──
  {
    id: "flights", name_th: "อากาศยาน (ADS-B)", name_en: "Aircraft (ADS-B)",
    kind: "measured", upstream: { agency: "OpenSky Network, adsb.lol", host: "opensky-network.org" },
    licence: "OpenSky terms (non-commercial), attributed", route: "/api/cnx/flights", cadenceSec: 30, staleAfterSec: 3 * MIN,
    transport: "relay", relayKey: "latest-snapshot",
    fidelity: "ADS-B state vectors around CNX; low traffic is normal and is not an outage.",
    mustNotConclude: { th: "เครื่องบินน้อยลำเป็นค่าปกติของสนามบินนี้ ไม่ใช่ระบบล่ม", en: "Few aircraft is normal here, not a fault" },
    layerContract: null, validation: "none",
    failureMode: "Relay snapshot older than 3 min is ignored and the route reports degraded rather than freezing positions.",
    clock: "relay-push",
  },
  {
    id: "arrivals", name_th: "เที่ยวบินขาเข้าและนักท่องเที่ยวโดยประมาณ", name_en: "Arrivals and estimated visitors",
    kind: "derived", upstream: { agency: "OpenSky Network arrivals", host: "opensky-network.org" },
    licence: "OpenSky terms (non-commercial), attributed", route: "/api/cnx/arrivals", cadenceSec: HOUR, staleAfterSec: 6 * HOUR,
    transport: "relay", relayKey: "arrivals-latest",
    fidelity: "Observed flights per day by origin country; passenger numbers are estimated from seat capacity × 82% load factor.",
    mustNotConclude: { th: "จำนวนผู้โดยสารเป็นค่าประมาณ ไม่ใช่สถิติทางการ", en: "Passenger counts are estimates, not official statistics" },
    layerContract: null, validation: "none",
    failureMode: "Relay copy older than 6 h is treated as a dead relay and ignored.",
    clock: "relay-push",
  },
  {
    id: "weather-imagery", name_th: "เรดาร์ฝนและภาพดาวเทียม", name_en: "Rain radar and satellite imagery",
    kind: "satellite", upstream: { agency: "RainViewer, NASA GIBS (Himawari-9, MODIS)", host: "gibs.earthdata.nasa.gov" },
    licence: "Open, attributed (RainViewer, NASA GIBS)", route: "/api/cnx/weather-layers", cadenceSec: 10 * MIN, staleAfterSec: 2 * HOUR,
    transport: "direct", relayKey: null,
    fidelity: "Tile layers for radar precipitation, Himawari infrared and daily MODIS AOD; pictures, not values.",
    mustNotConclude: { th: "ภาพเรดาร์และดาวเทียมเป็นภาพ ไม่ใช่ค่าที่วัดได้ ณ จุด", en: "Radar and satellite tiles are pictures, not point measurements" },
    layerContract: null, validation: "none",
    failureMode: "GIBS has no 'latest' endpoint; times are probed newest-first and a layer with no resolvable time is omitted.",
    clock: "observation",
  },
  {
    id: "jaxa-aot", name_th: "ความลึกเชิงแสงฝุ่น JAXA GCOM-C", name_en: "JAXA GCOM-C aerosol optical thickness",
    kind: "satellite", upstream: { agency: "JAXA G-Portal (static STAC)", host: "s3.ap-northeast-1.wasabisys.com" },
    licence: "Proprietary (JAXA); licence travels with the response", route: "/api/cnx/jaxa-aot", cadenceSec: 30 * MIN, staleAfterSec: 3 * DAY,
    transport: "direct", relayKey: null,
    fidelity: "Newest daily SGLI aerosol scene, walked back from today.",
    mustNotConclude: { th: "AOT จากดาวเทียมไม่ใช่ PM2.5 ที่ผิวดิน", en: "Satellite AOT is not surface PM2.5" },
    layerContract: null, validation: "none",
    failureMode: "No scene resolvable within the walk-back → unavailable with the reason; access generates a log, so the route is rate-limited.",
    clock: "observation",
  },
  // ── Reference and baked ──
  {
    id: "open-data", name_th: "ดัชนีข้อมูลเปิด data.go.th", name_en: "data.go.th open-data index",
    kind: "static", upstream: { agency: "Digital Government Development Agency (data.go.th)", host: "data.go.th" },
    licence: "Per-dataset licence on data.go.th", route: "/api/cnx/open-data", cadenceSec: null, staleAfterSec: 14 * DAY,
    transport: "baked", relayKey: null,
    fidelity: "A dated snapshot of one filtered Thai-language search, not a population count of the catalogue.",
    mustNotConclude: { th: "จำนวนชุดข้อมูลในดัชนีไม่ใช่จำนวนทั้งหมดของจังหวัด", en: "The dataset count is one search's snapshot, not the province's total" },
    layerContract: null, validation: "none",
    failureMode: "Baked by a manual script with no cron, so it drifts silently; amber past 14 days.",
    clock: "bake",
  },
  {
    id: "asmc", name_th: "ประเมินหมอกควันข้ามแดน ASMC", name_en: "ASMC transboundary haze",
    kind: "satellite", upstream: { agency: "ASEAN Specialised Meteorological Centre", host: "none known" },
    licence: NOT_STATED, route: "/api/cnx/asmc", cadenceSec: 30 * MIN, staleAfterSec: null,
    transport: "direct", relayKey: null,
    fidelity: "Regional hotspot counts and haze assessment, when a working host and key exist.",
    mustNotConclude: { th: "ไม่มีข้อมูล ASMC ไม่ได้แปลว่าไม่มีหมอกควันข้ามแดน", en: "No ASMC data is not an absence of transboundary haze" },
    layerContract: null, validation: "none",
    failureMode: "No public API host is known; the module returns needs-key rather than a fabricated reading. No SLO until it is wired.",
    clock: "observation",
  },
  {
    id: "waterways", name_th: "ลำน้ำ (OpenStreetMap)", name_en: "Waterways (OpenStreetMap)",
    kind: "static", upstream: { agency: "OpenStreetMap contributors", host: "overpass-api.de" },
    licence: "ODbL (© OpenStreetMap contributors)", route: "/api/cnx/waterways", cadenceSec: null, staleAfterSec: null,
    transport: "baked", relayKey: null,
    fidelity: "Mapped river and canal lines; geometry, not water.",
    mustNotConclude: { th: "เส้นลำน้ำไม่ได้บอกว่ามีน้ำหรือน้ำท่วม", en: "A mapped waterway says nothing about water in it" },
    layerContract: null, validation: "none",
    failureMode: "Baked; falls back to live Overpass only if the bake is missing.",
    clock: "none",
  },
  {
    id: "bus-routes", name_th: "เส้นทางรถโดยสาร", name_en: "Bus routes",
    kind: "static", upstream: { agency: "OpenStreetMap contributors", host: "overpass-api.de" },
    licence: "ODbL (© OpenStreetMap contributors)", route: "/api/cnx/bus-routes", cadenceSec: null, staleAfterSec: null,
    transport: "baked", relayKey: null,
    fidelity: "Mapped route lines and stops; not timetables or live positions.",
    mustNotConclude: { th: "เส้นทางที่แมปไว้ไม่ได้บอกว่ารถวิ่งอยู่", en: "A mapped route does not say a bus is running" },
    layerContract: null, validation: "none",
    failureMode: "Baked; a self-fetch through the edge failed intermittently, so it reads through the ASSETS binding.",
    clock: "none",
  },
  {
    id: "heritage", name_th: "โบราณสถาน", name_en: "Heritage sites",
    kind: "static", upstream: { agency: "Curated in code", host: "cnx.nonarkara.org" },
    licence: "Curated reference list", route: "/api/cnx/heritage", cadenceSec: null, staleAfterSec: null,
    transport: "baked", relayKey: null,
    fidelity: "A short curated list of old-city sites for orientation.",
    mustNotConclude: { th: "รายการนี้ไม่ใช่ทะเบียนโบราณสถานทางการ", en: "This is not the official heritage register" },
    layerContract: null, validation: "none",
    failureMode: "Static; cannot fail except by being out of date.",
    clock: "none",
  },
  {
    id: "burnscar", name_th: "ร่องรอยการเผาไหม้ (สสน.)", name_en: "Burn scars (HII)",
    kind: "satellite", upstream: { agency: "HII burn-scar TMS", host: "tamroypao.hii.or.th" },
    licence: NOT_STATED, route: "/api/cnx/burnscar", cadenceSec: null, staleAfterSec: null,
    transport: "direct", relayKey: null,
    fidelity: "Seasonal burn-scar tiles proxied same-origin; a season's footprint, not current fire.",
    mustNotConclude: { th: "ร่องรอยการเผาไหม้ไม่ใช่ไฟที่กำลังไหม้", en: "A burn scar is not a fire burning now" },
    layerContract: null, validation: "none",
    failureMode: "Upstream tile miss returns an empty tile; season layers are static.",
    clock: "none",
  },
];

/**
 * Route folders under src/app/api/cnx that serve no feed of their own, with
 * the reason. `*\/ingest` folders (relay writes) are excluded by rule.
 */
export const MANIFEST_EXCLUDED_ROUTES: Readonly<Record<string, string>> = {
  "manifest.json": "This manifest.",
  "cap.atom": "Atom index of the cap-export entity's alerts; same content, another envelope.",
  "warning-log": "Verification log of this board's own level changes; an output, not a feed.",
  ask: "Question answering over the feeds listed here; not a feed.",
  build: "Build identity, not data.",
  twin: "The province verdict, derived from the feeds listed here.",
  story: "Narrative over the feeds listed here.",
  flood: "Drill scenario only; answers unavailable without ?scenario= (measured water is river-level, rain, dam).",
  aircraft: "Per-aircraft metadata lookup on demand.",
  outbound: "A view over the flights feed.",
  visitors: "An estimate derived from the flights feed.",
  "snapshot-trend": "History of the outbound view.",
  og: "Share image.",
  ingest: "Relay write endpoints (any …/ingest); they receive feeds, they do not serve them.",
};

export function getTwinEntity(id: string): TwinEntity | null {
  return TWIN_ENTITIES.find((e) => e.id === id) ?? null;
}

/** Age in seconds, or null when there is no readable observation. */
export function ageSeconds(lastObservedAt: string | null, nowMs: number): number | null {
  if (!lastObservedAt) return null;
  const t = Date.parse(lastObservedAt);
  return Number.isFinite(t) ? Math.round((nowMs - t) / 1000) : null;
}

/** Five minutes of publisher clock skew is tolerated; more is not "on time". */
const FUTURE_SKEW_SEC = 5 * MIN;

/**
 * SLO state. No observation is "missing", never "within": a feed that has
 * not been heard from cannot be on time.
 */
export function sloState(staleAfterSec: number | null, lastObservedAt: string | null, nowMs: number): SloState {
  if (staleAfterSec === null) return "no-slo";
  const age = ageSeconds(lastObservedAt, nowMs);
  if (age === null) return "missing";
  if (age < -FUTURE_SKEW_SEC) return "stale";
  return age <= staleAfterSec ? "within" : "stale";
}

export function withinSlo(state: SloState): boolean | null {
  return state === "no-slo" ? null : state === "within";
}

export function relayHealth(readings: Partial<Record<string, LiveReading>>, nowMs: number): RelayHealth {
  const feeds = RELAY_HEALTH_IDS.map((id) => ({ id, key: getTwinEntity(id)?.relayKey ?? id, generatedAt: readings[id]?.lastObservedAt ?? null }));
  let newestAt: string | null = null;
  for (const f of feeds) {
    if (f.generatedAt && Number.isFinite(Date.parse(f.generatedAt)) && (!newestAt || Date.parse(f.generatedAt) > Date.parse(newestAt))) newestAt = f.generatedAt;
  }
  const ageSec = ageSeconds(newestAt, nowMs);
  return { newestAt, ageSec, offline: ageSec === null || ageSec > RELAY_OFFLINE_AFTER_SEC, offlineAfterSec: RELAY_OFFLINE_AFTER_SEC, feeds };
}

export function sloCounts(entities: readonly Pick<ManifestEntity, "staleAfterSec" | "lastObservedAt">[], nowMs: number): { onTime: number; total: number } {
  let onTime = 0;
  let total = 0;
  for (const e of entities) {
    const s = sloState(e.staleAfterSec, e.lastObservedAt, nowMs);
    if (s === "no-slo") continue;
    total += 1;
    if (s === "within") onTime += 1;
  }
  return { onTime, total };
}

/** Static registry + live readings → the served manifest. Pure. */
export function buildManifest(
  readings: Partial<Record<string, LiveReading>>,
  opts: { nowMs: number; version: string; commit: string },
): TwinManifest {
  const entities: ManifestEntity[] = TWIN_ENTITIES.map((e) => {
    const r = readings[e.id];
    const lastObservedAt = r?.lastObservedAt ?? null;
    const state = sloState(e.staleAfterSec, lastObservedAt, opts.nowMs);
    return { ...e, lastObservedAt, provenance: r?.provenance ?? null, withinSlo: withinSlo(state), sloState: state, ageSec: ageSeconds(lastObservedAt, opts.nowMs) };
  });
  return {
    schema: "cnx-twin-manifest/1",
    name: "CNX Chiang Mai operations twin",
    version: opts.version,
    commit: opts.commit,
    generatedAt: new Date(opts.nowMs).toISOString(),
    entities,
    relay: relayHealth(readings, opts.nowMs),
    slo: sloCounts(entities, opts.nowMs),
    excludedRoutes: MANIFEST_EXCLUDED_ROUTES,
  };
}
