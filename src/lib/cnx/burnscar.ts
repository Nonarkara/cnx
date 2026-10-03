// HII "Tamroypao" (ตามรอยเผา) burn-scar tiles for the upper north — 20 m
// Sentinel-2-derived burned area, season-wide (Dec 2025 – Apr 2026), split
// into farmland (B3A) and forest (B3F). Published as a public TMS "for QGIS"
// at tamroypao.hii.or.th, but without CORS headers, so the map loads them
// through /api/cnx/burnscar. Only these two layers can be proxied.

const BASE = "https://tamroypao.hii.or.th/tms";

export const BURNSCAR_LAYERS = {
  agri: "2025/BURNSCAR_NORTH_20M_202512_202604_B3A_COLOR",
  forest: "2025/BURNSCAR_NORTH_20M_202512_202604_B3F_COLOR",
} as const;

export type BurnscarLayer = keyof typeof BURNSCAR_LAYERS;

/** Tile levels HII serves (directory listing, 2026-10-03). */
export const BURNSCAR_MIN_ZOOM = 6;
export const BURNSCAR_MAX_ZOOM = 15;

export const BURNSCAR_ATTRIBUTION = "Burn scars © HII ตามรอยเผา (tamroypao.hii.or.th), season Dec 2025 – Apr 2026";

/** Upstream URL for an XYZ tile request, or null if the request is not a
 *  valid tile of an allowed layer. TMS counts rows from the south, so the
 *  XYZ y is flipped. */
export function burnscarUpstream(layer: string | null, z: string | null, x: string | null, y: string | null): string | null {
  if (layer !== "agri" && layer !== "forest") return null;
  const [zi, xi, yi] = [z, x, y].map((v) => (v !== null && /^\d{1,6}$/.test(v) ? Number(v) : NaN));
  if (![zi, xi, yi].every(Number.isInteger)) return null;
  if (zi < BURNSCAR_MIN_ZOOM || zi > BURNSCAR_MAX_ZOOM) return null;
  const n = 2 ** zi;
  if (xi >= n || yi >= n) return null;
  return `${BASE}/${BURNSCAR_LAYERS[layer]}/${zi}/${xi}/${n - 1 - yi}.png`;
}
