// ─── CNX API response types ──────────────────────────────────────
// Mirror of Lopburi's src/types/lopburi.ts, scoped to Chiang Mai's
// data streams. The shape is the union — when a panel reads from
// multiple endpoints (ticker, story), every feed's payload must be
// represented here so the TS inference stays total.

export type SeverityLevel = "good" | "watch" | "alert" | "critical";

export interface SeverityTag {
  level: SeverityLevel;
  label: string;
}

export interface OfficeNotice {
  source: string;
  title: string;
  detail?: string;
  url?: string;
  issuedAt?: string;
  level: SeverityLevel;
}

// ─── Flood / hydrology ───────────────────────────────────────────

export interface CnxFloodGauge {
  stationId: string;
  name: string;
  river: string;
  basin: string;
  longitude: number;
  latitude: number;
  /** Water level in metres above station zero. */
  levelM: number;
  /** Bank capacity in metres. */
  bankFullM?: number;
  /** Discharge in m³/s if reported. */
  dischargeM3s?: number;
  trend: "rising" | "falling" | "steady";
  severity: SeverityLevel;
  observedAt: string;
}

export interface CnxRainfallStation {
  stationId: string;
  name: string;
  longitude: number;
  latitude: number;
  /** Cumulative rainfall mm in the last 24 h. */
  rainfall24hMm: number;
  /** Rolling mm/h. */
  rainfallNowMmHr: number;
  observedAt: string;
}

export interface CnxReservoir {
  damId: string;
  name: string;
  /** Storage fraction (0–1). */
  fillFraction: number;
  /** Million m³. */
  storageMCM: number;
  inflowM3s?: number;
  outflowM3s?: number;
  observedAt: string;
  severity: SeverityLevel;
}

export interface CnxFloodResponse {
  generatedAt: string;
  gauges: CnxFloodGauge[];
  rainfall: CnxRainfallStation[];
  reservoirs: CnxReservoir[];
  pingCapacityFraction?: number;
  office?: OfficeNotice;
}

// ─── Social listening ─────────────────────────────────────────────

export interface SocialItem {
  id: string;
  source: "google-news" | "gdelt" | "twitter" | "reddit";
  lang: "th" | "en" | "zh" | "ja" | "ko" | "ru" | "de" | "fr";
  title: string;
  url: string;
  publishedAt: string;
  sentiment?: "positive" | "neutral" | "negative";
  /** "demo" marks scenario/baseline items that are not live news — the
   *  sidebar renders these with an amber DEMO badge. */
  tone?: "info" | "alert" | "rumor" | "demo";
  topics?: string[];
}

export interface SocialListeningResponse {
  generatedAt: string;
  items: SocialItem[];
  counts: { th: number; en: number };
}

// ─── CCTV ────────────────────────────────────────────────────────

export type CctvSource = "longdo" | "itic" | "doh" | "private" | "lanta" | "youtube";

export interface CctvSlot {
  id: string;
  label: string;
  source: CctvSource;
  longitude: number;
  latitude: number;
  hlsUrl?: string;
  posterUrl?: string;
  reachable: boolean;
  category: "highway" | "heritage" | "flood" | "traffic" | "tourism";
}

export interface CctvFeedResponse {
  generatedAt: string;
  slots: CctvSlot[];
  reachableCount: number;
  totalCount: number;
}

// ─── Air quality ─────────────────────────────────────────────────

export interface AirStation {
  stationId: string;
  name: string;
  longitude: number;
  latitude: number;
  pm25?: number;
  pm10?: number;
  o3?: number;
  no2?: number;
  source: "open-meteo" | "pcd" | "openaq";
  observedAt: string;
  aqiLevel?: SeverityLevel;
}

export interface AirQualityResponse {
  generatedAt: string;
  stations: AirStation[];
  provinceAvgPm25?: number;
  provinceAvgAqiLevel?: SeverityLevel;
  office?: OfficeNotice;
}

// ─── Fires (FIRMS) ───────────────────────────────────────────────

export interface FireHotspot {
  id: string;
  longitude: number;
  latitude: number;
  /** Brightness temperature in Kelvin. */
  brightness: number;
  /** Confidence percent 0–100. */
  confidence: number;
  /** FRP — fire radiative power in MW. */
  frp?: number;
  satellite: "NOAA-20" | "NOAA-21" | "SUOMI-NPP" | "TERRA" | "AQUA";
  detectedAt: string;
  severity: SeverityLevel;
}

export interface CnxFiresResponse {
  generatedAt: string;
  hotspots: FireHotspot[];
  totalCount: number;
  /** Fraction of FIRMS hotspots that fall inside the protected forest
   * boundary — burning-season watch metric. */
  forestShare?: number;
}

// ─── Open data catalog ───────────────────────────────────────────

export interface OpenDataDataset {
  id: string;
  titleTh?: string;
  titleEn?: string;
  publisher: string;
  /** CKAN resource format (CSV, XLSX, JSON, etc.). */
  format: string;
  url: string;
  /** Local mirror (downloaded by fetch-datagoth-cnx.mjs). */
  localMirror?: string;
  /** Tag list from data.go.th. */
  tags: string[];
  /** ISO timestamp. */
  fetchedAt: string;
  /** Bytes. */
  byteSize?: number;
  /** Human-readable summary one line. */
  summary?: string;
}

export interface OpenDataIndex {
  generatedAt: string;
  /** Total datasets on data.go.th matching "เชียงใหม่" / Chiang Mai. */
  totalDatasets: number;
  fetched: number;
  failed: number;
  datasets: OpenDataDataset[];
}

// ─── Heritage ────────────────────────────────────────────────────

export interface CnxHeritageSite {
  id: string;
  name: string;
  nameTh?: string;
  category: "temple" | "city-wall" | "monument" | "museum" | "palace" | "natural";
  longitude: number;
  latitude: number;
  builtYear?: number;
  brief: string;
  visitingHours?: string;
}

// ─── Crop / market prices ────────────────────────────────────────

export interface CnxMarketPrice {
  market: string;
  commodity: string;
  priceTHB: number;
  unit: string;
  observedAt: string;
}

// ─── Story (keystone) ───────────────────────────────────────────

export interface CnxStoryResponse {
  generatedAt: string;
  headline: string;
  paragraphs: string[];
  bullets: string[];
  officeNotices?: OfficeNotice[];
  /** Linked keystone charts the story depends on. */
  references?: { id: string; label: string }[];
}

// ─── Aircraft / flights ──────────────────────────────────────────
// Re-exported from lib/cnx/opensky.ts — single source of truth.

export type {
  FlightState,
  FetchResult,
  CountrySummary,
  SizeBucket,
} from "../lib/cnx/opensky";
export type { PlaneSize, AircraftSpec } from "../lib/cnx/aircraft";

// ─── Bus routes ──────────────────────────────────────────────────

export interface BusStop {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  operator: string;
  routeRef: string;
}

export interface BusRoute {
  id: string;
  ref: string;
  name: string;
  operator: string;
  colour: string;
  /** One entry per constituent OSM way — kept disjoint rather than
   *  concatenated into a single path, because relation members are
   *  not guaranteed to be contiguous or consistently ordered/oriented.
   *  Joining them naively draws straight "teleport" lines across the
   *  map between unrelated segments. [lon, lat] per point. */
  geometry: [number, number][][];
}

// ─── Convenience unions ──────────────────────────────────────────

export interface CnxApiResponses {
  flood: CnxFloodResponse;
  social: SocialListeningResponse;
  cctv: CctvFeedResponse;
  airQuality: AirQualityResponse;
  fires: CnxFiresResponse;
  firesRfd: import("../lib/cnx/fire-rfd").RfdFiresResponse;
  aerosol: import("../lib/cnx/aerosol").AerosolResponse;
  openData: OpenDataIndex;
  heritage: { generatedAt: string; sites: CnxHeritageSite[] };
  story: CnxStoryResponse;
  flights: import("../lib/cnx/opensky").FetchResult;
}