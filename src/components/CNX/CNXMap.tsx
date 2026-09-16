// @ts-nocheck
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

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MapViewState } from "@deck.gl/core";
import { IconLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { BusRoute } from "../../types/cnx";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MaplibreMap } from "maplibre-gl";

import { basemapStyle, BASEMAP_OPTIONS, type BasemapId } from "../../services/basemap-styles";
import type { FlightState } from "../../lib/cnx/opensky";
import type { CnxHeritageSite, AirStation, FireHotspot, CnxFloodGauge } from "../../types/cnx";
import type { Waterway } from "../../lib/cnx/waterways";

const DeckGL = dynamic(() => import("@deck.gl/react").then((m) => m.default), {
  ssr: false,
});
const Map = dynamic(() => import("react-map-gl/maplibre").then((m) => m.default), {
  ssr: false,
});

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
//   Doi Suthep gold (temples)  → #f59e0b / #d97706 (saffron / chedi gilding)
//   Lanna navy (civic / gov)   → #1d2951
//   Lanna blue (commercial)    → #2563eb
//   Tourism / Hotel            → #0284c7
//   Education / School         → #059669
//   Healthcare / Hospital      → #e11d48
//   Heritage / Walls           → #9a3412
//   Warm beige (residential)   → #b4afa5 (≈ "terracotta/sandstone" in Arnis)
function buildingColorExpr(): unknown[] {
  return [
    "case",
    ["==", ["get", "kind"], "temple"],
    "rgba(245, 158, 11, 0.98)",
    ["==", ["get", "kind"], "hospital"],
    "rgba(225, 29, 72, 0.92)",
    ["==", ["get", "kind"], "school"],
    "rgba(5, 150, 105, 0.92)",
    ["==", ["get", "kind"], "amenity"],
    "rgba(29, 41, 81, 0.95)",
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

function templeColorExpr(): unknown[] {
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
  const g = w.geometry as unknown;
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
  busRoutes?: BusRoute[];
  walls?: WallFeature[];
  waterways?: Waterway[];
}

export default function CNXMap({
  flights,
  heritage = [],
  airStations = [],
  fireHotspots = [],
  floodGauges = [],
  busRoutes = [],
  walls = [],
  waterways = [],
}: MapProps) {
  const [basemap, setBasemap] = useState<BasemapId>("street");
  const [buildingsOn, setBuildingsOn] = useState(true);
  const [templesOn, setTemplesOn] = useState(true);
  const [wallsOn, setWallsOn] = useState(true);
  const [waterwaysOn, setWaterwaysOn] = useState(true);
  const [busesOn, setBusesOn] = useState(true);
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
    pitch: 55,
    bearing: -15,
  });

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

  // Expose the live MapLibre handle to the dev console for debugging.
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as unknown as { __cnxMap?: MaplibreMap }).__cnxMap = mlMapRef.current ?? undefined;
  });

  const style = useMemo(() => basemapStyle(basemap), [basemap]);

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

    return [
      ...flightLayers,
      heritageLayer,
      airLayer,
      fireLayer,
      floodLayer,
      ...(wallLayer ? [wallLayer] : []),
      ...(waterwayLayer ? [waterwayLayer] : []),
      ...(gridLayer ? [gridLayer] : []),
    ];
  }, [flights, heritage, airStations, fireHotspots, floodGauges, wallLayer, waterwayLayer, gridLayer]);

  // Bus routes — drawn as deck.gl PathLayer above the basemap. Toggle
  // off hides them so the operator can declutter when the rivers / walls /
  // 3D city already cover the corridor.
  const busLayers = useMemo(() => {
    if (!busRoutes.length || !busesOn) return [];
    return busRoutes.map((r) =>
      new PathLayer<BusRoute>({
        id: `bus-${r.id}`,
        data: [r],
        getPath: (d) => d.geometry,
        getColor: () => {
          // Convert #rrggbb (Lanna blue default) to RGB; fall back on parse failure.
          const m = /^#([0-9a-fA-F]{6})$/.exec(r.colour.trim());
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
    );
  }, [busRoutes, busesOn]);

  // Install the 3D layers — buildings (core + wide), temples.
  // Core replaces wide above zoom 13; wide covers the urban fringe
  // below. Temples render on top with bright saffron / gold.
  useEffect(() => {
    const map = mlMapRef.current;
    if (!map) return;
    let cancelled = false;

    const setup = async () => {
      try {
        if (!map.isStyleLoaded()) {
          await new Promise<void>((resolve) => {
            map.once("idle", () => resolve());
          });
        }
        if (cancelled) return;

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
              "fill-extrusion-color": buildingColorExpr() as never,
              "fill-extrusion-height": ["get", "height"] as never,
              "fill-extrusion-base": ["get", "base_height"] as never,
              "fill-extrusion-opacity": 0.85,
              "fill-extrusion-vertical-gradient": false,
            },
          });
        }
        map.setLayoutProperty(BUILDINGS_CORE_LAYER, "visibility", buildingsOn ? "visible" : "none");

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
              "fill-extrusion-color": buildingColorExpr() as never,
              "fill-extrusion-height": ["get", "height"] as never,
              "fill-extrusion-base": ["get", "base_height"] as never,
              "fill-extrusion-opacity": 0.7,
              "fill-extrusion-vertical-gradient": false,
            },
          });
        }
        map.setLayoutProperty(BUILDINGS_WIDE_LAYER, "visibility", buildingsOn ? "visible" : "none");

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
              "fill-extrusion-color": templeColorExpr() as never,
              "fill-extrusion-height": ["get", "height"] as never,
              "fill-extrusion-base": ["get", "base_height"] as never,
              "fill-extrusion-opacity": 0.95,
              "fill-extrusion-vertical-gradient": false,
            },
          });
        }
        map.setLayoutProperty(TEMPLES_LAYER, "visibility", templesOn ? "visible" : "none");

        // Interactive building inspection (Atlas / atlas.nonarkara.org pattern)
        const onLayerClick = (e: any) => {
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

        [BUILDINGS_CORE_LAYER, BUILDINGS_WIDE_LAYER, TEMPLES_LAYER].forEach((lid) => {
          map.off("click", lid, onLayerClick);
          map.off("mouseenter", lid, onMouseEnter);
          map.off("mouseleave", lid, onMouseLeave);
          map.on("click", lid, onLayerClick);
          map.on("mouseenter", lid, onMouseEnter);
          map.on("mouseleave", lid, onMouseLeave);
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
    };
  }, [basemap, buildingsOn, templesOn]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <DeckGL
        viewState={viewState}
        controller={true}
        onViewStateChange={(e) => {
          const vs = (e as unknown as { viewState?: Partial<MapViewState> }).viewState;
          if (vs) setViewState((prev) => ({ ...prev, ...vs }));
        }}
        layers={[...layers, ...busLayers]}
      >
        <Map
          reuseMaps
          mapStyle={style}
          attributionControl={false}
          onLoad={(e) => {
            mlMapRef.current = e.target as unknown as MaplibreMap;
          }}
        />
      </DeckGL>

      {/* Basemap toggle, bottom-right */}
      <div className="absolute bottom-2 right-2 z-10 flex gap-1 bg-white/95 px-1.5 py-1">
        {BASEMAP_OPTIONS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBasemap(b.id)}
            aria-pressed={basemap === b.id}
            className={`border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${
              basemap === b.id
                ? "border-[#1d2951] text-[#1d2951]"
                : "border-[#d8d2c4] text-[#6b6b6b]"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* 3D layer toggles, top-left */}
      <div className="absolute left-2 top-2 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={handleToggle3D}
          aria-pressed={buildingsOn}
          className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] shadow-sm transition-all ${
            buildingsOn
              ? "border-[#1d2951] bg-[#1d2951] text-white"
              : "border-[#d8d2c4] bg-white/95 text-[#6b6b6b] hover:border-[#1d2951]"
          }`}
        >
          {buildingsOn ? "3D City: ON" : "3D City: 2D"}
        </button>
        <button
          type="button"
          onClick={() => setTemplesOn((v) => !v)}
          aria-pressed={templesOn}
          className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
            templesOn
              ? "border-[#b8860b] bg-[#b8860b] text-white"
              : "border-[#d8d2c4] bg-white/95 text-[#6b6b6b]"
          }`}
        >
          {templesOn ? `Temples: gold` : "Temples: off"}
        </button>
        <button
          type="button"
          onClick={() => setWallsOn((v) => !v)}
          aria-pressed={wallsOn}
          className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
            wallsOn
              ? "border-[#1d2951] bg-[#1d2951] text-white"
              : "border-[#d8d2c4] bg-white/95 text-[#6b6b6b]"
          }`}
        >
          {wallsOn ? "Walls: on" : "Walls: off"}
        </button>
        <button
          type="button"
          onClick={() => setWaterwaysOn((v) => !v)}
          aria-pressed={waterwaysOn}
          className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
            waterwaysOn
              ? "border-[#1d4ed8] bg-[#1d4ed8] text-white"
              : "border-[#d8d2c4] bg-white/95 text-[#6b6b6b]"
          }`}
        >
          {waterwaysOn ? "Rivers: on" : "Rivers: off"}
        </button>
        <button
          type="button"
          onClick={() => setBusesOn((v) => !v)}
          aria-pressed={busesOn}
          className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
            busesOn
              ? "border-[#b8860b] bg-[#b8860b] text-white"
              : "border-[#d8d2c4] bg-white/95 text-[#6b6b6b]"
          }`}
        >
          {busesOn ? `Buses: on` : "Buses: off"}
        </button>
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
              className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
                on ? "border-[#6b6b6b] bg-[#6b6b6b] text-white" : "border-[#d8d2c4] bg-white/95 text-[#6b6b6b]"
              }`}
            >
              {km} km
            </button>
          );
        })}
      </div>

      {/* Flight count badge, top-right */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 bg-white/95 px-2 py-1">
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#b8860b]"
        />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1d2951]">
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