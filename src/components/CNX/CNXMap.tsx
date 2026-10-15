"use client";

// CNX map — MapLibre basemap + deck.gl flight overlay + 3D city.
//
// Three OSM-derived layers cover the city:
//
//   1. Buildings — fill-extrusion from buildings-core.geojson (Old City
//      + Doi Suthep, deep detail) for zoom ≥ 13, switching to
//      buildings-wide.geojson (urban fringe) below.
//
//   2. Temples — fill-extrusion from temples.geojson. Bright Doi Suthep
//      gold; rendered above the buildings so the wats pop against the
//      beige / blue city.
//
//   3. Walls — PathLayer (deck.gl) from walls.geojson. Chiang Mai's
//      historic city-wall + moat ring; a thick gold stroke, not an
//      extrusion (walls are linear, not polygon).
//
// Color is driven by the `kind` tag, not by height — the Arnis-style
// blocky palette: warm beige (residential), Lanna blue (commercial /
// civic), Doi Suthep gold (temple, walls). All three files are valid
// RFC 7946 GeoJSON (Polygon / LineString); an earlier revision wrote
// the raw coordinate array as `geometry` and MapLibre silently
// rejected the source, so the 3D layer never rendered.

import { RAIN_BAND_TH, summariseRain, type RainBand, type RainStation } from "../../lib/cnx/rain-core";
import { GLYPH_ATLAS, GLYPH_MAPPING } from "../../lib/cnx/map-glyphs";
import { useLang } from "../../hooks/useLang";
import { clampView } from "../../lib/cnx/map-bounds";
import { BURNSCAR_ATTRIBUTION, BURNSCAR_MAX_ZOOM, BURNSCAR_MIN_ZOOM } from "../../lib/cnx/burnscar";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CameraHaze } from "../../lib/cnx/haze-vision";
import type { HazeLabel } from "../../lib/cnx/haze-vision-core";
import type { CitizenReport } from "../../lib/cnx/citizen-core";
import type { DustboyStation } from "../../lib/cnx/dustboy";
import type { TrajectorySegment } from "../../lib/cnx/smoke-trajectory";
import dynamic from "next/dynamic";
import type { MapViewState } from "@deck.gl/core";
import { IconLayer, PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { BusRoute } from "../../types/cnx";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MaplibreMap, MapLayerMouseEvent } from "maplibre-gl";
import type { DataDrivenPropertyValueSpecification } from "@maplibre/maplibre-gl-style-spec";

import { basemapStyle, BASEMAP_OPTIONS, type BasemapId } from "../../services/basemap-styles";
import type { FlightState } from "../../lib/cnx/opensky";
import type { CnxHeritageSite, AirStation, FireHotspot, CnxFloodGauge, CctvSlot } from "../../types/cnx";
import type { Waterway } from "../../lib/cnx/waterways";
import type { FloodCamera } from "../../lib/cnx/flood-cameras";
import type { RiverGauge } from "../../lib/cnx/river-level";
import type { CmuStation, CmuRoute } from "../../lib/cnx/cmu-transit";
import { useCmuTransitBuses } from "../../hooks/useCmuTransit";
import { useRtcBusSim } from "../../hooks/useRtcBusSim";
import { RTC_LINE_COLOURS, SIM_SPEED_KMH, type RtcLine, type SimBus } from "../../lib/cnx/rtc-bus-sim";
import type { WeatherLayerUrls } from "../../lib/cnx/weather-layers";
import CNXForecastLayer from "./CNXForecastLayer";
import type { ForecastFieldResponse } from "../../lib/cnx/wind-field";
import { precisionLabel, sameAmphoe, type Shelter } from "../../lib/cnx/shelters";
import { useOfficialWarnings } from "../../hooks/useOfficialWarnings";
import { CAP_SEVERITY_LEVEL, capWindow, currentOfficialAlerts } from "../../lib/cnx/official-watch";
import type { OfficialAlert } from "../../lib/cnx/tmd-cap-core";

const DeckGL = dynamic(() => import("@deck.gl/react").then((m) => m.default), {
  ssr: false,
});
// maplibre-gl v6 needs its worker URL set before the first Map is built;
// the files are copied to public/ by scripts/copy-maplibre-worker.mjs.
// react-map-gl's own import("maplibre-gl") resolves to this same module.
const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const Map = dynamic(
  () =>
    Promise.all([import("react-map-gl/maplibre"), import("maplibre-gl")]).then(([m, maplibre]) => {
      maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL);
      return m.default;
    }),
  { ssr: false },
);

const AttributionControl = dynamic(() => import("react-map-gl/maplibre").then((m) => m.AttributionControl), { ssr: false });

// Inline triangle icon (points north) for the plane IconLayer — avoids
// depending on an external sprite sheet just for one glyph. `mask: true`
// lets deck.gl tint the white triangle with each plane's getColor.
const PLANE_ICON_ATLAS =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><polygon points="32,4 56,60 32,46 8,60" fill="white"/></svg>'
  );
const PLANE_ICON_MAPPING = {
  plane: { x: 0, y: 0, width: 64, height: 64, anchorY: 32, mask: true },
};

const CNX_CENTER: [number, number] = [98.9853, 18.7883]; // Chiang Mai
const CITY_ZOOM = 13;

const BUILDINGS_CORE_SOURCE = "cnx-buildings-core";
const BUILDINGS_CORE_LAYER = "cnx-buildings-core-fill";
const BUILDINGS_WIDE_SOURCE = "cnx-buildings-wide";
const BUILDINGS_WIDE_LAYER = "cnx-buildings-wide-fill";
const TEMPLES_SOURCE = "cnx-temples";
const TEMPLES_LAYER = "cnx-temples-fill";

// Arnis-inspired palette:
//   Doi Suthep gold (temples)  → #f99d1b / #d97706 (saffron / chedi gilding)
//   Lanna navy (civic / gov)   → #12354e
//   Lanna blue (commercial)    → #2563eb
//   Tourism / Hotel            → #0284c7
//   Education / School         → #059669
//   Healthcare / Hospital      → #e11d48
//   Heritage / Walls           → #9a3412
//   Warm beige (residential)   → #b4afa5 (≈ "terracotta/sandstone" in Arnis)
function buildingColorExpr(): DataDrivenPropertyValueSpecification<string> {
  return [
    "case",
    ["==", ["get", "kind"], "temple"],
    "rgba(245, 158, 11, 0.98)",
    ["==", ["get", "kind"], "hospital"],
    "rgba(225, 29, 72, 0.92)",
    ["==", ["get", "kind"], "school"],
    "rgba(5, 150, 105, 0.92)",
    ["==", ["get", "kind"], "amenity"],
    "rgba(18, 53, 78, 0.95)",
    ["==", ["get", "kind"], "tourism"],
    "rgba(2, 132, 199, 0.92)",
    ["==", ["get", "kind"], "commercial"],
    "rgba(37, 99, 235, 0.92)",
    ["==", ["get", "kind"], "historic"],
    "rgba(154, 52, 18, 0.92)",
    // residential / generic — interpolate within warm beige family
    [
      "interpolate",
      ["linear"],
      ["get", "height"],
      3, "rgba(180, 175, 165, 0.82)",
      12, "rgba(168, 162, 148, 0.88)",
      25, "rgba(150, 144, 128, 0.92)",
    ],
  ];
}

function templeColorExpr(): DataDrivenPropertyValueSpecification<string> {
  return [
    "case",
    ["==", ["get", "kind_value"], "buddhist"],
    "rgba(245, 158, 11, 0.98)",     // saffron-leaning (Buddhist wats / chedi)
    ["==", ["get", "kind_value"], "christian"],
    "rgba(168, 85, 247, 0.95)",
    ["==", ["get", "kind_value"], "muslim"],
    "rgba(16, 185, 129, 0.95)",
    "rgba(218, 165, 32, 0.98)",     // generic Doi Suthep gold
  ];
}

/** Small uppercase heading between toggle groups in the left-hand
 *  layer bar (3D City / Transit / Weather & Air / Range Rings). */
function ToggleGroupLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div className={`px-1 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--bg-raised)] text-[var(--dim)] ${first ? "" : "mt-1.5"}`}>
      {children}
    </div>
  );
}

/** One toggle in the left-hand layer bar. `disabled` greys the button
 *  out and blocks the click — used when a layer's data isn't available
 *  yet (e.g. a weather overlay whose upstream has no current tile). */
function MapToggleButton({
  pressed,
  onClick,
  activeClassName,
  disabled,
  title,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  activeClassName: string;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={title}
      className={`min-h-11 border px-3 py-2 text-left text-[13px] font-semibold transition-colors ${
        disabled
          ? "cursor-not-allowed border-[var(--line)] bg-[var(--bg-raised)] text-[var(--dim)] opacity-70"
          : pressed
          ? activeClassName
          : "border-[var(--line)] bg-[var(--bg-raised)] text-[var(--ink)] hover:border-[var(--cool)]"
      }`}
    >
      {children}
    </button>
  );
}

function buildFlightLayers(flights: FlightState[]) {
  // Bearing tail — where each plane was ~60 s ago.
  const bearingTails: { start: [number, number]; end: [number, number]; icao24: string }[] = [];
  const TAIL_SECONDS = 60;
  for (const f of flights) {
    if (f.longitude === null || f.latitude === null) continue;
    if (f.velocity === null || f.velocity <= 0) continue;
    if (f.trueTrack === null) continue;
    const meters = f.velocity * TAIL_SECONDS;
    const dLat = (meters * Math.cos((f.trueTrack * Math.PI) / 180)) / 111_111;
    const dLon =
      (meters * Math.sin((f.trueTrack * Math.PI) / 180)) /
      (111_111 * Math.cos((f.latitude * Math.PI) / 180));
    bearingTails.push({
      start: [f.longitude, f.latitude],
      end: [f.longitude - dLon, f.latitude - dLat],
      icao24: f.icao24,
    });
  }

  const planeLayer = new IconLayer<FlightState>({
    id: "cnx-planes",
    data: flights,
    getPosition: (d) => [d.longitude ?? 0, d.latitude ?? 0],
    getIcon: () => "plane",
    iconAtlas: PLANE_ICON_ATLAS,
    iconMapping: PLANE_ICON_MAPPING,
    getColor: (d) => {
      const alt = d.baroAltitude;
      if (alt === null) return [120, 130, 165, 200];
      if (alt >= 10_000) return [29, 41, 81, 230];
      if (alt >= 6_000) return [102, 136, 194, 220];
      return [200, 190, 150, 200];
    },
    getSize: (d) => {
      const alt = d.baroAltitude;
      if (alt === null) return 14;
      if (alt >= 10_000) return 22;
      if (alt >= 6_000) return 18;
      return 14;
    },
    // deck.gl IconLayer angles are counter-clockwise from north; heading
    // (trueTrack) is clockwise from north, so it must be negated.
    getAngle: (d) => -(d.trueTrack ?? 0),
    sizeUnits: "pixels",
    pickable: true,
  });

  const tailLayer = new PathLayer<{ start: [number, number]; end: [number, number]; icao24: string }>({
    id: "cnx-bearings",
    data: bearingTails,
    getPath: (d) => [d.start, d.end],
    getColor: () => [184, 134, 11, 110],
    getWidth: 2,
    widthUnits: "pixels",
  });

  return [planeLayer, tailLayer];
}

export interface WallFeature {
  type: "Feature";
  id?: number | string;
  properties: {
    id?: number | string;
    height?: number;
    name?: string | null;
    kind?: string;
  };
  // Valid RFC 7946 shape. Legacy files (pre-2026-09-16) stored the raw
  // coordinate array here — extractWallPath accepts both.
  geometry:
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "Polygon"; coordinates: [number, number][][] }
    | [number, number][];
}

function extractWallPath(w: WallFeature): [number, number][] {
  const g: unknown = w.geometry;
  if (Array.isArray(g)) return g as [number, number][];
  if (g && typeof g === "object") {
    const geom = g as { type?: string; coordinates?: unknown };
    if (geom.type === "LineString" && Array.isArray(geom.coordinates)) {
      return geom.coordinates as [number, number][];
    }
    if (geom.type === "Polygon" && Array.isArray(geom.coordinates)) {
      const ring = (geom.coordinates as [number, number][][])[0];
      if (Array.isArray(ring)) return ring;
    }
  }
  return [];
}

function buildWallLayer(walls: WallFeature[], visible: boolean) {
  if (!visible || !walls.length) return null;
  const paths = walls
    .map((w) => ({
      id: String(w.id ?? w.properties?.id ?? Math.random()),
      path: extractWallPath(w),
      name: w.properties?.name ?? null,
    }))
    .filter((p) => p.path.length >= 2);
  if (!paths.length) return null;
  return new PathLayer<(typeof paths)[number]>({
    id: "cnx-walls",
    data: paths,
    getPath: (d) => d.path,
    getColor: () => [184, 134, 11, 240],
    getWidth: 3,
    widthUnits: "pixels",
    pickable: true,
  });
}

/** Distance-ring grid — concentric circles at fixed km radii around a
 *  centre point. Pure math, no turf dependency: walk N points around
 *  the circle and convert metre offsets to lon/lat using the
 *  equirectangular approximation already used elsewhere in this file
 *  (buildFlightLayers' bearing tails). Good enough at city scale. */
function buildGridRing(centre: [number, number], radiusKm: number): [number, number][] {
  const meters = radiusKm * 1000;
  const points: [number, number][] = [];
  const steps = 72;
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLat = (meters * Math.cos(angle)) / 111_111;
    const dLon = (meters * Math.sin(angle)) / (111_111 * Math.cos((centre[1] * Math.PI) / 180));
    points.push([centre[0] + dLon, centre[1] + dLat]);
  }
  return points;
}

interface MapProps {
  flights: FlightState[];
  heritage?: CnxHeritageSite[];
  airStations?: AirStation[];
  fireHotspots?: FireHotspot[];
  floodGauges?: CnxFloodGauge[];
  cctv?: CctvSlot[];
  /** Public flood/road cameras in the CNX area, via the Maholan wall.
   *  Catalogue metadata only — no video is proxied. */
  floodCameras?: FloodCamera[];
  /**
   * Measured Ping-basin gauges. Empty when the read failed — which draws
   * nothing, deliberately. The scenario flood gauges above are a
   * different dataset and are never substituted for these.
   */
  riverGauges?: RiverGauge[];
  busRoutes?: BusRoute[];
  walls?: WallFeature[];
  waterways?: Waterway[];
  cmuStations?: CmuStation[];
  cmuRoutes?: Record<string, CmuRoute>;
  rtcLines?: RtcLine[];
  weatherLayers?: WeatherLayerUrls | null;
  /** Relay webcam haze verdicts, keyed onto CCTV slots by cameraId. */
  cameraHaze?: CameraHaze[];
  /** Haze posts/news the relay could place; unplaced ones are not drawn. */
  citizenReports?: CitizenReport[];
  /** Measured 24 h rainfall at gauges (ThaiWater). */
  rainStations?: RainStation[];
  rainAvailable?: boolean;
  /** Online DustBoy sensors. Offline rows are omitted by the caller. */
  dustboyStations?: DustboyStation[];
  /** Live plume polylines. Empty when FIRMS did not answer. */
  smokeSegments?: TrajectorySegment[];
  /** 48 h model field (wind, rain, PM2.5) for the animated forecast layer. */
  forecast?: ForecastFieldResponse | null;
  /** Fly-to request from outside the map (e.g. a warned district). */
  focus?: { longitude: number; latitude: number; zoom: number; key: number } | null;
  /** Official temporary flood shelters (geocoded; precision on each). */
  shelters?: Shelter[];
  /** Turn shelters on and emphasise one district's (null = all). */
  shelterFocus?: { amphoeTh: string | null; key: number } | null;
}

const NO_CAMERA_HAZE: CameraHaze[] = [];
const NO_REPORTS: CitizenReport[] = [];
const NO_RAIN: RainStation[] = [];
const NO_DUSTBOY: DustboyStation[] = [];
const NO_PLUMES: TrajectorySegment[] = [];
const NO_SHELTERS: Shelter[] = [];
const HAZE_FILL: Record<HazeLabel, [number, number, number, number]> = {
  "haze-likely": [220, 38, 38, 235],
  "some-haze": [234, 179, 8, 230],
  clear: [29, 78, 216, 220],
  "too-dark": [107, 107, 107, 200],
  "no-colour": [107, 107, 107, 200],
  calibrating: [107, 107, 107, 200],
};

const NO_RTC_LINES: RtcLine[] = [];

/** TMD warning outlines in the board's severity colours (--sev-* in globals.css, light values). */
const OFFICIAL_RGB: Record<string, [number, number, number, number]> = {
  watch: [127, 99, 0, 235],
  alert: [181, 60, 10, 235],
  critical: [185, 28, 28, 240],
};
type OfficialRing = { alert: OfficialAlert; path: [number, number][] };

/** Thai names for the basemap options; ids come from services/basemap-styles. */
const BASEMAP_TH: Record<BasemapId, { label: string; hint: string }> = {
  topography: { label: "ภูมิประเทศ", hint: "เส้นชั้นความสูงและภูมิประเทศ (OpenTopoMap) — เหมาะกับแอ่งหมอกควันและแม่น้ำ" },
  satellite: { label: "ดาวเทียม", hint: "ภาพถ่ายดาวเทียม (Esri) พร้อมภูมิประเทศ — เหมาะกับร่องรอยการเผาและการใช้ที่ดิน" },
  street: { label: "ถนน", hint: "ถนนและชื่อสถานที่ภาษาไทย (OpenFreeMap) — เหมาะกับการหาตำแหน่ง" },
};

/** TMD 24-hour rainfall classes in English; Thai names live in rain-core. */
const RAIN_BAND_EN: Record<RainBand, string> = {
  none: "no rain",
  light: "light rain",
  moderate: "moderate rain",
  heavy: "heavy rain",
  "very-heavy": "very heavy rain",
};

const HAZE_LABEL: Record<HazeLabel, { th: string; en: string }> = {
  "haze-likely": { th: "น่าจะมีหมอกควัน", en: "haze likely" },
  "some-haze": { th: "มีหมอกควันบ้าง", en: "some haze" },
  clear: { th: "หมอกควันในภาพต่ำ", en: "low visual haze" },
  "too-dark": { th: "มืดเกินประเมิน", en: "too dark to judge" },
  "no-colour": { th: "ภาพไม่มีสี — ไม่ประเมิน", en: "no colour — not scored" },
  calibrating: { th: "กำลังเรียนรู้ภาพฟ้าใส", en: "calibrating" },
};

/** Building-card labels for the OSM `kind` tag. */
const KIND_LABEL: Record<string, { th: string; en: string }> = {
  temple: { th: "ศาสนสถาน · วัด", en: "Temple" },
  hospital: { th: "โรงพยาบาล", en: "Hospital" },
  school: { th: "สถานศึกษา", en: "School" },
  amenity: { th: "สถานที่ราชการ / บริการ", en: "Civic / amenity" },
  tourism: { th: "ท่องเที่ยว / ที่พัก", en: "Tourism / hotel" },
  commercial: { th: "พาณิชย์", en: "Commercial" },
  historic: { th: "โบราณสถาน", en: "Historic" },
  residential: { th: "ที่อยู่อาศัย", en: "Residential" },
  building: { th: "อาคาร", en: "Building" },
};

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return [29, 41, 81];
  return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
}

export default function CNXMap({
  flights,
  heritage = [],
  airStations = [],
  fireHotspots = [],
  floodGauges = [],
  cctv = [],
  floodCameras = [],
  riverGauges = [],
  busRoutes = [],
  walls = [],
  waterways = [],
  cmuStations = [],
  cmuRoutes = {},
  rtcLines = NO_RTC_LINES,
  weatherLayers = null,
  cameraHaze = NO_CAMERA_HAZE,
  citizenReports = NO_REPORTS,
  rainStations = NO_RAIN,
  rainAvailable = false,
  dustboyStations = NO_DUSTBOY,
  smokeSegments = NO_PLUMES,
  forecast = null,
  focus = null,
  shelters = NO_SHELTERS,
  shelterFocus = null,
}: MapProps) {
  const { lang, t } = useLang();
  // Street labels lead the operational landing view. Terrain, satellite and
  // the heavier 3D city remain explicit choices in Layers.
  const [basemap, setBasemap] = useState<BasemapId>("street");
  const [buildingsOn, setBuildingsOn] = useState(false);
  const [templesOn, setTemplesOn] = useState(true);
  const [wallsOn, setWallsOn] = useState(true);
  const [waterwaysOn, setWaterwaysOn] = useState(true);
  const [plumesOn, setPlumesOn] = useState(true);
  const [dustboyOn, setDustboyOn] = useState(true);
  const [rainOn, setRainOn] = useState(true);
  // Moderate rain or more (≥10.1 mm/24 h): dry gauges would only add clutter.
  const [rainClock, setRainClock] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setRainClock(Date.now());
    const timer = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  const currentRainStations = useMemo(() => summariseRain(rainStations, rainClock).stations, [rainStations, rainClock]);
  const wetStations = useMemo(() => currentRainStations.filter((s) => s.band === "moderate" || s.band === "heavy" || s.band === "very-heavy"), [currentRainStations]);
  const [busesOn, setBusesOn] = useState(false);
  const [cmuShuttleOn, setCmuShuttleOn] = useState(false);
  const cmuBuses = useCmuTransitBuses(cmuShuttleOn);
  const [airportBusOn, setAirportBusOn] = useState(false);
  const airportBuses = useRtcBusSim(rtcLines, airportBusOn);
  // Off by default — supplementary weather context, not core-view clutter.
  // Image overlays are mutually exclusive: infrared cloud and aerosol cover
  // the whole map, so two at once hid whichever was underneath.
  const [imageOverlay, setImageOverlay] = useState<"rain" | "ir" | "aerosol" | "burnscar" | null>(null);
  const pickOverlay = (id: NonNullable<typeof imageOverlay>) => setImageOverlay((cur) => (cur === id ? null : id));
  const rainRadarOn = imageOverlay === "rain";
  const himawariOn = imageOverlay === "ir";
  const aerosolLayerOn = imageOverlay === "aerosol";
  const burnScarOn = imageOverlay === "burnscar";
  const [gridRadii, setGridRadii] = useState<Set<number>>(new Set());
  const [selectedBuilding, setSelectedBuilding] = useState<{
    id: string | number;
    name: string;
    nameTh?: string;
    nameEn?: string;
    kind: string;
    kindValue?: string;
    height: number;
    levels?: number | null;
    address?: string | null;
    coordinates?: [number, number];
  } | null>(null);

  const [viewState, setViewState] = useState<MapViewState>({
    longitude: CNX_CENTER[0],
    latitude: CNX_CENTER[1],
    zoom: CITY_ZOOM,
    pitch: 0,
    bearing: 0,
  });

  const wideBuildings = (viewState.zoom ?? CITY_ZOOM) < 13;

  // An outside fly-to (a warned district, a shelter) re-centres once per key.
  useEffect(() => {
    if (!focus) return;
    setViewState((vs) => clampView({ ...vs, longitude: focus.longitude, latitude: focus.latitude, zoom: focus.zoom }));
  }, [focus]);

  // TMD official warnings in force: outline only, so nothing underneath is hidden.
  const officialWarnings = useOfficialWarnings();
  const officialLayer = useMemo(() => {
    const rings: OfficialRing[] = (currentOfficialAlerts(officialWarnings, rainClock) ?? [])
      .flatMap((alert) => alert.polygons.map((ring) => ({ alert, path: [...ring, ring[0]] })));
    if (rings.length === 0) return null;
    return new PathLayer<OfficialRing>({
      id: "cnx-official-warnings",
      data: rings,
      getPath: (d) => d.path,
      getColor: (d) => OFFICIAL_RGB[CAP_SEVERITY_LEVEL[d.alert.severity]] ?? OFFICIAL_RGB.watch,
      getWidth: 3,
      widthUnits: "pixels",
      pickable: true,
    });
  }, [officialWarnings, rainClock]);

  // Shelters: off until asked for, on whenever a warning points at them.
  const [sheltersOn, setSheltersOn] = useState(false);
  useEffect(() => {
    if (shelterFocus) setSheltersOn(true);
  }, [shelterFocus]);
  const shelterLayers = useMemo(() => {
    if (!sheltersOn) return [];
    const placed = shelters.filter((s) => s.lat !== null && s.lon !== null && !s.duplicateOf);
    const focusAmphoe = shelterFocus?.amphoeTh ?? null;
    const inFocus = (s: Shelter) => focusAmphoe !== null && sameAmphoe(s.amphoeTh, focusAmphoe);
    // A ring, never a status colour: a shelter is a destination, not a level.
    // Solid = the building itself is mapped; hollow = approximate location.
    const dots = new ScatterplotLayer<Shelter>({
      id: "cnx-shelters",
      data: placed,
      getPosition: (d) => [d.lon as number, d.lat as number],
      getRadius: (d) => (inFocus(d) ? 2 : 0) + 4 + Math.min(6, Math.sqrt(d.capacity ?? 100) / 12),
      radiusUnits: "pixels",
      stroked: true,
      filled: true,
      getFillColor: (d) => (d.precision === "place" || d.precision === "official" ? [255, 255, 255, 245] : [255, 255, 255, 70]),
      getLineColor: (d) => (inFocus(d) || focusAmphoe === null ? [18, 53, 78, 255] : [18, 53, 78, 150]),
      getLineWidth: (d) => (inFocus(d) ? 3 : 2),
      lineWidthUnits: "pixels",
      pickable: true,
      updateTriggers: { getRadius: focusAmphoe, getLineColor: focusAmphoe, getLineWidth: focusAmphoe },
    });
    const labels = new TextLayer<Shelter>({
      id: "cnx-shelter-labels",
      data: placed.filter(inFocus),
      getPosition: (d) => [d.lon as number, d.lat as number],
      getText: (d) => `${d.nameTh}${d.capacity ? ` · ${d.capacity.toLocaleString("en-US")} ${lang === "en" ? "people" : "คน"}` : ""}`,
      getSize: 13,
      getColor: [17, 17, 17, 255],
      getPixelOffset: [0, -16],
      background: true,
      getBackgroundColor: [255, 255, 255, 230],
      backgroundPadding: [4, 2],
      characterSet: "auto",
      fontFamily: '"IBM Plex Sans Thai", "Noto Sans Thai", sans-serif',
      pickable: false,
      updateTriggers: { getText: lang },
    });
    return [dots, labels];
  }, [shelters, sheltersOn, shelterFocus, lang]);

  const handleToggle3D = () => {
    setBuildingsOn((prev) => {
      const next = !prev;
      if (next) {
        setTemplesOn(true);
        setViewState((vs) => ({
          ...vs,
          pitch: 58,
          bearing: -15,
          zoom: Math.max(vs.zoom ?? CITY_ZOOM, 14.8),
        }));
      } else {
        setViewState((vs) => ({
          ...vs,
          pitch: 0,
          bearing: 0,
        }));
      }
      return next;
    });
  };
  const mlMapRef = useRef<MaplibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Expose the live MapLibre handle to the dev console for debugging.
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as Window as typeof window & { __cnxMap?: MaplibreMap }).__cnxMap = mlMapRef.current ?? undefined;
  });

  const style = useMemo(() => basemapStyle(basemap), [basemap]);

  // Switching away from a terrain-enabled basemap (satellite) crashes
  // maplibre-gl: react-maplibre's setProps() calls map.redraw()
  // synchronously right after handing over the new style, and that
  // redraw can land before the new style's own "style.load" handler
  // has run map.setTerrain(null) — the renderer then tries to draw the
  // terrain depth pre-pass against shader/program state that style
  // replacement already tore down ("Cannot read properties of
  // undefined (reading 'shaderPreludeCode')"). Clearing terrain
  // ourselves, synchronously, before the style prop ever changes,
  // closes that race regardless of style-load timing.
  const handleBasemapChange = (id: BasemapId) => {
    if (typeof style !== "string" && style.terrain && mlMapRef.current) {
      mlMapRef.current.setTerrain(null);
    }
    setBasemap(id);
  };

  // Walls layer goes in deck.gl — paths, not polygons.
  const wallLayer = useMemo(() => buildWallLayer(walls, wallsOn), [walls, wallsOn]);

  // Waterways — OSM rivers + streams draining into the Ping basin.
  const waterwayLayer = useMemo(() => {
    if (!waterwaysOn || !waterways.length) return null;
    return new PathLayer<Waterway>({
      id: "cnx-waterways",
      data: waterways,
      getPath: (d) => d.geometry,
      getColor: (d) =>
        d.width === "major" ? [29, 78, 216, 200] : d.width === "minor" ? [59, 130, 246, 160] : [147, 197, 253, 130],
      getWidth: (d) => (d.width === "major" ? 3 : d.width === "minor" ? 2 : 1),
      widthUnits: "pixels",
      pickable: true,
    });
  }, [waterways, waterwaysOn]);

  // Distance-ring grid — 1/5/10 km circles centred on the Old City,
  // independently toggleable.
  const gridLayer = useMemo(() => {
    if (gridRadii.size === 0) return null;
    const rings = [...gridRadii].map((km) => ({ km, path: buildGridRing(CNX_CENTER, km) }));
    return new PathLayer<(typeof rings)[number]>({
      id: "cnx-grid",
      data: rings,
      getPath: (d) => d.path,
      getColor: [107, 107, 107, 160],
      getWidth: 1.5,
      widthUnits: "pixels",
      pickable: false,
    });
  }, [gridRadii]);

  // CMU internal shuttle — route polylines (baked, per-route colour
  // from the source page), station dots, and live buses from the
  // MQTT feed (only connected while the toggle is on).
  const cmuLayers = useMemo(() => {
    if (!cmuShuttleOn) return [];
    // Baked paths are [lat, lng] (the source page's Leaflet order); deck wants [lng, lat].
    const routeEntries = Object.values(cmuRoutes).map((r) => ({
      color: r.color,
      path: r.path.map(([lat, lng]) => [lng, lat] as [number, number]),
    }));
    const routeLayer = new PathLayer<(typeof routeEntries)[number]>({
      id: "cmu-transit-routes",
      data: routeEntries,
      getPath: (d) => d.path,
      getColor: (d) => [...hexToRgb(d.color), 160],
      getWidth: 2,
      widthUnits: "pixels",
      pickable: false,
    });
    const stationLayer = new ScatterplotLayer<CmuStation>({
      id: "cmu-transit-stations",
      data: cmuStations,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: 3,
      radiusUnits: "pixels",
      getFillColor: [255, 255, 255, 200],
      getLineColor: [100, 100, 100, 200],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
    });
    const busLayer = new ScatterplotLayer<(typeof cmuBuses)[number]>({
      id: "cmu-transit-buses",
      data: cmuBuses,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: 8,
      radiusUnits: "pixels",
      getFillColor: (d) => [...hexToRgb(cmuRoutes[d.route]?.color ?? "#12354e"), 240],
      getLineColor: [255, 255, 255, 255],
      lineWidthMinPixels: 1.5,
      stroked: true,
      pickable: true,
    });
    return [routeLayer, stationLayer, busLayer];
  }, [cmuShuttleOn, cmuRoutes, cmuStations, cmuBuses]);

  const rtcRouteLayer = useMemo(() => {
    if (!airportBusOn || rtcLines.length === 0) return null;
    return new PathLayer<RtcLine>({
      id: "rtc-airport-lines",
      data: rtcLines,
      getPath: (d) => d.path,
      getColor: (d) => [...hexToRgb(RTC_LINE_COLOURS[d.ref] ?? "#12354e"), 110],
      getWidth: 4,
      widthUnits: "pixels",
      pickable: false,
    });
  }, [airportBusOn, rtcLines]);

  const rtcBusLayer = useMemo(() => {
    if (!airportBusOn) return null;
    return new ScatterplotLayer<SimBus>({
      id: "rtc-airport-buses",
      data: airportBuses,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 9,
      radiusUnits: "pixels",
      getFillColor: (d) => [...hexToRgb(d.colour), 245],
      getLineColor: [29, 41, 81, 255],
      lineWidthMinPixels: 2,
      stroked: true,
      pickable: true,
    });
  }, [airportBusOn, airportBuses]);

  // `Map` here is react-map-gl's component, hence globalThis.Map.
  const hazeById = useMemo(() => new globalThis.Map(cameraHaze.map((h) => [h.cameraId, h])), [cameraHaze]);

  const layers = useMemo(() => {
    const flightLayers = buildFlightLayers(flights);

    // Heritage sites — small fixed-pixel gold markers, not km-wide halos.
    const heritageLayer = new ScatterplotLayer<CnxHeritageSite>({
      id: "cnx-heritage",
      data: heritage,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: (d) => (d.category === "natural" ? 8 : 6),
      radiusUnits: "pixels",
      getFillColor: (d) =>
        d.category === "natural"
        ? [21, 128, 61, 200]
        : d.category === "city-wall"
        ? [184, 134, 11, 200]
        : [184, 134, 11, 220],
      getLineColor: () => [255, 255, 255, 220],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
    });

    // Air quality stations — colour ramp by AQI level, fixed-pixel dots.
    const airLayer = new ScatterplotLayer<AirStation>({
      id: "cnx-air",
      data: airStations,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 7,
      radiusUnits: "pixels",
      getFillColor: (d) => {
        switch (d.aqiLevel) {
          case "critical":
            return [239, 68, 68, 230];
          case "alert":
            return [251, 146, 60, 230];
          case "watch":
            return [245, 158, 11, 230];
          default:
            return [34, 197, 94, 220];
        }
      },
      getLineColor: () => [255, 255, 255, 220],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
    });

    const dustboyLayer = new ScatterplotLayer<DustboyStation>({
      id: "cnx-dustboy",
      data: dustboyOn ? dustboyStations : [],
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 4,
      radiusUnits: "pixels",
      getFillColor: (d) => {
        switch (d.severity) {
          case "critical":
            return [127, 29, 29, 230];
          case "alert":
            return [194, 65, 12, 220];
          case "watch":
            return [180, 83, 9, 210];
          default:
            return [21, 128, 61, 200];
        }
      },
      getLineColor: () => [255, 255, 255, 200],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
    });

    const plumeLayer = new PathLayer<TrajectorySegment>({
      id: "cnx-smoke",
      data: plumesOn ? smokeSegments : [],
      getPath: (d) => [
        [d.origin.longitude, d.origin.latitude] as [number, number],
        ...d.points.map((p) => [p.longitude, p.latitude] as [number, number]),
      ],
      getColor: (d) =>
        d.nearCnx ? [220, 38, 38, 210] : d.hitsCnxBbox ? [234, 88, 12, 190] : [120, 113, 108, 80],
      getWidth: (d) => 1.5 + d.weight * 2.5,
      widthUnits: "pixels",
      pickable: true,
    });

    // Fire hotspots — a FLAME, not a dot. Fire, rain gauges, flood gauges and
    // citizen reports were all `ScatterplotLayer` circles separated only by hue
    // and a pixel or two of radius; on a haze-washed basemap an orange circle
    // is genuinely ambiguous. Shape settles it, and survives to a colour-blind
    // operator and across a room.
    const fireLayer = new IconLayer<FireHotspot>({
      id: "cnx-fires",
      data: fireHotspots,
      getPosition: (d) => [d.longitude, d.latitude],
      getIcon: () => "flame",
      iconAtlas: GLYPH_ATLAS,
      iconMapping: GLYPH_MAPPING,
      getColor: (d) =>
        d.severity === "critical"
        ? [255, 60, 30, 235]
        : d.severity === "alert"
        ? [255, 140, 0, 220]
        : [255, 200, 0, 200],
      // Fire radiative power, not severity, drives the size: a hotspot can be
      // high severity and tiny (a grassland burn) or modest and large. The old
      // fixed 5 px circle threw that away.
      getSize: (d) => 11 + Math.min(11, Math.max(0, (d.frp ?? 0) / 15)),
      sizeUnits: "pixels",
      pickable: true,
    });

    // Flood gauges — Ping basin, fixed-pixel size.
    const floodLayer = new ScatterplotLayer<CnxFloodGauge>({
      id: "cnx-flood",
      data: floodGauges,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 6,
      radiusUnits: "pixels",
      getFillColor: (d) =>
        d.severity === "critical"
        ? [239, 68, 68, 235]
        : d.severity === "alert"
        ? [251, 146, 60, 230]
        : d.severity === "watch"
        ? [245, 158, 11, 220]
        : [29, 78, 216, 210],
      getLineColor: () => [255, 255, 255, 230],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
    });

    // CCTV cameras — square-ish dots (slightly larger than gauges so the
    // operator can spot coverage gaps). Colour by category; offline
    // cameras render grey, never green.
    const cctvLayer = new ScatterplotLayer<CctvSlot>({
      id: "cnx-cctv",
      data: cctv,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 7,
      radiusUnits: "pixels",
      getFillColor: (d) => {
        if (!d.reachable) return [107, 107, 107, 200];
        const haze = hazeById.get(d.id);
        if (haze) return HAZE_FILL[haze.verdict];
        switch (d.category) {
          case "traffic":
          case "highway":
            return [29, 41, 81, 220];
          case "flood":
            return [29, 78, 216, 220];
          case "heritage":
          case "tourism":
            return [184, 134, 11, 220];
          default:
            return [29, 41, 81, 220];
        }
      },
      getLineColor: () => [255, 255, 255, 230],
      lineWidthMinPixels: 1.5,
      stroked: true,
      pickable: true,
    });

    // Citizen / news haze reports: a translucent circle as wide as the
    // place-name precision (a district mention is ~15 km, not a pinpoint),
    // plus a small centre dot to hover.
    const placed = citizenReports.filter((r) => r.place);
    const citizenAreaLayer = new ScatterplotLayer<CitizenReport>({
      id: "cnx-citizen-area",
      data: placed,
      getPosition: (d) => [d.place!.lon, d.place!.lat],
      getRadius: (d) => d.place!.precisionKm * 1000,
      radiusUnits: "meters",
      // Outline only. A district-level mention gets a 15 km circle; filled,
      // one Reddit post about Hang Dong tinted the whole city lavender and
      // read as "something is happening here".
      filled: false,
      getLineColor: [147, 51, 234, 110],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: false,
    });
    // Rain gauges — a DROPLET, sized by the measured 24 h total. The droplet is
    // narrow and tall against the fire flame's wide, squat silhouette, so the
    // two cannot be confused when both are on screen. This is a MEASUREMENT
    // (a gauge total), never the forecast raster beside it — the legend says so
    // explicitly, because two blue things meaning different things is exactly
    // how a number/label split happens.
    const rainLayer = new IconLayer<RainStation>({
      id: "cnx-rain",
      data: rainOn ? wetStations : [],
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => "droplet",
      iconAtlas: GLYPH_ATLAS,
      iconMapping: GLYPH_MAPPING,
      getColor: (d) => (d.band === "very-heavy" ? [30, 64, 175, 235] : d.band === "heavy" ? [37, 99, 235, 220] : [96, 165, 250, 200]),
      getSize: (d) => 11 + Math.min(13, d.rain24h / 8),
      sizeUnits: "pixels",
      pickable: true,
    });
    const citizenLayer = new ScatterplotLayer<CitizenReport>({
      id: "cnx-citizen",
      data: placed,
      getPosition: (d) => [d.place!.lon, d.place!.lat],
      getRadius: 5,
      radiusUnits: "pixels",
      getFillColor: [147, 51, 234, 235],
      getLineColor: [255, 255, 255, 230],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
    });

    // Public flood/road cameras in the CNX area (Maholan wall). Rings,
    // not dots: a live camera and an offline one must be distinguishable
    // at a glance from across a room, and an offline camera that looks
    // like a live one is worse than no marker — it invites a detour that
    // the operator then drives blind. Offline renders hollow.
    const floodCameraLayer = new ScatterplotLayer<FloodCamera>({
      id: "cnx-flood-cameras",
      data: floodCameras,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: (d) => (d.live ? 7 : 5),
      radiusUnits: "pixels",
      getFillColor: (d) => (d.live ? [16, 185, 129, 70] : [120, 113, 108, 45]),
      getLineColor: (d) => (d.live ? [16, 185, 129, 235] : [146, 138, 130, 160]),
      lineWidthMinPixels: 1.5,
      stroked: true,
      filled: true,
      pickable: true,
    });

    // Measured Ping-basin gauges. Sized and coloured by how much room
    // is left to the bank's, NOT by our verdict — the map should not
    // re-state a severity judgement the panel already made, but it can
    // show a physical fact: distance to overtopping.
    const riverGaugeLayer = new ScatterplotLayer<RiverGauge>({
      id: "cnx-river-gauges",
      data: riverGauges,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: (d) => {
        if (d.criticalLevelMsl !== null && d.headroomM !== null) {
          // The station that carries an authority gets the biggest mark.
          return 8;
        }
        return d.severity === "critical" ? 8 : d.severity === "alert" ? 7 : 5;
      },
      radiusUnits: "pixels",
      getFillColor: (d) => {
        switch (d.severity) {
          case "critical":
            return [239, 68, 68, 80];
          case "alert":
            return [249, 115, 22, 75];
          case "watch":
            return [245, 158, 11, 65];
          default:
            return [56, 189, 248, 55];
        }
      },
      getLineColor: (d) => {
        // A station with a published critical level is ringed, so the
        // one number on this board that carries an authority is
        // findable on the map at a glance.
        if (d.criticalLevelMsl !== null) return [249, 115, 22, 255];
        return d.severity === "critical" ? [239, 68, 68, 255] : [56, 189, 248, 190];
      },
      lineWidthMinPixels: 1.4,
      stroked: true,
      filled: true,
      pickable: true,
    });

    return [
      ...flightLayers,
      floodCameraLayer,
      riverGaugeLayer,
      heritageLayer,
      airLayer,
      plumeLayer,
      dustboyLayer,
      fireLayer,
      floodLayer,
      rainLayer,
      citizenAreaLayer,
      citizenLayer,
      cctvLayer,
      ...(wallLayer ? [wallLayer] : []),
      ...(waterwayLayer ? [waterwayLayer] : []),
      ...(gridLayer ? [gridLayer] : []),
      ...cmuLayers,
    ];
  }, [flights, heritage, airStations, fireHotspots, floodGauges, cctv, floodCameras, riverGauges, hazeById, citizenReports, wetStations, rainOn, dustboyStations, smokeSegments, plumesOn, dustboyOn, wallLayer, waterwayLayer, gridLayer, cmuLayers]);

  // Bus routes — drawn as a single deck.gl PathLayer above the
  // basemap. One data entry per constituent OSM way (BusRoute.geometry
  // segment), NOT one per route: relation members aren't guaranteed
  // contiguous or consistently oriented, so joining them into one path
  // drew straight lines across the map between unrelated segments.
  // Toggle off hides them so the operator can declutter when the
  // rivers / walls / 3D city already cover the corridor.
  const busLayers = useMemo(() => {
    if (!busRoutes.length || !busesOn) return [];
    const segments = busRoutes.flatMap((r) =>
      r.geometry.map((path, i) => ({
        id: `${r.id}-${i}`,
        path,
        colour: r.colour,
      })),
    );
    if (!segments.length) return [];
    return [
      new PathLayer<(typeof segments)[number]>({
        id: "cnx-bus-routes",
        data: segments,
        getPath: (d) => d.path,
        getColor: (d) => {
          // Convert #rrggbb (Lanna blue default) to RGB; fall back on parse failure.
          const m = /^#([0-9a-fA-F]{6})$/.exec(d.colour.trim());
          if (m) {
            const hex = m[1];
            return [
              parseInt(hex.slice(0, 2), 16),
              parseInt(hex.slice(2, 4), 16),
              parseInt(hex.slice(4, 6), 16),
              200,
            ];
          }
          return [29, 41, 81, 200];
        },
        getWidth: 3,
        widthUnits: "pixels",
        pickable: true,
      }),
    ];
  }, [busRoutes, busesOn]);

  // Install the 3D layers — buildings (core + wide), temples.
  // Core replaces wide above zoom 13; wide covers the urban fringe
  // below. Temples render on top with bright saffron / gold.
  useEffect(() => {
    const map = mlMapRef.current;
    if (!map) return;
    let cancelled = false;
    let removeListeners = () => {};

    const setup = async () => {
      try {
        if (!map.isStyleLoaded()) {
          await new Promise<void>((resolve) => {
            map.once("idle", () => resolve());
          });
        }
        if (cancelled) return;

        if (buildingsOn && !wideBuildings) {
          // ─── buildings-core (Old City + Doi Suthep, deep) ─────────
          if (!map.getSource(BUILDINGS_CORE_SOURCE)) {
            map.addSource(BUILDINGS_CORE_SOURCE, {
              type: "geojson",
              data: "/data/cnx/buildings-core.geojson",
              promoteId: "id",
            });
          }
          if (!map.getLayer(BUILDINGS_CORE_LAYER)) {
            map.addLayer({
              id: BUILDINGS_CORE_LAYER,
              type: "fill-extrusion",
              source: BUILDINGS_CORE_SOURCE,
              minzoom: 13,
              paint: {
                "fill-extrusion-color": buildingColorExpr(),
                "fill-extrusion-height": ["get", "height"] as DataDrivenPropertyValueSpecification<number>,
                "fill-extrusion-base": ["get", "base_height"] as DataDrivenPropertyValueSpecification<number>,
                "fill-extrusion-opacity": 0.85,
                "fill-extrusion-vertical-gradient": false,
              },
            });
          }
        }
        if (buildingsOn && wideBuildings) {
          // ─── buildings-wide (urban fringe, light) ─────────────────
          if (!map.getSource(BUILDINGS_WIDE_SOURCE)) {
            map.addSource(BUILDINGS_WIDE_SOURCE, {
              type: "geojson",
              data: "/data/cnx/buildings-wide.geojson",
              promoteId: "id",
            });
          }
          if (!map.getLayer(BUILDINGS_WIDE_LAYER)) {
            map.addLayer({
              id: BUILDINGS_WIDE_LAYER,
              type: "fill-extrusion",
              source: BUILDINGS_WIDE_SOURCE,
              maxzoom: 13,
              paint: {
                "fill-extrusion-color": buildingColorExpr(),
                "fill-extrusion-height": ["get", "height"] as DataDrivenPropertyValueSpecification<number>,
                "fill-extrusion-base": ["get", "base_height"] as DataDrivenPropertyValueSpecification<number>,
                "fill-extrusion-opacity": 0.7,
                "fill-extrusion-vertical-gradient": false,
              },
            });
          }
        }
        if (map.getLayer(BUILDINGS_CORE_LAYER)) map.setLayoutProperty(BUILDINGS_CORE_LAYER, "visibility", buildingsOn && !wideBuildings ? "visible" : "none");
        if (map.getLayer(BUILDINGS_WIDE_LAYER)) map.setLayoutProperty(BUILDINGS_WIDE_LAYER, "visibility", buildingsOn && wideBuildings ? "visible" : "none");

        // ─── temples (place_of_worship) ───────────────────────────
        if (!map.getSource(TEMPLES_SOURCE)) {
          map.addSource(TEMPLES_SOURCE, {
            type: "geojson",
            data: "/data/cnx/temples.geojson",
            promoteId: "id",
          });
        }
        if (!map.getLayer(TEMPLES_LAYER)) {
          map.addLayer({
            id: TEMPLES_LAYER,
            type: "fill-extrusion",
            source: TEMPLES_SOURCE,
            minzoom: 11,
            paint: {
              "fill-extrusion-color": templeColorExpr(),
              "fill-extrusion-height": ["get", "height"] as DataDrivenPropertyValueSpecification<number>,
              "fill-extrusion-base": ["get", "base_height"] as DataDrivenPropertyValueSpecification<number>,
              "fill-extrusion-opacity": 0.95,
              "fill-extrusion-vertical-gradient": false,
            },
          });
        }
        map.setLayoutProperty(TEMPLES_LAYER, "visibility", templesOn ? "visible" : "none");

        // Interactive building inspection (Atlas / atlas.nonarkara.org pattern)
        const onLayerClick = (e: MapLayerMouseEvent) => {
          const feat = e.features?.[0];
          if (!feat) return;
          const props = feat.properties ?? {};
          const bHeight = Number(props.height) || (props.levels ? Number(props.levels) * 3 : 9);
          setSelectedBuilding({
            id: feat.id ?? props.id ?? "Unknown",
            name: props.name_th || props.name_en || props.name || "",
            nameTh: props.name_th,
            nameEn: props.name_en,
            kind: props.kind || (feat.layer?.id === TEMPLES_LAYER ? "temple" : "building"),
            kindValue: props.kind_value,
            height: bHeight,
            levels: props.levels ? Number(props.levels) : Math.round(bHeight / 3),
            address: props.addr || null,
            coordinates: [e.lngLat.lng, e.lngLat.lat],
          });
        };

        const onMouseEnter = () => {
          map.getCanvas().style.cursor = "pointer";
        };
        const onMouseLeave = () => {
          map.getCanvas().style.cursor = "";
        };

        const interactiveLayers = [BUILDINGS_CORE_LAYER, BUILDINGS_WIDE_LAYER, TEMPLES_LAYER].filter((id) => map.getLayer(id));
        interactiveLayers.forEach((lid) => {
          map.on("click", lid, onLayerClick);
          map.on("mouseenter", lid, onMouseEnter);
          map.on("mouseleave", lid, onMouseLeave);
        });
        removeListeners = () => interactiveLayers.forEach((lid) => {
          map.off("click", lid, onLayerClick);
          map.off("mouseenter", lid, onMouseEnter);
          map.off("mouseleave", lid, onMouseLeave);
        });
      } catch (e) {
        // Most commonly: a source file isn't on disk yet (first deploy
        // before data scripts have run). Silent — the toggle just
        // doesn't appear.
        console.warn(`[3d-city] setup failed: ${(e as Error).message}`);
      }
    };
    void setup();
    return () => {
      cancelled = true;
      removeListeners();
    };
  }, [basemap, buildingsOn, templesOn, wideBuildings, mapReady]);

  // Weather overlays — rain radar, Himawari infrared, MODIS aerosol.
  // Tile URL templates come from /api/cnx/weather-layers (server-side
  // time-slot resolution — see lib/cnx/weather-layers.ts); this effect
  // just adds/removes the raster source+layer per toggle. Switching
  // basemap replaces the whole style object and wipes these along with
  // the 3D city layers above, so `basemap` is a dependency here too.
  useEffect(() => {
    const map = mlMapRef.current;
    if (!map) return;
    let cancelled = false;

    // maxzoom = the deepest tile level each upstream actually serves; past it
    // MapLibre upscales the last level instead of requesting tiles that
    // don't exist (GIBS Level6 400s on z7+, RainViewer's free tier tops out at z7).
    // HII burn scars come through our own proxy (no CORS upstream); MapLibre
    // needs an absolute tile URL.
    const burnscar = (layer: "agri" | "forest") => `${window.location.origin}/api/cnx/burnscar?l=${layer}&z={z}&x={x}&y={y}`;
    const overlays: { id: string; on: boolean; url: string | null; attribution: string; opacity: number; maxzoom: number; minzoom?: number }[] = [
      { id: "cnx-rain-radar", on: rainRadarOn, url: weatherLayers?.rainRadar ?? null, attribution: weatherLayers?.attribution.rainRadar ?? "", opacity: 0.55, maxzoom: 7 },
      { id: "cnx-himawari", on: himawariOn, url: weatherLayers?.himawari ?? null, attribution: weatherLayers?.attribution.himawari ?? "", opacity: 0.5, maxzoom: 6 },
      { id: "cnx-aerosol", on: aerosolLayerOn, url: weatherLayers?.aerosol ?? null, attribution: weatherLayers?.attribution.aerosol ?? "", opacity: 0.65, maxzoom: 6 },
      { id: "cnx-burnscar-agri", on: burnScarOn, url: burnscar("agri"), attribution: BURNSCAR_ATTRIBUTION, opacity: 0.8, maxzoom: BURNSCAR_MAX_ZOOM, minzoom: BURNSCAR_MIN_ZOOM },
      { id: "cnx-burnscar-forest", on: burnScarOn, url: burnscar("forest"), attribution: BURNSCAR_ATTRIBUTION, opacity: 0.8, maxzoom: BURNSCAR_MAX_ZOOM, minzoom: BURNSCAR_MIN_ZOOM },
    ];

    const setup = async () => {
      if (!map.isStyleLoaded()) {
        await new Promise<void>((resolve) => map.once("idle", () => resolve()));
      }
      if (cancelled) return;
      try {
        for (const layer of overlays) {
          const sourceId = `${layer.id}-src`;
          if (map.getLayer(layer.id)) map.removeLayer(layer.id);
          if (map.getSource(sourceId)) map.removeSource(sourceId);
          if (!layer.on || !layer.url) continue;
          map.addSource(sourceId, {
            type: "raster",
            tiles: [layer.url],
            tileSize: 256,
            maxzoom: layer.maxzoom,
            ...(layer.minzoom !== undefined ? { minzoom: layer.minzoom } : {}),
            attribution: layer.attribution,
          });
          map.addLayer({ id: layer.id, type: "raster", source: sourceId, paint: { "raster-opacity": layer.opacity } });
        }
      } catch (e) {
        console.warn(`[weather-layers] setup failed: ${(e as Error).message}`);
      }
    };
    void setup();
    return () => {
      cancelled = true;
    };
  }, [basemap, weatherLayers, rainRadarOn, himawariOn, aerosolLayerOn, burnScarOn, mapReady]);

  return (
    <div className="relative h-full w-full overflow-hidden [&_.maplibregl-ctrl-attrib]:text-[#111] [&_.maplibregl-ctrl-attrib_a]:text-[#111]">
      <DeckGL
        viewState={viewState}
        controller={true}
        onViewStateChange={(e) => {
          // deck.gl types `viewState` directly on the params; pull and merge
          // into local state so React re-renders the deck.gl view-port.
          const vs = e.viewState as Partial<MapViewState> | undefined;
          // Clamp to ~100 km around Chiang Mai (lib/cnx/map-bounds.ts).
          if (vs) setViewState((prev) => clampView({ ...prev, ...vs }));
        }}
        layers={[
          ...layers,
          ...shelterLayers,
          ...busLayers,
          ...(rtcRouteLayer ? [rtcRouteLayer] : []),
          ...(rtcBusLayer ? [rtcBusLayer] : []),
          ...(officialLayer ? [officialLayer] : []),
        ]}
        getTooltip={({ object, layer }) => {
          if (!object || !layer) return null;
          if (layer.id === "rtc-airport-buses") {
            const b = object as SimBus;
            if (lang === "th") {
              const legTh = b.status === "layover" ? "พักที่ปลายทาง" : `${b.status === "outbound" ? "ขาออก" : b.status === "inbound" ? "ขากลับ" : b.status} · ${b.kmDone.toFixed(1)}/${b.kmTotal.toFixed(1)} กม.`;
              return `RTC ${b.ref} · ออกจากสนามบิน ${b.departedAt}\n${legTh}\nจำลองจากตารางเดินรถที่ ${SIM_SPEED_KMH} กม./ชม. ไม่ใช่ GPS จริง`;
            }
            const leg = b.status === "layover" ? "layover at terminus" : `${b.status} · ${b.kmDone.toFixed(1)}/${b.kmTotal.toFixed(1)} km`;
            return `RTC ${b.ref} · left airport ${b.departedAt}\n${leg}\nSimulated from timetable at ${SIM_SPEED_KMH} km/h`;
          }
          if (layer.id === "cmu-transit-buses") {
            const b = object as (typeof cmuBuses)[number];
            return t(`รถ มช. ${b.bus} · สาย ${b.route}\nผู้โดยสาร ${b.passenger} คน · GPS สด`, `CMU shuttle ${b.bus} · route ${b.route}\n${b.passenger} on board · live GPS`);
          }
          if (layer.id === "cmu-transit-stations") return (object as CmuStation).name;
          if (layer.id === "cnx-official-warnings") {
            const a = (object as OfficialRing).alert;
            if (lang === "en") return `Official warning · Thai Meteorological Department\n${a.headline_en ?? a.event}\nIn force ${capWindow(a.effective, a.expires, "en")}`;
            return `ประกาศทางการ · กรมอุตุนิยมวิทยา\n${a.headline_th ?? "ประกาศเตือนภัย"}\nมีผล ${capWindow(a.effective, a.expires, "th")}`;
          }
          if (layer.id === "cnx-flood-cameras") {
            const c = object as FloodCamera;
            const state = c.live ? t("ออนไลน์", "LIVE") : t("ออฟไลน์", "OFFLINE");
            const kind = c.type === "hls" ? t("วิดีโอต่อเนื่อง", "continuous video") : c.type === "snapshot" ? t("ภาพนิ่ง", "still snapshot") : c.type;
            // The offline line is deliberate. An operator planning a detour
            // needs to know this camera cannot confirm the road right now —
            // silence about a dead camera is the failure that gets someone
            // sent down a flooded street.
            return `${c.name}\n${state} · ${kind} · ${c.source}${c.region ? ` · ${c.region}` : ""}${
              c.live ? "" : `\n${t("ไม่ตอบสนอง — ยืนยันสภาพถนนจากกล้องนี้ไม่ได้", "Not answering — cannot confirm this road")}`
            }`;
          }
          if (layer.id === "cnx-river-gauges") {
            const g = object as RiverGauge;
            const parts = [
              g.nameTh + (g.code ? ` (${g.code})` : ""),
              t(`${g.levelMsl.toFixed(2)} ม.รทก.`, `${g.levelMsl.toFixed(2)} m above sea level`),
            ];
            if (g.belowBankM !== null) {
              const over = Math.abs(g.belowBankM).toFixed(2);
              parts.push(
                g.belowBankM <= 0
                  ? t(`ถึง/เกินระดับตลิ่ง (เกิน ${over} ม.)`, `AT/ABOVE bank level (${over} m over)`)
                  : t(`ต่ำกว่าระดับตลิ่ง ${g.belowBankM.toFixed(2)} ม.`, `${g.belowBankM.toFixed(2)} m below its bank level`),
              );
            } else {
              // Say the absence out loud. A gauge with no published bank
              // level must not look like a gauge that is comfortably
              // within it.
              parts.push(t("ไม่มีระดับตลิ่งที่ประกาศ — ประเมินค่านี้ไม่ได้", "no published bank level — this reading cannot be graded"));
            }
            if (g.criticalLevelMsl !== null && g.headroomM !== null) {
              parts.push(
                t(`เกณฑ์วิกฤตทางการ ${g.criticalLevelMsl.toFixed(2)} ม. — ห่างเกณฑ์ ${g.headroomM.toFixed(2)} ม.`, `official critical level ${g.criticalLevelMsl.toFixed(2)} m — ${g.headroomM.toFixed(2)} m of headroom`),
              );
            }
            if (g.dischargeM3s !== null) parts.push(t(`${g.dischargeM3s.toFixed(1)} ลบ.ม./วินาที`, `${g.dischargeM3s.toFixed(1)} m³/s`));
            parts.push(`${g.agency} · ${t("วัดเมื่อ", "observed")} ${g.observedAt.slice(0, 16).replace("T", " ")} UTC`);
            return parts.join("\n");
          }
          if (layer.id === "cnx-cctv") {
            const c = object as CctvSlot;
            const haze = hazeById.get(c.id);
            const verdict = haze ? (HAZE_LABEL[haze.verdict] ? t(HAZE_LABEL[haze.verdict].th, HAZE_LABEL[haze.verdict].en) : haze.verdict) : "";
            const hazeLine = haze ? `\n${t("หมอกควัน", "Haze")}: ${verdict}${haze.score !== null ? ` (${haze.score.toFixed(2)})` : ""} · ${t("ภาพ", "frame")} ${haze.observedAt.slice(11, 16)} UTC` : "";
            return `${c.label}\n${c.source} · ${c.reachable ? (c.hlsUrl ? t("วิดีโอสด", "live video") : t("ภาพนิ่งรีเฟรช", "refreshing still")) : t("ออฟไลน์", "OFFLINE")} — ${t("เปิดดูในแถบ CCTV ด้านบน", "open it in the CCTV strip above")}${hazeLine}`;
          }
          if (layer.id === "cnx-shelters") {
            const sh = object as Shelter;
            if (lang === "en") {
              const utilitiesEn = [sh.electricity ? "electricity" : null, sh.water ? "piped water" : null].filter(Boolean).join(" · ");
              return `Shelter: ${sh.nameTh}\n${sh.tambonTh ?? "—"}, ${sh.amphoeTh} · capacity ${sh.capacity?.toLocaleString("en-US") ?? "not stated"} people\n${utilitiesEn}${utilitiesEn ? " · " : ""}toilets ${sh.toilets ?? "not stated"}\nLocation: ${precisionLabel[sh.precision].en}\nList: Chiang Mai Provincial Office`;
            }
            const utilities = [sh.electricity ? "ไฟฟ้า" : null, sh.water ? "ประปา" : null].filter(Boolean).join(" · ");
            return `ศูนย์พักพิง: ${sh.nameTh}\nต.${sh.tambonTh ?? "—"} อ.${sh.amphoeTh} · รับได้ ${sh.capacity?.toLocaleString("th-TH") ?? "ไม่ระบุ"} คน\n${utilities}${utilities ? " · " : ""}ห้องน้ำ ${sh.toilets ?? "ไม่ระบุ"}\nตำแหน่ง: ${precisionLabel[sh.precision].th}\nรายชื่อ: สำนักงานจังหวัดเชียงใหม่`;
          }
          if (layer.id === "cnx-rain") {
            const r = object as RainStation;
            if (lang === "en") return `Rain 24 h ${r.rain24h} mm · ${RAIN_BAND_EN[r.band]}\n${r.station} · ${r.tambonTh}, ${r.amphoeEn || r.amphoeTh}\n${r.agency} · ${r.at} (ThaiWater)`;
            return `ฝน 24 ชม. ${r.rain24h} มม. · ${RAIN_BAND_TH[r.band]}\n${r.station} · ต.${r.tambonTh} อ.${r.amphoeTh}\n${r.agency} · ${r.at} น. (ThaiWater)`;
          }
          if (layer.id === "cnx-citizen") {
            const r = object as CitizenReport;
            const place = r.place ? t(r.place.nameTh, r.place.nameEn) : "";
            return `${r.source === "reddit" ? t("โพสต์ Reddit", "Reddit post") : t("ข่าว", "News")} · ${r.publishedAt.slice(0, 10)}\n${r.title}\n📍 ${place} (${t(`±${r.place?.precisionKm} กม. จากชื่อสถานที่`, `±${r.place?.precisionKm} km, from the place name`)})`;
          }
          if (layer.id === "cnx-dustboy") {
            const s = object as DustboyStation;
            return t(`${s.nameTh}\n${s.province} · PM2.5 ${s.pm25 ?? "—"} µg/m³ · อายุ ${s.readingAgeHours ?? "?"} ชม.\nเครื่องวัดภาคพื้น DustBoy มช.`, `${s.nameTh}\n${s.province} · PM2.5 ${s.pm25 ?? "—"} µg/m³ · ${s.readingAgeHours ?? "?"} h old\nCMU DustBoy ground sensor`);
          }
          if (layer.id === "cnx-smoke") {
            const s = object as TrajectorySegment;
            const where = s.nearCnx
              ? t("อยู่ภายใน 50 กม. จากตัวเมืองที่ 6 ชม.", "within 50 km of the city at 6 h")
              : s.hitsCnxBbox
              ? t("เข้าเขตจังหวัดที่ 6 ชม.", "enters the province at 6 h")
              : t("ไม่ผ่านตัวเมืองที่ 6 ชม.", "misses the city at 6 h");
            return t(`แนวควัน ${s.hotspotId}\n${where}\nเส้นกลางตามลมพยากรณ์ระดับ 850 hPa (~1.5 กม.) — ไม่รวมการแผ่กระจายหรือการตกสะสม`, `Plume ${s.hotspotId}\n${where}\nCentreline along the forecast 850 hPa wind (~1.5 km) — no spread or deposition`);
          }
          return null;
        }}
      >
        <Map
          reuseMaps
          mapStyle={style}
          attributionControl={false}
          onLoad={(e) => {
            // react-map-gl's onLoad types `e.target` as Map; it's the
            // MapLibre instance when using the maplibre adapter. Direct
            // assignment — no cast needed.
            mlMapRef.current = e.target;
            setMapReady(true);
          }}
        >
          <AttributionControl compact position="bottom-left" />
        </Map>
      </DeckGL>

      <CNXForecastLayer map={mlMapRef.current} mapReady={mapReady} styleKey={basemap} forecast={forecast} tone={basemap === "satellite" ? "light" : "dark"} />

      {/* Native disclosure keeps controls available without obscuring the operational map. */}
      <details className="absolute left-2 top-2 z-10 max-h-[calc(100%-5.5rem)] w-fit max-w-[calc(100%-1rem)] overflow-y-auto open:w-[264px] border border-[var(--line)] bg-[var(--bg-raised)] text-[var(--ink)]" onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}>
        <summary className="min-h-11 cursor-pointer px-3 py-3 text-[14px] font-semibold">{t("ชั้นข้อมูล", "Layers")}</summary>
        <div className="flex flex-col gap-1 border-t border-[var(--line)] p-3">
        <label htmlFor="cnx-basemap" className="px-1 py-2 text-[12px] font-semibold text-[var(--dim)]">{t("แผนที่พื้นฐาน", "Base map")}</label>
        <select id="cnx-basemap" value={basemap} onChange={(event) => handleBasemapChange(event.target.value as BasemapId)} className="min-h-11 w-full border border-[var(--line)] bg-[var(--bg-raised)] px-3 text-[14px] text-[var(--ink)]">
          {BASEMAP_OPTIONS.map((option) => <option key={option.id} value={option.id} title={t(BASEMAP_TH[option.id]?.hint ?? option.hint, option.hint)}>{t(BASEMAP_TH[option.id]?.label ?? option.label, option.label)}</option>)}
        </select>
        <ToggleGroupLabel>{t("เมือง 3 มิติ", "3D City")}</ToggleGroupLabel>
        <MapToggleButton
          pressed={buildingsOn}
          onClick={handleToggle3D}
          activeClassName="border-[#12354e] bg-[#12354e] text-white"
        >
          {buildingsOn ? t("เมือง 3 มิติ: เปิด", "3D City: on") : t("เมือง 3 มิติ: 2 มิติ", "3D City: 2D")}
        </MapToggleButton>
        <MapToggleButton
          pressed={templesOn}
          onClick={() => setTemplesOn((v) => !v)}
          activeClassName="border-[#b8860b] bg-[#b8860b] text-white"
        >
          {templesOn ? t("วัด: สีทอง", "Temples: gold") : t("วัด: ปิด", "Temples: off")}
        </MapToggleButton>
        <MapToggleButton
          pressed={wallsOn}
          onClick={() => setWallsOn((v) => !v)}
          activeClassName="border-[#12354e] bg-[#12354e] text-white"
        >
          {wallsOn ? t("กำแพงเมือง: เปิด", "Walls: on") : t("กำแพงเมือง: ปิด", "Walls: off")}
        </MapToggleButton>
        <MapToggleButton
          pressed={waterwaysOn}
          onClick={() => setWaterwaysOn((v) => !v)}
          activeClassName="border-[#1d4ed8] bg-[#1d4ed8] text-white"
        >
          {waterwaysOn ? t("แม่น้ำ: เปิด", "Rivers: on") : t("แม่น้ำ: ปิด", "Rivers: off")}
        </MapToggleButton>

        <ToggleGroupLabel>{t("การเดินทาง", "Transit")}</ToggleGroupLabel>
        <MapToggleButton
          pressed={busesOn}
          onClick={() => setBusesOn((v) => !v)}
          activeClassName="border-[#b8860b] bg-[#b8860b] text-white"
        >
          {busesOn ? t("รถเมล์: เปิด", "Buses: on") : t("รถเมล์: ปิด", "Buses: off")}
        </MapToggleButton>
        <MapToggleButton
          pressed={cmuShuttleOn}
          onClick={() => setCmuShuttleOn((v) => !v)}
          activeClassName="border-[#725b40] bg-[#725b40] text-white"
          title={t("ตำแหน่งรถ มช. แบบสด — เปิดการเชื่อมต่อกับฟีด MQTT สาธารณะของมหาวิทยาลัยขณะเปิดใช้", "Live CMU shuttle positions — opens a connection to the university's public MQTT feed while on")}
        >
          {cmuShuttleOn ? t(`รถ มช.: เปิด (${cmuBuses.length})`, `CMU Shuttle: on (${cmuBuses.length})`) : t("รถ มช.: ปิด", "CMU Shuttle: off")}
        </MapToggleButton>
        <MapToggleButton
          pressed={airportBusOn}
          onClick={() => setAirportBusOn((v) => !v)}
          activeClassName="border-[#e53935] bg-[#e53935] text-white"
          title={t(`รถ RTC สนามบิน 24A/24B/24C จำลองจากตารางเดินรถที่ประกาศ ความเร็ว ${SIM_SPEED_KMH} กม./ชม. — ไม่ใช่ GPS จริง`, `RTC 24A/24B/24C airport buses, simulated from the published timetable at ${SIM_SPEED_KMH} km/h — not live GPS`)}
        >
          {airportBusOn ? t(`รถสนามบิน: จำลอง (${airportBuses.length})`, `Airport Bus: sim (${airportBuses.length})`) : t("รถสนามบิน: ปิด", "Airport Bus: off")}
        </MapToggleButton>

        <ToggleGroupLabel>{t("ชั้นภาพ · ครั้งละหนึ่งชั้น", "Image layer · one at a time")}</ToggleGroupLabel>
        <MapToggleButton
          pressed={rainRadarOn}
          onClick={() => pickOverlay("rain")}
          activeClassName="border-[#0891b2] bg-[#0891b2] text-white"
          disabled={!weatherLayers?.rainRadar}
          title={t("เรดาร์ฝนสด — RainViewer อัปเดตราว 10 นาที", "Live precipitation radar — RainViewer, refreshes ~every 10 min")}
        >
          {weatherLayers?.rainRadar ? (rainRadarOn ? t("เรดาร์ฝน: เปิด", "Rain Radar: on") : t("เรดาร์ฝน: ปิด", "Rain Radar: off")) : t("เรดาร์ฝน: ไม่มีข้อมูล", "Rain Radar: no data")}
        </MapToggleButton>
        <MapToggleButton
          pressed={himawariOn}
          onClick={() => pickOverlay("ir")}
          activeClassName="border-[#7c3aed] bg-[#7c3aed] text-white"
          disabled={!weatherLayers?.himawari}
          title={t("ภาพเมฆอินฟราเรด Himawari-9 — NASA GIBS / JMA ทุกราว 10 นาที", "Himawari-9 infrared cloud imagery — NASA GIBS / JMA, ~10 min cadence")}
        >
          {weatherLayers?.himawari ? (himawariOn ? t("ดาวเทียมอินฟราเรด: เปิด", "Satellite IR: on") : t("ดาวเทียมอินฟราเรด: ปิด", "Satellite IR: off")) : t("ดาวเทียมอินฟราเรด: ไม่มีข้อมูล", "Satellite IR: no data")}
        </MapToggleButton>
        <MapToggleButton
          pressed={aerosolLayerOn}
          onClick={() => pickOverlay("aerosol")}
          activeClassName="border-[#a16207] bg-[#a16207] text-white"
          disabled={!weatherLayers?.aerosol}
          title={t("ความลึกเชิงแสงของละอองลอย MODIS — ความหนาแน่นหมอกควัน รายวัน NASA GIBS", "MODIS aerosol optical depth — haze / smoke density, daily, NASA GIBS")}
        >
          {weatherLayers?.aerosol ? (aerosolLayerOn ? t("ละอองลอย (AOD): เปิด", "Aerosol (AOD): on") : t("ละอองลอย (AOD): ปิด", "Aerosol (AOD): off")) : t("ละอองลอย (AOD): ไม่มีข้อมูล", "Aerosol (AOD): no data")}
        </MapToggleButton>
        <MapToggleButton
          pressed={burnScarOn}
          onClick={() => pickOverlay("burnscar")}
          activeClassName="border-[#9a3412] bg-[#9a3412] text-white"
          title={t("พื้นที่เผาไหม้ทั้งฤดู ธ.ค. 2568 – เม.ย. 2569 จาก Sentinel-2 ความละเอียด 20 ม. พื้นที่เกษตรและป่า — สสน. ตามรอยเผา (tamroypao.hii.or.th)", "Burned area, whole season Dec 2025 – Apr 2026, 20 m Sentinel-2, farmland + forest — HII Tamroypao (tamroypao.hii.or.th)")}
        >
          {burnScarOn ? t("ร่องรอยการเผา 2569: เปิด", "Burn scars 2569: on") : t("ร่องรอยการเผา 2569: ปิด", "Burn scars 2569: off")}
        </MapToggleButton>

        <ToggleGroupLabel>{t("ศูนย์พักพิง", "Shelters")}</ToggleGroupLabel>
        <MapToggleButton
          pressed={sheltersOn}
          onClick={() => setSheltersOn((v) => !v)}
          activeClassName="border-[var(--cool)] bg-[var(--cool)] text-[var(--bg)]"
          disabled={shelters.length === 0}
          title={t("ศูนย์พักพิงน้ำท่วมชั่วคราวทางการ (สำนักงานจังหวัดเชียงใหม่) วงทึบ = พบอาคารบนแผนที่ วงโปร่ง = ตำแหน่งโดยประมาณ", "Official temporary flood shelters (Chiang Mai Provincial Office). Solid ring = building mapped; hollow = approximate location.")}
        >
          {shelters.length ? (sheltersOn ? t(`ศูนย์พักพิง: แสดง (${shelters.length})`, `Shelters: shown (${shelters.length})`) : t("ศูนย์พักพิง: ซ่อน", "Shelters: hidden")) : t("ศูนย์พักพิง: ไม่มีข้อมูล", "Shelters: no data")}
        </MapToggleButton>

        <ToggleGroupLabel>{t("อากาศและฝุ่น", "Weather & Air")}</ToggleGroupLabel>
        <MapToggleButton
          pressed={rainOn}
          onClick={() => setRainOn((v) => !v)}
          activeClassName="border-[#1e40af] bg-[#1e40af] text-white"
          disabled={wetStations.length === 0}
          title={t("ฝน 24 ชม. ที่วัดได้จากสถานี ThaiWater ระดับปานกลาง (≥10.1 มม.) ขึ้นไป ฝนหนักบนลาดเขาทำให้เกิดน้ำป่าได้แม้ห่างจากสถานีวัดระดับน้ำ", "Measured 24-hour rainfall at ThaiWater gauges, moderate (≥10.1 mm) and above. Heavy rain on slopes can cause flash floods far from any river gauge.")}
        >
          {wetStations.length ? (rainOn ? t(`ฝน 24 ชม.: เปิด (${wetStations.length})`, `Rain 24h: on (${wetStations.length})`) : t("ฝน 24 ชม.: ปิด", "Rain 24h: off")) : rainAvailable && currentRainStations.length ? t("ฝน 24 ชม.: ไม่มีจุดที่ ≥10.1 มม.", "Rain 24h: none ≥10.1 mm") : t("ฝน 24 ชม.: ไม่มีข้อมูล", "Rain 24h: unavailable")}
        </MapToggleButton>
        <MapToggleButton
          pressed={dustboyOn}
          onClick={() => setDustboyOn((v) => !v)}
          activeClassName="border-[#166534] bg-[#166534] text-white"
          disabled={dustboyStations.length === 0}
          title={t("PM2.5 ภาคพื้นจาก DustBoy มช. แสดงเฉพาะเครื่องที่มีค่าอายุไม่เกิน 3 ชม.", "CMU DustBoy ground PM2.5. Dots appear only for sensors with a reading under 3 hours old.")}
        >
          {dustboyStations.length ? (dustboyOn ? t(`DustBoy: เปิด (${dustboyStations.length})`, `DustBoy: on (${dustboyStations.length})`) : t("DustBoy: ปิด", "DustBoy: off")) : t("DustBoy: ไม่มีข้อมูล", "DustBoy: no data")}
        </MapToggleButton>
        <MapToggleButton
          pressed={plumesOn}
          onClick={() => setPlumesOn((v) => !v)}
          activeClassName="border-[#c2410c] bg-[#c2410c] text-white"
          disabled={smokeSegments.length === 0}
          title={t("ควันจากจุดไฟ VIIRS ล่าสุดจะถูกพาไปทางไหนใน 6 ชม. ข้างหน้า ตามลมพยากรณ์ที่ ~1.5 กม. เป็นเส้นกลาง — ไม่รวมการแผ่กระจายหรือการตกสะสม สีแดงคือถึงตัวเมือง", "Where smoke from a live VIIRS fire is carried in the next 6 hours, following the forecast wind at ~1.5 km as it turns. A centreline — no spread or deposition. Red reaches the city.")}
        >
          {smokeSegments.length ? (plumesOn ? t(`แนวควัน: เปิด (${smokeSegments.length})`, `Plumes: on (${smokeSegments.length})`) : t("แนวควัน: ปิด", "Plumes: off")) : t("แนวควัน: ไม่มี", "Plumes: none")}
        </MapToggleButton>

        <ToggleGroupLabel>{t("วงระยะทาง", "Range Rings")}</ToggleGroupLabel>
        <div className="flex gap-1">
          {[1, 5, 10].map((km) => {
            const on = gridRadii.has(km);
            return (
              <button
                key={km}
                type="button"
                onClick={() =>
                  setGridRadii((prev) => {
                    const next = new Set(prev);
                    if (next.has(km)) next.delete(km);
                    else next.add(km);
                    return next;
                  })
                }
                aria-pressed={on}
                className={`min-h-11 flex-1 border px-2 py-2 text-[13px] font-semibold ${
                  on ? "border-[#6b6b6b] bg-[#6b6b6b] text-white" : "border-[var(--line)] bg-[var(--bg-raised)] text-[var(--ink)]"
                }`}
              >
                {km} {t("กม.", "km")}
              </button>
            );
          })}
        </div>
        </div>
      </details>

      {/* Flight count badge, top-right */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 bg-[var(--bg-raised)] px-2 py-1">
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--cool)]"
        />
        <span className="text-[12px] font-semibold text-[var(--cool)]">
          {t(`${flights.length} เที่ยวบิน`, `${flights.length} ${flights.length === 1 ? "flight" : "flights"}`)}
        </span>
      </div>

      {/* Atlas-compatible Building Information Card */}
      {selectedBuilding && (
        <aside
          aria-label={t("รายละเอียดอาคาร 3 มิติ", "3D building details")}
          className="absolute bottom-12 left-3 z-40 max-w-[340px] border border-[var(--line)] bg-[var(--bg-raised)] p-3"
        >
          <div className="flex items-start justify-between gap-2 border-b border-[var(--line)] pb-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-block bg-[var(--cool)] px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-white">
                  {KIND_LABEL[selectedBuilding.kind] ? t(KIND_LABEL[selectedBuilding.kind].th, KIND_LABEL[selectedBuilding.kind].en) : selectedBuilding.kind.toUpperCase()}
                </span>
                <span className="inline-block border border-emerald-600 bg-emerald-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  {t("พร้อมรับข้อมูล", "Atlas ready")}
                </span>
              </div>
              <h3 className="mt-1 truncate font-mono text-[13px] font-bold text-[var(--ink)]">
                {(lang === "en" ? selectedBuilding.nameEn || selectedBuilding.name : selectedBuilding.name) || t(`อาคาร #${selectedBuilding.id}`, `Building #${selectedBuilding.id}`)}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedBuilding(null)}
              className="flex h-5 w-5 items-center justify-center text-[12px] font-bold text-[var(--dim)] hover:bg-[var(--line)] hover:text-[var(--ink)]"
              aria-label={t("ปิด", "Close")}
            >
              ✕
            </button>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-[11px]">
            <div className="border border-[var(--line)] bg-[var(--bg)] p-1.5">
              <span className="block text-[11px] uppercase tracking-wider text-[var(--dim)]">{t("ความสูง / ชั้น", "Height / floors")}</span>
              <span className="font-bold text-[var(--ink)]">
                {selectedBuilding.height} {t("ม.", "m")} ({selectedBuilding.levels ? t(`${selectedBuilding.levels} ชั้น`, `${selectedBuilding.levels} ${selectedBuilding.levels === 1 ? "floor" : "floors"}`) : "—"})
              </span>
            </div>
            <div className="border border-[var(--line)] bg-[var(--bg)] p-1.5">
              <span className="block text-[11px] uppercase tracking-wider text-[var(--dim)]">{t("การใช้ประโยชน์", "Use")}</span>
              <span className="font-bold text-[var(--ink)]">
                {KIND_LABEL[selectedBuilding.kind] ? t(KIND_LABEL[selectedBuilding.kind].th, KIND_LABEL[selectedBuilding.kind].en) : selectedBuilding.kind}
              </span>
            </div>
            <div className="border border-[var(--line)] bg-[var(--bg)] p-1.5">
              <span className="block text-[11px] uppercase tracking-wider text-[var(--dim)]">👥 {t("ประชากร (คน)", "Population")}</span>
              <span className="italic text-[var(--dim)]">{t("รอเชื่อมโยงข้อมูล", "Not yet linked")}</span>
            </div>
            <div className="border border-[var(--line)] bg-[var(--bg)] p-1.5">
              <span className="block text-[11px] uppercase tracking-wider text-[var(--dim)]">⚡ {t("ไฟฟ้าสูงสุด", "Peak electricity")}</span>
              <span className="italic text-[var(--dim)]">{t("รอเชื่อม กฟภ.", "PEA not yet linked")}</span>
            </div>
            <div className="border border-[var(--line)] bg-[var(--bg)] p-1.5">
              <span className="block text-[11px] uppercase tracking-wider text-[var(--dim)]">💧 {t("การใช้น้ำประปา", "Water use")}</span>
              <span className="italic text-[var(--dim)]">{t("รอเชื่อม กปภ.", "PWA not yet linked")}</span>
            </div>
            <div className="border border-[var(--line)] bg-[var(--bg)] p-1.5">
              <span className="block text-[11px] uppercase tracking-wider text-[var(--dim)]">📋 {t("สำรวจล่าสุด", "Last survey")}</span>
              <span className="italic text-[var(--dim)]">{t("รอลงพื้นที่สำรวจ", "Awaiting field survey")}</span>
            </div>
          </div>

          {selectedBuilding.address && (
            <div className="mt-2 border-t border-[var(--line)] pt-1.5 font-mono text-[11px] text-[var(--dim)]">
              📍 {selectedBuilding.address}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-[var(--line)] pt-2 font-mono text-[11px] text-[var(--dim)]">
            <span>OSM ID: {selectedBuilding.id}</span>
            <a
              href={`https://www.openstreetmap.org/way/${selectedBuilding.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--cool)] hover:underline"
            >
              {t("ดูบน OSM", "View on OSM")} ↗
            </a>
          </div>
        </aside>
      )}
    </div>
  );
}
