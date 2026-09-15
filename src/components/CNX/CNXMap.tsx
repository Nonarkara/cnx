// @ts-nocheck
"use client";

// CNX map — MapLibre basemap + deck.gl flight overlay +
// MapLibre fill-extrusion buildings layer.
//
// Buildings come from public/data/cnx/buildings.geojson, produced
// by scripts/fetch-cnx-buildings.mjs from OSM Overpass. Every feature
// has height + base_height (from the OSM tags, or `building:levels *
// 3 m`, or a 9 m fallback). Empty attribute boxes (population,
// electricity_kw, water_m3_day, address_th, land_use,
// last_inspected) sit alongside the OSM tags so the operator can fill
// them later via a CMS or admin panel.
//
// The buildings layer is added imperatively (addSource / addLayer)
// rather than baked into the basemap style, so any basemap can
// carry the extrusions and the toggle can hide the layer without
// remounting MapLibre. The buildings file is 26 MB — first load is
// heavy; the toggle is off by default for that reason.

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MapViewState } from "@deck.gl/core";
import { IconLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { BusRoute } from "../../types/cnx";
import "maplibre-gl/dist/maplibre-gl.css";
import type maplibregl from "maplibre-gl";

import { basemapStyle, BASEMAP_OPTIONS, type BasemapId } from "../../services/basemap-styles";
import type { FlightState } from "../../lib/cnx/opensky";
import type { CnxHeritageSite, AirStation, FireHotspot, CnxFloodGauge } from "../../types/cnx";

const DeckGL = dynamic(() => import("@deck.gl/react").then((m) => m.default), {
  ssr: false,
});
const Map = dynamic(() => import("react-map-gl/maplibre").then((m) => m.default), {
  ssr: false,
});

const CNX_CENTER: [number, number] = [98.9853, 18.7883]; // Chiang Mai
const CITY_ZOOM = 13; // closer than Lopburi's 11 — buildings are the story
const BUILDINGS_SOURCE_ID = "cnx-buildings";
const BUILDINGS_LAYER_ID = "cnx-buildings-fill";

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
    getColor: (d) => {
      const alt = d.baroAltitude;
      if (alt === null) return [120, 130, 165, 200];
      if (alt >= 10_000) return [29, 41, 81, 230];
      if (alt >= 6_000) return [102, 136, 194, 220];
      return [200, 190, 150, 200];
    },
    getSize: (d) => {
      const alt = d.baroAltitude;
      if (alt === null) return 7;
      if (alt >= 10_000) return 11;
      if (alt >= 6_000) return 9;
      return 7;
    },
    getAngle: (d) => d.trueTrack ?? 0,
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

interface MapProps {
  flights: FlightState[];
  heritage?: CnxHeritageSite[];
  airStations?: AirStation[];
  fireHotspots?: FireHotspot[];
  floodGauges?: CnxFloodGauge[];
  busRoutes?: BusRoute[];
}

export default function CNXMap({
  flights,
  heritage = [],
  airStations = [],
  fireHotspots = [],
  floodGauges = [],
  busRoutes = [],
}: MapProps) {
  const [basemap, setBasemap] = useState<BasemapId>("street");
  const [buildingsOn, setBuildingsOn] = useState(false);
  const [viewState, setViewState] = useState<MapViewState>({
    longitude: CNX_CENTER[0],
    latitude: CNX_CENTER[1],
    zoom: CITY_ZOOM,
    pitch: 0,
    bearing: 0,
  });
  const mlMapRef = useRef<maplibregl.Map | null>(null);

  // Expose the live MapLibre handle to the dev console for debugging.
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as unknown as { __cnxMap?: maplibregl.Map }).__cnxMap = mlMapRef.current ?? undefined;
  });

  const style = useMemo(() => basemapStyle(basemap), [basemap]);
  const layers = useMemo(() => {
    const flightLayers = buildFlightLayers(flights);

    // Heritage sites — Doi Suthep gold halos
    const heritageLayer = new ScatterplotLayer<CnxHeritageSite>({
      id: "cnx-heritage",
      data: heritage,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: (d) => (d.category === "natural" ? 1500 : 700),
      radiusUnits: "meters",
      getFillColor: (d) =>
        d.category === "natural"
        ? [21, 128, 61, 60]
        : d.category === "city-wall"
        ? [184, 134, 11, 70]
        : [184, 134, 11, 90],
      getLineColor: () => [184, 134, 11, 220],
      lineWidthMinPixels: 1.5,
      stroked: true,
      pickable: true,
    });

    // Air quality stations — colour ramp by AQI level
    const airLayer = new ScatterplotLayer<AirStation>({
      id: "cnx-air",
      data: airStations,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 900,
      radiusUnits: "meters",
      getFillColor: (d) => {
        switch (d.aqiLevel) {
          case "critical":
            return [239, 68, 68, 110];
          case "alert":
            return [251, 146, 60, 110];
          case "watch":
            return [245, 158, 11, 110];
          default:
            return [34, 197, 94, 90];
        }
      },
      getLineColor: () => [255, 255, 255, 220],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
    });

    // Fire hotspots — FIRMS bright dots
    const fireLayer = new ScatterplotLayer<FireHotspot>({
      id: "cnx-fires",
      data: fireHotspots,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 600,
      radiusUnits: "meters",
      getFillColor: (d) =>
        d.severity === "critical"
        ? [255, 60, 30, 200]
        : d.severity === "alert"
        ? [255, 140, 0, 180]
        : [255, 200, 0, 150],
      getLineColor: () => [255, 220, 0, 220],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
    });

    // Flood gauges — Ping basin
    const floodLayer = new ScatterplotLayer<CnxFloodGauge>({
      id: "cnx-flood",
      data: floodGauges,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 600,
      radiusUnits: "meters",
      getFillColor: (d) =>
        d.severity === "critical"
        ? [239, 68, 68, 160]
        : d.severity === "alert"
        ? [251, 146, 60, 160]
        : d.severity === "watch"
        ? [245, 158, 11, 140]
        : [29, 78, 216, 130],
      getLineColor: () => [255, 255, 255, 230],
      lineWidthMinPixels: 1.5,
      stroked: true,
      pickable: true,
    });

    return [flightLayers[0], flightLayers[1], heritageLayer, airLayer, fireLayer, floodLayer];
  }, [flights, heritage, airStations, fireHotspots, floodGauges]);

  // Bus routes — drawn as deck.gl PathLayer above the basemap.
  const busLayers = useMemo(() => {
    if (!busRoutes.length) return [];
    return busRoutes.map((r) =>
      new PathLayer<BusRoute>({
        id: `bus-${r.id}`,
        data: [r],
        getPath: (d) => d.geometry as [number, number][],
        getColor: () => {
          // Convert #1d2951 (Lanna blue) to RGB
          if (r.colour.startsWith("#")) {
            const hex = r.colour.slice(1);
            const r2 = parseInt(hex.slice(0, 2), 16);
            const g2 = parseInt(hex.slice(2, 4), 16);
            const b2 = parseInt(hex.slice(4, 6), 16);
            return [r2, g2, b2, 200];
          }
          return [29, 41, 81, 200];
        },
        getWidth: 3,
        widthUnits: "pixels",
        pickable: true,
      }),
    );
  }, [busRoutes]);

  // Install (or remove) the buildings fill-extrusion layer. We add
  // it imperatively so the toggle survives basemap changes — every
  // basemap reload re-runs this effect and we re-attach the layer
  // on top of whichever style is current.
  useEffect(() => {
    const map = mlMapRef.current;
    if (!map) return;
    let cancelled = false;

    const setup = async () => {
      try {
        if (!map.isStyleLoaded()) {
          await new Promise<void>((resolve) => map.once("idle", () => resolve()));
        }
        if (cancelled) return;
        if (!map.getSource(BUILDINGS_SOURCE_ID)) {
          // promoteId keeps the OSM id on the feature so a future
          // admin tool can write attributes back by id.
          map.addSource(BUILDINGS_SOURCE_ID, {
            type: "geojson",
            data: "/data/cnx/buildings.geojson",
            promoteId: "id",
          });
        }
        if (!map.getLayer(BUILDINGS_LAYER_ID)) {
          // Lanna blue body, with a subtle Doi Suthep gold tint on
          // taller buildings via `interpolate`. Tall = commercial /
          // temple / civic, shorter = residential. Same hue family as
          // the chrome — no new colour introduced.
          map.addLayer({
            id: BUILDINGS_LAYER_ID,
            type: "fill-extrusion",
            source: BUILDINGS_SOURCE_ID,
            minzoom: 13,
            paint: {
              "fill-extrusion-color": [
                "interpolate",
                ["linear"],
                ["get", "height"],
                3, "rgba(180, 175, 165, 0.78)",     // short → warm beige (residential)
                12, "rgba(102, 136, 194, 0.86)",   // mid → Lanna blue lighter
                25, "rgba(29, 41, 81, 0.92)",      // tall → Lanna blue
                40, "rgba(184, 134, 11, 0.92)",    // temple / civic → Doi Suthep gold
              ],
              "fill-extrusion-height": ["get", "height"],
              "fill-extrusion-base": ["get", "base_height"],
              "fill-extrusion-opacity": 0.85,
            },
          });
        }
        map.setLayoutProperty(
          BUILDINGS_LAYER_ID,
          "visibility",
          buildingsOn ? "visible" : "none",
        );
      } catch (e) {
        // Most commonly: the basemap style has no compatible layer slot,
        // or the buildings file isn't yet on disk. Silent — the toggle
        // just doesn't appear.
        console.warn(`[buildings] setup failed: ${(e as Error).message}`);
      }
    };
    void setup();
    return () => {
      cancelled = true;
    };
  }, [basemap, buildingsOn]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <DeckGL
        viewState={viewState}
        controller={true}
        onViewStateChange={(e) => setViewState((prev) => ({ ...prev, ...(e.viewState as Partial<MapViewState>) }))}
        layers={[...layers, ...busLayers]}
      >
        <Map
          reuseMaps
          mapStyle={style}
          attributionControl={false}
          onLoad={(e) => {
            mlMapRef.current = e.target as unknown as maplibregl.Map;
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

      {/* Buildings + flights toggles, top-left under the badge area */}
      <div className="absolute left-2 top-2 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setBuildingsOn((v) => !v)}
          aria-pressed={buildingsOn}
          className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
            buildingsOn
              ? "border-[#1d2951] bg-[#1d2951] text-white"
              : "border-[#d8d2c4] bg-white/95 text-[#6b6b6b]"
          }`}
        >
          {buildingsOn ? "Buildings: 3D" : "Buildings: 2D"}
        </button>
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
    </div>
  );
}
