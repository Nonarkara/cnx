/**
 * Local metric helpers.
 *
 * These live on their own because both the temple grammar and the roof
 * grammar need them, and a grammar must not import another grammar.
 */

/** Metres per degree of latitude. */
export const EARTH_LAT_M = 110574;

/** Metres per degree of longitude at the equator. */
export const EARTH_LON_M = 111320;

/**
 * Metres per degree of longitude at a given latitude.
 *
 * Longitude degrees shrink towards the poles; at Chiang Mai's latitude
 * a degree of longitude is about 105.5 km, not 111.3.
 */
export function metresPerDegreeLon(latitude: number): number {
  return EARTH_LON_M * Math.cos((latitude * Math.PI) / 180);
}
