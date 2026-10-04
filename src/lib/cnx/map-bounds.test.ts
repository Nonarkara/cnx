import { describe, expect, it } from "vitest";
import { MAP_CENTER, MIN_ZOOM, clampView } from "./map-bounds";

const km = (a: { latitude: number; longitude: number }) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const x =
    Math.sin(r(a.latitude - MAP_CENTER.latitude) / 2) ** 2 +
    Math.cos(r(MAP_CENTER.latitude)) * Math.cos(r(a.latitude)) * Math.sin(r(a.longitude - MAP_CENTER.longitude) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
};

describe("clampView", () => {
  it("leaves views over Chiang Mai alone", () => {
    const v = { longitude: 98.99, latitude: 18.8, zoom: 12, pitch: 40 };
    expect(clampView(v)).toEqual(v);
  });

  it("stops the centre about 100 km out in each direction", () => {
    const north = clampView({ longitude: MAP_CENTER.longitude, latitude: 25, zoom: 12 });
    expect(km(north)).toBeCloseTo(100, 0);
    const east = clampView({ longitude: 110, latitude: MAP_CENTER.latitude, zoom: 12 });
    expect(km(east)).toBeCloseTo(100, 0);
  });

  it("will not zoom out to the whole world", () => {
    expect(clampView({ longitude: 98.99, latitude: 18.8, zoom: 2 }).zoom).toBe(MIN_ZOOM);
  });

  it("passes partial updates through", () => {
    const partial: { pitch: number; zoom?: number } = { pitch: 30 };
    expect(clampView(partial)).toEqual({ pitch: 30 });
  });
});
