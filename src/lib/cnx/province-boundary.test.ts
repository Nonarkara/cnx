import { describe, expect, it } from "vitest";
import { inChiangMaiProvince } from "./province-boundary";

describe("inChiangMaiProvince", () => {
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
