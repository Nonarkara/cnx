// MapLibre style URLs — same provider mix as Lopburi, scoped to the
// Chiang Mai bbox so we don't request tiles for Lopburi's geography
// by accident.

export type BasemapId = "street" | "satellite" | "topography" | "vegetation";

export const BASEMAP_OPTIONS: { id: BasemapId; label: string }[] = [
  { id: "street", label: "Street" },
  { id: "satellite", label: "Satellite" },
  { id: "topography", label: "Topography" },
  { id: "vegetation", label: "Vegetation" },
];

interface RasterSource {
  type: "raster";
  tiles: string[];
  tileSize: number;
  attribution: string;
  maxzoom?: number;
}

interface RasterDemSource {
  type: "raster-dem";
  tiles: string[];
  tileSize: number;
  attribution: string;
  encoding: "terrarium";
  maxzoom?: number;
}

interface MaplibreRasterStyle {
  version: 8;
  sources: Record<string, RasterSource | RasterDemSource>;
  layers: { id: string; type: "raster" | "hillshade"; source: string; paint?: Record<string, unknown> }[];
  terrain?: { source: string; exaggeration?: number };
}

// AWS's public elevation-tiles-prod bucket — free, keyless, global
// coverage in the "Terrarium" PNG-encoded DEM format MapLibre reads
// natively via `encoding: "terrarium"`.
const TERRAIN_DEM_SOURCE: RasterDemSource = {
  type: "raster-dem",
  tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
  tileSize: 256,
  attribution: "Terrain: AWS Terrain Tiles (Terrarium), Mapzen",
  encoding: "terrarium",
  maxzoom: 15,
};

function singleRaster(
  _id: string,
  tiles: string[],
  attribution: string,
  options: { tileSize?: number; maxzoom?: number; terrain?: boolean } = {},
): MaplibreRasterStyle {
  return {
    version: 8,
    sources: {
      raster: {
        type: "raster",
        tiles,
        tileSize: options.tileSize ?? 256,
        attribution,
        maxzoom: options.maxzoom,
      },
      ...(options.terrain ? { "terrain-dem": TERRAIN_DEM_SOURCE } : {}),
    },
    layers: [
      { id: "raster-base", type: "raster", source: "raster" },
      // Subtle hillshade on top of the imagery — this is what makes
      // Doi Suthep / Doi Inthanon read as relief instead of a flat
      // photo, without needing a separate "mountains only" mask: flat
      // valley floor has ~0 slope, so the hillshade contributes
      // ~nothing there and the satellite photo shows through as-is.
      ...(options.terrain
        ? [{ id: "hillshade", type: "hillshade" as const, source: "terrain-dem", paint: { "hillshade-exaggeration": 0.5 } }]
        : []),
    ],
    ...(options.terrain ? { terrain: { source: "terrain-dem", exaggeration: 1.4 } } : {}),
  };
}

/** OpenFreeMap vector basemap — same provider as Lopburi's "street".
    Free, no key, renders Thai place names correctly. */
export const STREET_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export function basemapStyle(id: BasemapId): string | MaplibreRasterStyle {
  switch (id) {
    case "street":
      return STREET_STYLE;
    case "satellite":
      // Esri World Imagery — keyless, free for non-commercial use.
      return singleRaster(
        "satellite",
        [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        "Imagery © Esri, Maxar, Earthstar Geographics",
        { tileSize: 256, maxzoom: 19, terrain: true },
      );
    case "topography":
      // OpenTopoMap — community-maintained, free.
      return singleRaster(
        "topography",
        [
          "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
          "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
          "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
        ],
        "Map data © OpenStreetMap contributors, SRTM | OpenTopoMap",
        { tileSize: 256, maxzoom: 17 },
      );
    case "vegetation":
      // Esri World Imagery, then a hillshade overlay would go on top in
      // a richer build. For the first cut, vegetation == satellite.
      return singleRaster(
        "vegetation",
        [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        "Imagery © Esri, Maxar, Earthstar Geographics",
        { tileSize: 256, maxzoom: 19 },
      );
  }
}
