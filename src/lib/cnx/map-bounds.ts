// Keeps the map on Chiang Mai. The camera centre may move at most
// MAX_OFFSET_KM from the city in any direction, and zooming out stops at
// MIN_ZOOM (~260 km across on a desktop map) — before, the operator could
// zoom out to the whole globe. deck.gl owns the view state, so MapLibre's
// own maxBounds would not apply; this clamps each view change instead.

export const MAP_CENTER = { longitude: 98.985, latitude: 18.788 };
export const MAX_OFFSET_KM = 100;
export const MIN_ZOOM = 9.3;
export const MAX_ZOOM = 18;

const KM_PER_DEG_LAT = 111.32;
const DLAT = MAX_OFFSET_KM / KM_PER_DEG_LAT;
const DLON = MAX_OFFSET_KM / (KM_PER_DEG_LAT * Math.cos((MAP_CENTER.latitude * Math.PI) / 180));

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface ClampableView {
  longitude: number;
  latitude: number;
  zoom: number;
}

export function clampView<T extends Partial<ClampableView>>(view: T): T {
  return {
    ...view,
    ...(typeof view.longitude === "number" ? { longitude: clamp(view.longitude, MAP_CENTER.longitude - DLON, MAP_CENTER.longitude + DLON) } : {}),
    ...(typeof view.latitude === "number" ? { latitude: clamp(view.latitude, MAP_CENTER.latitude - DLAT, MAP_CENTER.latitude + DLAT) } : {}),
    ...(typeof view.zoom === "number" ? { zoom: clamp(view.zoom, MIN_ZOOM, MAX_ZOOM) } : {}),
  };
}
