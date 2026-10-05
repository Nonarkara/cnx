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

import { RAIN_BAND_TH, summariseRain, type RainStation } from "../../lib/cnx/rain-core";
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
import { IconLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";
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
}

const NO_CAMERA_HAZE: CameraHaze[] = [];
const NO_REPORTS: CitizenReport[] = [];
const NO_RAIN: RainStation[] = [];
const NO_DUSTBOY: DustboyStation[] = [];
const NO_PLUMES: TrajectorySegment[] = [];
const HAZE_FILL: Record<HazeLabel, [number, number, number, number]> = {
  "haze-likely": [220, 38, 38, 235],
  "some-haze": [234, 179, 8, 230],
  clear: [29, 78, 216, 220],
  "too-dark": [107, 107, 107, 200],
  "no-colour": [107, 107, 107, 200],
  calibrating: [107, 107, 107, 200],
};

const NO_RTC_LINES: RtcLine[] = [];

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
}: MapProps) {
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
  useEffect(() => { const timer = window.setInterval(() => setRainClock(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const currentRainStations = useMemo(() => summariseRain(rainStations, rainClock).stations, [rainStations, rainClock]);
  const wetStations = useMemo(() => currentRainStations.filter((s) => s.band === "moderate" || s.band === "heavy" || s.band === "very-heavy"), [currentRainStations]);
  const [busesOn, setBusesOn] = useState(true);
  const [cmuShuttleOn, setCmuShuttleOn] = useState(true);
  const cmuBuses = useCmuTransitBuses(cmuShuttleOn);
  const [airportBusOn, setAirportBusOn] = useState(true);
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

    // Fire hotspots — FIRMS bright dots, fixed-pixel size.
    const fireLayer = new ScatterplotLayer<FireHotspot>({
      id: "cnx-fires",
      data: fireHotspots,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 5,
      radiusUnits: "pixels",
      getFillColor: (d) =>
        d.severity === "critical"
        ? [255, 60, 30, 235]
        : d.severity === "alert"
        ? [255, 140, 0, 220]
        : [255, 200, 0, 200],
      getLineColor: () => [255, 220, 0, 230],
      lineWidthMinPixels: 1,
      stroked: true,
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
    // Rain gauges: sized by the 24 h total, darkest for very heavy rain.
    const rainLayer = new ScatterplotLayer<RainStation>({
      id: "cnx-rain",
      data: rainOn ? wetStations : [],
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => 4 + Math.min(10, d.rain24h / 10),
      radiusUnits: "pixels",
      getFillColor: (d) => (d.band === "very-heavy" ? [30, 64, 175, 235] : d.band === "heavy" ? [37, 99, 235, 220] : [96, 165, 250, 190]),
      getLineColor: [255, 255, 255, 230],
      lineWidthMinPixels: 1,
      stroked: true,
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
            name: props.name_th || props.name_en || props.name || `อาคาร #${props.id ?? feat.id ?? ""}`,
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
          ...busLayers,
          ...(rtcRouteLayer ? [rtcRouteLayer] : []),
          ...(rtcBusLayer ? [rtcBusLayer] : []),
        ]}
        getTooltip={({ object, layer }) => {
          if (!object || !layer) return null;
          if (layer.id === "rtc-airport-buses") {
            const b = object as SimBus;
            const leg = b.status === "layover" ? "layover at terminus" : `${b.status} · ${b.kmDone.toFixed(1)}/${b.kmTotal.toFixed(1)} km`;
            return `RTC ${b.ref} · left airport ${b.departedAt}\n${leg}\nSimulated from timetable at ${SIM_SPEED_KMH} km/h`;
          }
          if (layer.id === "cmu-transit-buses") {
            const b = object as (typeof cmuBuses)[number];
            return `CMU shuttle ${b.bus} · route ${b.route}\n${b.passenger} on board · live GPS`;
          }
          if (layer.id === "cmu-transit-stations") return (object as CmuStation).name;
          if (layer.id === "cnx-flood-cameras") {
            const c = object as FloodCamera;
            const state = c.live ? "LIVE" : "OFFLINE";
            const kind = c.type === "hls" ? "continuous video" : c.type === "snapshot" ? "still snapshot" : c.type;
            // The offline line is deliberate. An operator planning a detour
            // needs to know this camera cannot confirm the road right now —
            // silence about a dead camera is the failure that gets someone
            // sent down a flooded street.
            return `${c.name}\n${state} · ${kind} · ${c.source}${c.region ? ` · ${c.region}` : ""}${
              c.live ? "" : "\nไม่ตอบสนอง — ยืนยันสภาพถนนจากกล้องนี้ไม่ได้ (not answering — cannot confirm this road)"
            }`;
          }
          if (layer.id === "cnx-river-gauges") {
            const g = object as RiverGauge;
            const parts = [
              g.nameTh + (g.code ? ` (${g.code})` : ""),
              `${g.levelMsl.toFixed(2)} m above sea level`,
            ];
            if (g.belowBankM !== null) {
              parts.push(
                g.belowBankM <= 0
                  ? `AT/ABOVE bank level (${Math.abs(g.belowBankM).toFixed(2)} m over)`
                  : `${g.belowBankM.toFixed(2)} m below its bank level`,
              );
            } else {
              // Say the absence out loud. A gauge with no published bank
              // level must not look like a gauge that is comfortably
              // within it.
              parts.push("no published bank level — this reading cannot be graded");
            }
            if (g.criticalLevelMsl !== null && g.headroomM !== null) {
              parts.push(
                `official critical level ${g.criticalLevelMsl.toFixed(2)} m — ${g.headroomM.toFixed(2)} m of headroom`,
              );
            }
            if (g.dischargeM3s !== null) parts.push(`${g.dischargeM3s.toFixed(1)} m³/s`);
            parts.push(`${g.agency} · observed ${g.observedAt.slice(0, 16).replace("T", " ")} UTC`);
            return parts.join("\n");
          }
          if (layer.id === "cnx-cctv") {
            const c = object as CctvSlot;
            const haze = hazeById.get(c.id);
            const hazeLine = haze ? `\nHaze: ${haze.verdict}${haze.score !== null ? ` (${haze.score.toFixed(2)})` : ""} · frame ${haze.observedAt.slice(11, 16)} UTC` : "";
            return `${c.label}\n${c.source} · ${c.reachable ? (c.hlsUrl ? "วิดีโอสด" : "ภาพนิ่งรีเฟรช") : "OFFLINE"} — เปิดดูในแถบ CCTV ด้านบน${hazeLine}`;
          }
          if (layer.id === "cnx-rain") {
            const r = object as RainStation;
            return `ฝน 24 ชม. ${r.rain24h} มม. · ${RAIN_BAND_TH[r.band]}\n${r.station} · ต.${r.tambonTh} อ.${r.amphoeTh}\n${r.agency} · ${r.at} น. (ThaiWater)`;
          }
          if (layer.id === "cnx-citizen") {
            const r = object as CitizenReport;
            return `${r.source === "reddit" ? "Reddit post" : "News"} · ${r.publishedAt.slice(0, 10)}\n${r.title}\n📍 ${r.place?.nameEn || r.place?.nameTh} (±${r.place?.precisionKm} km, from the place name)`;
          }
          if (layer.id === "cnx-dustboy") {
            const s = object as DustboyStation;
            return `${s.nameTh}\n${s.province} · PM2.5 ${s.pm25 ?? "—"} µg/m³ · ${s.readingAgeHours ?? "?"} h old\nCMU DustBoy ground sensor`;
          }
          if (layer.id === "cnx-smoke") {
            const s = object as TrajectorySegment;
            const where = s.nearCnx ? "within 50 km of the city at 6 h" : s.hitsCnxBbox ? "enters the province at 6 h" : "misses the city at 6 h";
            return `Plume ${s.hotspotId}\n${where}\nStraight-line advection — not a forecast`;
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

      {/* Native disclosure keeps controls available without obscuring the operational map. */}
      <details className="absolute left-2 top-2 z-10 max-h-[calc(100%-5.5rem)] w-fit max-w-[calc(100%-1rem)] overflow-y-auto open:w-[264px] rounded-sm border border-[var(--line)] bg-[var(--bg-raised)] text-[var(--ink)] shadow-sm" onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}>
        <summary className="min-h-11 cursor-pointer px-3 py-3 text-[14px] font-semibold">ชั้นข้อมูล · Layers</summary>
        <div className="flex flex-col gap-1 border-t border-[var(--line)] p-3">
        <label htmlFor="cnx-basemap" className="px-1 py-2 text-[12px] font-semibold text-[var(--dim)]">แผนที่พื้นฐาน · Base map</label>
        <select id="cnx-basemap" value={basemap} onChange={(event) => handleBasemapChange(event.target.value as BasemapId)} className="min-h-11 w-full border border-[var(--line)] bg-[var(--bg-raised)] px-3 text-[14px] text-[var(--ink)]">
          {BASEMAP_OPTIONS.map((option) => <option key={option.id} value={option.id} title={option.hint}>{option.label}</option>)}
        </select>
        <ToggleGroupLabel>3D City</ToggleGroupLabel>
        <MapToggleButton
          pressed={buildingsOn}
          onClick={handleToggle3D}
          activeClassName="border-[#12354e] bg-[#12354e] text-white shadow-sm"
        >
          {buildingsOn ? "3D City: on" : "3D City: 2D"}
        </MapToggleButton>
        <MapToggleButton
          pressed={templesOn}
          onClick={() => setTemplesOn((v) => !v)}
          activeClassName="border-[#b8860b] bg-[#b8860b] text-white"
        >
          {templesOn ? "Temples: gold" : "Temples: off"}
        </MapToggleButton>
        <MapToggleButton
          pressed={wallsOn}
          onClick={() => setWallsOn((v) => !v)}
          activeClassName="border-[#12354e] bg-[#12354e] text-white"
        >
          {wallsOn ? "Walls: on" : "Walls: off"}
        </MapToggleButton>
        <MapToggleButton
          pressed={waterwaysOn}
          onClick={() => setWaterwaysOn((v) => !v)}
          activeClassName="border-[#1d4ed8] bg-[#1d4ed8] text-white"
        >
          {waterwaysOn ? "Rivers: on" : "Rivers: off"}
        </MapToggleButton>

        <ToggleGroupLabel>Transit</ToggleGroupLabel>
        <MapToggleButton
          pressed={busesOn}
          onClick={() => setBusesOn((v) => !v)}
          activeClassName="border-[#b8860b] bg-[#b8860b] text-white"
        >
          {busesOn ? "Buses: on" : "Buses: off"}
        </MapToggleButton>
        <MapToggleButton
          pressed={cmuShuttleOn}
          onClick={() => setCmuShuttleOn((v) => !v)}
          activeClassName="border-[#725b40] bg-[#725b40] text-white"
          title="Live CMU shuttle positions — opens a connection to the university's public MQTT feed while on"
        >
          {cmuShuttleOn ? `CMU Shuttle: on (${cmuBuses.length})` : "CMU Shuttle: off"}
        </MapToggleButton>
        <MapToggleButton
          pressed={airportBusOn}
          onClick={() => setAirportBusOn((v) => !v)}
          activeClassName="border-[#e53935] bg-[#e53935] text-white"
          title={`RTC 24A/24B/24C airport buses, simulated from the published timetable at ${SIM_SPEED_KMH} km/h — not live GPS`}
        >
          {airportBusOn ? `Airport Bus: sim (${airportBuses.length})` : "Airport Bus: off"}
        </MapToggleButton>

        <ToggleGroupLabel>Image layer · one at a time</ToggleGroupLabel>
        <MapToggleButton
          pressed={rainRadarOn}
          onClick={() => pickOverlay("rain")}
          activeClassName="border-[#0891b2] bg-[#0891b2] text-white"
          disabled={!weatherLayers?.rainRadar}
          title="Live precipitation radar — RainViewer, refreshes ~every 10 min"
        >
          {weatherLayers?.rainRadar ? (rainRadarOn ? "Rain Radar: on" : "Rain Radar: off") : "Rain Radar: no data"}
        </MapToggleButton>
        <MapToggleButton
          pressed={himawariOn}
          onClick={() => pickOverlay("ir")}
          activeClassName="border-[#7c3aed] bg-[#7c3aed] text-white"
          disabled={!weatherLayers?.himawari}
          title="Himawari-9 infrared cloud imagery — NASA GIBS / JMA, ~10 min cadence"
        >
          {weatherLayers?.himawari ? (himawariOn ? "Satellite IR: on" : "Satellite IR: off") : "Satellite IR: no data"}
        </MapToggleButton>
        <MapToggleButton
          pressed={aerosolLayerOn}
          onClick={() => pickOverlay("aerosol")}
          activeClassName="border-[#a16207] bg-[#a16207] text-white"
          disabled={!weatherLayers?.aerosol}
          title="MODIS aerosol optical depth — haze / smoke density, daily, NASA GIBS"
        >
          {weatherLayers?.aerosol ? (aerosolLayerOn ? "Aerosol (AOD): on" : "Aerosol (AOD): off") : "Aerosol (AOD): no data"}
        </MapToggleButton>
        <MapToggleButton
          pressed={burnScarOn}
          onClick={() => pickOverlay("burnscar")}
          activeClassName="border-[#9a3412] bg-[#9a3412] text-white"
          title="Burned area, whole season Dec 2025 – Apr 2026, 20 m Sentinel-2, farmland + forest — HII ตามรอยเผา (tamroypao.hii.or.th)"
        >
          {burnScarOn ? "Burn scars 2569: on" : "Burn scars 2569: off"}
        </MapToggleButton>

        <ToggleGroupLabel>Weather &amp; Air</ToggleGroupLabel>
        <MapToggleButton
          pressed={rainOn}
          onClick={() => setRainOn((v) => !v)}
          activeClassName="border-[#1e40af] bg-[#1e40af] text-white"
          disabled={wetStations.length === 0}
          title="Measured 24-hour rainfall at ThaiWater gauges, moderate (≥10.1 mm) and above. Heavy rain on slopes can cause flash floods far from any river gauge."
        >
          {wetStations.length ? (rainOn ? `Rain 24h: on (${wetStations.length})` : "Rain 24h: off") : rainAvailable && currentRainStations.length ? "Rain 24h: none ≥10.1 mm" : "Rain 24h: unavailable"}
        </MapToggleButton>
        <MapToggleButton
          pressed={dustboyOn}
          onClick={() => setDustboyOn((v) => !v)}
          activeClassName="border-[#166534] bg-[#166534] text-white"
          disabled={dustboyStations.length === 0}
          title="CMU DustBoy ground PM2.5. Dots appear only for sensors with a reading under 3 hours old."
        >
          {dustboyStations.length ? (dustboyOn ? `DustBoy: on (${dustboyStations.length})` : "DustBoy: off") : "DustBoy: no data"}
        </MapToggleButton>
        <MapToggleButton
          pressed={plumesOn}
          onClick={() => setPlumesOn((v) => !v)}
          activeClassName="border-[#c2410c] bg-[#c2410c] text-white"
          disabled={smokeSegments.length === 0}
          title="Where smoke is heading in 6 hours. Straight-line wind advection from a live VIIRS pass — not a forecast. Red reaches the city."
        >
          {smokeSegments.length ? (plumesOn ? `Plumes: on (${smokeSegments.length})` : "Plumes: off") : "Plumes: none"}
        </MapToggleButton>

        <ToggleGroupLabel>Range Rings</ToggleGroupLabel>
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
                {km} km
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
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#b8860b]"
        />
        <span className="text-[12px] font-semibold text-[var(--cool)]">
          {flights.length} {flights.length === 1 ? "flight" : "flights"}
        </span>
      </div>

      {/* Atlas-compatible Building Information Card */}
      {selectedBuilding && (
        <aside
          aria-label="รายละเอียดอาคาร 3 มิติ"
          className="absolute bottom-12 left-3 z-40 max-w-[340px] rounded-sm border border-[var(--line)] bg-[var(--bg-raised)]/95 p-3 shadow-2xl backdrop-blur-md"
        >
          <div className="flex items-start justify-between gap-2 border-b border-[var(--line)] pb-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-block rounded bg-[var(--cool)] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-white">
                  {selectedBuilding.kind === "temple" ? "ศาสนสถาน · วัด" : selectedBuilding.kind.toUpperCase()}
                </span>
                <span className="inline-block rounded border border-emerald-600 bg-emerald-50 px-1.5 py-0.5 font-mono text-[8px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  พร้อมรับข้อมูล · Atlas Ready
                </span>
              </div>
              <h3 className="mt-1 truncate font-mono text-[13px] font-bold text-[var(--ink)]">
                {selectedBuilding.name}
              </h3>
              {selectedBuilding.nameEn && selectedBuilding.nameEn !== selectedBuilding.name && (
                <div className="truncate text-[10px] text-[var(--dim)]">{selectedBuilding.nameEn}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedBuilding(null)}
              className="flex h-5 w-5 items-center justify-center rounded text-[12px] font-bold text-[var(--dim)] hover:bg-[var(--line)] hover:text-[var(--ink)]"
              aria-label="ปิด"
            >
              ✕
            </button>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-[9px]">
            <div className="rounded border border-[var(--line)] bg-[var(--bg)] p-1.5">
              <span className="block text-[8px] uppercase tracking-wider text-[var(--dim)]">ความสูง / ชั้น</span>
              <span className="font-bold text-[var(--ink)]">
                {selectedBuilding.height} ม. ({selectedBuilding.levels ? `${selectedBuilding.levels} ชั้น` : "—"})
              </span>
            </div>
            <div className="rounded border border-[var(--line)] bg-[var(--bg)] p-1.5">
              <span className="block text-[8px] uppercase tracking-wider text-[var(--dim)]">การใช้ประโยชน์</span>
              <span className="font-bold text-[var(--ink)]">
                {selectedBuilding.kind === "temple" ? "วัด / ศาสนสถาน" : selectedBuilding.kind}
              </span>
            </div>
            <div className="rounded border border-[var(--line)] bg-[var(--bg)] p-1.5">
              <span className="block text-[8px] uppercase tracking-wider text-[var(--dim)]">👥 ประชากร (คน)</span>
              <span className="italic text-[var(--dim)]">รอเชื่อมโยงข้อมูล</span>
            </div>
            <div className="rounded border border-[var(--line)] bg-[var(--bg)] p-1.5">
              <span className="block text-[8px] uppercase tracking-wider text-[var(--dim)]">⚡ ไฟฟ้าสูงสุด</span>
              <span className="italic text-[var(--dim)]">รอเชื่อม PEA</span>
            </div>
            <div className="rounded border border-[var(--line)] bg-[var(--bg)] p-1.5">
              <span className="block text-[8px] uppercase tracking-wider text-[var(--dim)]">💧 การใช้น้ำประปา</span>
              <span className="italic text-[var(--dim)]">รอเชื่อม PWA</span>
            </div>
            <div className="rounded border border-[var(--line)] bg-[var(--bg)] p-1.5">
              <span className="block text-[8px] uppercase tracking-wider text-[var(--dim)]">📋 สำรวจล่าสุด</span>
              <span className="italic text-[var(--dim)]">รอลงพื้นที่สำรวจ</span>
            </div>
          </div>

          {selectedBuilding.address && (
            <div className="mt-2 border-t border-[var(--line)] pt-1.5 font-mono text-[9px] text-[var(--dim)]">
              📍 {selectedBuilding.address}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-[var(--line)] pt-2 font-mono text-[8px] text-[var(--dim)]">
            <span>OSM ID: {selectedBuilding.id}</span>
            <a
              href={`https://www.openstreetmap.org/way/${selectedBuilding.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--cool)] hover:underline"
            >
              ดูบน OSM ↗
            </a>
          </div>
        </aside>
      )}
    </div>
  );
}
