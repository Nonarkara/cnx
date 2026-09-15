"use client";

// CNX map — MapLibre basemap + deck.gl overlay for the flight icons.
//
// The basemap is OpenFreeMap vector tiles (same keyless provider that
// powers Lopburi's street view). The deck.gl layer on top draws each
// plane at its current lat/lon, rotated to its true_track heading, and
// coloured by altitude bucket. A second PathLayer draws a 60-second
// bearing tail in Doi Suthep gold so the operator can read direction
// at a glance without watching the icons animate.

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MapViewState } from "@deck.gl/core";
import { IconLayer, PathLayer } from "@deck.gl/layers";
import "maplibre-gl/dist/maplibre-gl.css";
import type maplibregl from "maplibre-gl";

import { basemapStyle, BASEMAP_OPTIONS, type BasemapId } from "../../services/basemap-styles";
import type { FlightState } from "../../lib/cnx/opensky";

const DeckGL = dynamic(() => import("@deck.gl/react").then((m) => m.default), {
  ssr: false,
});
const Map = dynamic(() => import("react-map-gl/maplibre").then((m) => m.default), {
  ssr: false,
});

const CNX_CENTER: [number, number] = [98.9853, 18.7883]; // Chiang Mai
const CITY_ZOOM = 11;

function buildFlightLayers(flights: FlightState[]) {
  // Bearing tail — where each plane was ~60 s ago, computed from the
  // current position, heading, and speed. The tail is a thin 2-vertex
  // polyline so it costs almost nothing to draw.
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
      // Heavy / wide = Lanna blue, narrow = lighter blue, regional
      // = muted. The size proxy is altitude: > 10 000 m baro is
      // almost always widebody or heavier; < 6 000 m is regional.
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
}

export default function CNXMap({ flights }: MapProps) {
  const [basemap, setBasemap] = useState<BasemapId>("street");
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
  const layers = useMemo(() => buildFlightLayers(flights), [flights]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <DeckGL
        viewState={viewState}
        controller={true}
        onViewStateChange={(e) => setViewState((prev) => ({ ...prev, ...(e.viewState as Partial<MapViewState>) }))}
        layers={layers}
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
