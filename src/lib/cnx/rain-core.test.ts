import { describe, expect, it } from "vitest";
import { compactRainRow, rainBand, summariseRain, type RainRow } from "./rain-core";

const raw = (over: Record<string, unknown> = {}) => ({
  id: 313237813,
  rain_24h: 94.5,
  rainfall_datetime: "2026-10-05 11:00",
  agency: { agency_shortname: { en: "DWR" } },
  geocode: { province_code: "50", amphoe_name: { th: "จอมทอง", en: "Chom Thong District" }, tumbon_name: { th: "ดอยแก้ว" } },
  station: { tele_station_name: { th: "บ้านห้วยส้มป่อย" }, tele_station_lat: 18.375283, tele_station_long: 98.533801 },
  ...over,
});

const NOW = Date.parse("2026-10-05T06:00:00Z"); // 13:00 Bangkok

describe("rainBand — TMD 24-hour classes", () => {
  it.each([
    [0, "none"],
    [0.1, "light"],
    [10, "light"],
    [10.1, "moderate"],
    [35, "moderate"],
    [35.1, "heavy"],
    [90, "heavy"],
    [90.1, "very-heavy"],
  ])("%s mm → %s", (mm, band) => {
    expect(rainBand(mm)).toBe(band);
  });
});

describe("compactRainRow", () => {
  it("keeps a Chiang Mai reading with its place and agency", () => {
    expect(compactRainRow(raw())).toMatchObject({ rain24h: 94.5, amphoeEn: "Chom Thong", tambonTh: "ดอยแก้ว", agency: "DWR", at: "2026-10-05 11:00" });
  });

  it("drops other provinces, faulty values and missing coordinates", () => {
    expect(compactRainRow(raw({ geocode: { province_code: "51" } }))).toBeNull();
    expect(compactRainRow(raw({ rain_24h: -1 }))).toBeNull();
    expect(compactRainRow(raw({ rain_24h: 999 }))).toBeNull();
    expect(compactRainRow(raw({ station: { tele_station_lat: null, tele_station_long: 98.5 } }))).toBeNull();
  });
});

describe("summariseRain", () => {
  const rows = [
    compactRainRow(raw())!,
    compactRainRow(raw({ id: 2, rain_24h: 40, geocode: { province_code: "50", amphoe_name: { th: "แม่ริม", en: "Mae Rim District" }, tumbon_name: { th: "แม่แรม" } } }))!,
    compactRainRow(raw({ id: 3, rain_24h: 5 }))!,
  ];

  it("bands current readings and lists districts with heavy rain, wettest first", () => {
    const s = summariseRain(rows, NOW);
    expect(s.bands).toMatchObject({ "very-heavy": 1, heavy: 1, light: 1 });
    expect(s.wettest?.rain24h).toBe(94.5);
    expect(s.districts.map((d) => [d.en, d.max, d.band])).toEqual([
      ["Chom Thong", 94.5, "very-heavy"],
      ["Mae Rim", 40, "heavy"],
    ]);
  });

  it("drops readings too old to describe the last 24 hours now", () => {
    const old: RainRow = { ...rows[0], at: "2026-10-04 23:00" }; // 14 h before NOW
    expect(summariseRain([old], NOW).stations).toEqual([]);
  });
});
