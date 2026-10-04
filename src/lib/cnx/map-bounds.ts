// Keeps the map on Chiang Mai. The camera centre may move at most
// MAX_OFFSET_KM from the city in any direction (a circle), and zooming out stops at
// MIN_ZOOM (~260 km across on a desktop map) — before, the operator could
// zoom out to the whole globe. deck.gl owns the view state, so MapLibre's
// own maxBounds would not apply; this clamps each view change instead.

export const MAP_CENTER = { longitude: 98.985, latitude: 18.788 };
export const MAX_OFFSET_KM = 100;
export const MIN_ZOOM = 9.3;
export const MAX_ZOOM = 18;

const KM_PER_DEG_LAT = 111.32;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface ClampableView {
  longitude: number;
  latitude: number;
  zoom: number;
}

export function clampView<T extends Partial<ClampableView>>(view: T): T {
  const out: T = { ...view };
  if (typeof view.longitude === "number" && typeof view.latitude === "number") {
    // A circle, not a box: a rectangular clamp let the corners reach
    // ~141 km (100·√2). Offsets are measured in km on a local flat
    // projection, which is accurate to well under 1% at 100 km.
    const kmPerDegLon = KM_PER_DEG_LAT * Math.cos((MAP_CENTER.latitude * Math.PI) / 180);
    const x = (view.longitude - MAP_CENTER.longitude) * kmPerDegLon;
    const y = (view.latitude - MAP_CENTER.latitude) * KM_PER_DEG_LAT;
    const r = Math.hypot(x, y);
    if (r > MAX_OFFSET_KM) {
      const k = MAX_OFFSET_KM / r;
      out.longitude = MAP_CENTER.longitude + (x * k) / kmPerDegLon;
      out.latitude = MAP_CENTER.latitude + (y * k) / KM_PER_DEG_LAT;
    }
  }
  if (typeof view.zoom === "number") out.zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM);
  return out;
}
