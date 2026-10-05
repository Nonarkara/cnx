// ─── CNX API response types ──────────────────────────────────────
// Mirror of Lopburi's src/types/lopburi.ts, scoped to Chiang Mai's
// data streams. The shape is the union — when a panel reads from
// multiple endpoints (ticker, story), every feed's payload must be
// represented here so the TS inference stays total.

export type SeverityLevel = "good" | "watch" | "alert" | "critical" | "unknown";

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
  /**
   * Whether these numbers are measurements or a scenario fill.
   *
   * This exists because the flood panel was long served entirely by
   * `buildScenario()` — hash-seeded jitter shaped to look like a gauge
   * trace — while the UI presented it in the same visual language as the
   * real DustBoy and FIRMS data beside it. An operator could not tell
   * which numbers were measured. It is now impossible to miss.
   *
   * "scenario" is not a placeholder to be quietly tolerated: it means the
   * flood axis of the province verdict is NOT evidence, and the panel
   * must not be used to judge whether water is rising.
   */
  provenance: "live" | "scenario";
  /** Set when provenance !== "live": why, and what to do instead. */
  provenanceNote: { th: string; en: string } | null;
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
  /** "demo" is reserved for explicitly illustrative items, not default news — the
   *  sidebar renders these with an amber DEMO badge. */
  tone?: "info" | "alert" | "rumor" | "demo";
  topics?: string[];
}

export interface SocialListeningResponse {
  generatedAt: string;
  items: SocialItem[];
  counts: { th: number; en: number };
  /**
   * Whether this is a live read or a failed one.
   *
   * This field exists because the response used to be indistinguishable
   * from a failure: both the success path and the `catch` returned
   * `items: []` with `counts: {th: 0, en: 0}` and no other information.
   * Google News began answering Cloudflare's egress with an HTTP 503 bot
   * block (measured 2026-10-03; the same URL returns 302→200 with 100
   * items from a laptop), and the result on the board was an empty rail
   * that read exactly like a quiet news day.
   *
   * An operator must be able to tell "nothing is being reported" from
   * "we could not reach the source". Only the first is news.
   */
  provenance: "live" | "unavailable";
  /** Set when provenance is "unavailable": which sources failed and how. */
  unavailableReason: string | null;
  /** Per-source outcome, so a partial outage is visible rather than hidden. */
  sources: {
    googleNewsTh: FeedOutcome;
    googleNewsEn: FeedOutcome;
    gdelt: FeedOutcome;
    /** Per-country tourist-language feeds (multilingual mode), so a failed
     *  Korean or Chinese feed is reported instead of silently dropped. */
    multilingual?: Record<string, FeedOutcome>;
  };
}

/** What actually happened when we asked one source for news. */
export type FeedOutcome =
  | { state: "ok"; itemCount: number }
  | { state: "failed"; detail: string };

// ─── CCTV ────────────────────────────────────────────────────────

export type CctvSource = "longdo" | "itic" | "doh" | "private" | "lanta" | "youtube" | "windy" | "municipal";

export interface CctvSlot {
  id: string;
  label: string;
  source: CctvSource;
  longitude: number;
  latitude: number;
  hlsUrl?: string;
  posterUrl?: string;
  /** Day-player / upstream player page to <iframe> in the modal. */
  playerUrl?: string;
  /** Link-out for attribution (upstream detail page). */
  upstreamUrl?: string;
  /** Seconds between snapshot refreshes (still-image cameras). */
  snapshotRefreshSec?: number;
  /** When the camera actually took the current still (upstream
   *  Last-Modified) — not when the dashboard fetched it. */
  capturedAt?: string;
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
  /** Brightness temperature in Kelvin. `null` when the source carries no
   *  brightness column (LANDSAT) or the cell is unreadable — never 0, which
   *  is a temperature. */
  brightness: number | null;
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
  /** `live` is a FIRMS pass. `scenario` is an illustration — do not score it,
   * plot it as a detection, or advect it into a smoke plume. */
  provenance: "live" | "scenario";
  /** When provenance is scenario: why the live FIRMS request failed. */
  liveFailure?: string;
  /** Detections inside the Chiang Mai province boundary (live only). The
   *  query box also covers neighbouring provinces and the Myanmar border,
   *  so `totalCount` is the area count and this is the provincial one. */
  provinceCount?: number;
  /** Live path that answered: keyed area API, or NASA's open 24 h files. */
  liveSource?: "area-api" | "open-24h";
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
  /** When the fetcher last pulled data.go.th. This is the OBSERVATION
   *  time, not the response time — the panel re-fetches every 30 min and
   *  passes this value through untouched, so it is what the DataAge stamp
   *  must be built from. */
  generatedAt: string;
  /** Datasets in the bake, which is a dated snapshot of ONE filtered
   *  Thai-language search ("เชียงใหม่") — 311 on 2026-09-15, 316 on
   *  2026-10-01, out of 44,207 in the catalogue. Not a population count:
   *  when the bake cannot be read this is 0, not the old snapshot size. */
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