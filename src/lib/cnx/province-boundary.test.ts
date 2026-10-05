import { describe, expect, it } from "vitest";
import { inChiangMaiProvince } from "./province-boundary";
import { CNX_PROVINCE_RING } from "./province-boundary";
import { CNX_FIRMS_BBOX } from "./fires";

describe("inChiangMaiProvince", () => {
  it("queries the whole province, including the southern tip below 17.5N", () => {
    expect(CNX_FIRMS_BBOX.south).toBeLessThan(17.5);
    for (const [lon, lat] of CNX_PROVINCE_RING) {
      expect(lon >= CNX_FIRMS_BBOX.west && lon <= CNX_FIRMS_BBOX.east && lat >= CNX_FIRMS_BBOX.south && lat <= CNX_FIRMS_BBOX.north).toBe(true);
    }
  });
  it.each([
    ["Chiang Mai old city", 98.987, 18.788],
    ["Fang (far north)", 99.212, 19.918],
    ["Omkoi (far south)", 98.36, 17.79],
    ["Doi Inthanon", 98.486, 18.588],
  ])("includes %s", (_, lon, lat) => {
    expect(inChiangMaiProvince(lon, lat)).toBe(true);
  });

  it.each([
    ["Mae Hong Son town", 97.97, 19.3],
    ["Lamphun town", 99.01, 18.57],
    ["Chiang Rai town", 99.83, 19.91],
    ["Lampang town", 99.49, 18.29],
  ])("excludes %s", (_, lon, lat) => {
    expect(inChiangMaiProvince(lon, lat)).toBe(false);
  });
});
