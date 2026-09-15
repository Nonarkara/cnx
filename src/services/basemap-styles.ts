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

interface MaplibreRasterStyle {
  version: 8;
  sources: Record<
    string,
    {
      type: "raster";
      tiles: string[];
      tileSize: number;
      attribution: string;
      maxzoom?: number;
    }
  >;
  layers: { id: string; type: "raster"; source: string }[];
}

function singleRaster(
  _id: string,
  tiles: string[],
  attribution: string,
  options: { tileSize?: number; maxzoom?: number } = {},
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
    },
    layers: [{ id: "raster-base", type: "raster", source: "raster" }],
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
        { tileSize: 256, maxzoom: 19 },
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
