import { describe, expect, it } from "vitest";
import { buildOutlook, outlookWatchItems, rainActionTh } from "./outlook";
import type { ForecastFieldResponse } from "./wind-field";
import type { DistrictOutlook } from "./wind-field-core";
import type { Shelter } from "./shelters";

const d = (nameTh: string, nameEn: string, over: Partial<DistrictOutlook> = {}): DistrictOutlook => ({
  nameTh, nameEn, rain6h: 0, rain24h: 0, rain48h: 0, peakRainMmH: 0, peakRainAt: null, pm25Peak: 10, pm25PeakAt: 1_791_700_000, ...over,
});

const forecast = (outlook: DistrictOutlook[], pm25 = true): ForecastFieldResponse => ({
  generatedAt: "2026-10-11T04:00:00Z",
  fetchedAt: "2026-10-11T03:40:00Z",
  provenance: "model",
  source: "test",
  note: "",
  field: { grid: { lon0: 98, lat0: 18, d: 1, nx: 2, ny: 2 }, times: [1], u10: [], v10: [], u850: [], v850: [], precip: [], pm25: pm25 ? [] : null },
  outlook,
});

const shelter = (id: string, amphoeTh: string, capacity: number): Shelter => ({
  id, nameTh: `ศูนย์ ${id}`, amphoeTh, tambonTh: null, capacity, electricity: true, water: true, toilets: 4, lat: 18.5, lon: 98.4, precision: "place", matchedName: null, osm: null,
});

describe("buildOutlook", () => {
  it("is unavailable — never calm — when the model did not answer", () => {
    const o = buildOutlook({ ...forecast([]), field: null, provenance: "unavailable" }, [], null);
    expect(o.available).toBe(false);
    const [rain, air] = outlookWatchItems(o);
    expect(rain.level).toBe("unknown");
    expect(air.level).toBe("unknown");
  });

  it("raises TMD heavy (watch) and very heavy (alert) forecast rain, worst first, with the district's shelters", () => {
    const o = buildOutlook(
      forecast([d("แม่ริม", "Mae Rim", { rain24h: 40 }), d("แม่แจ่ม", "Mae Chaem", { rain24h: 95, peakRainAt: 1_791_720_000 }), d("สารภี", "Saraphi", { rain24h: 12 })]),
      [shelter("a", "แม่แจ่ม", 300), shelter("b", "แม่แจ่ม", 800), shelter("c", "ฝาง", 500)],
      null,
    );
    expect(o.rain.map((r) => [r.district.nameEn, r.level])).toEqual([["Mae Chaem", "alert"], ["Mae Rim", "watch"]]);
    expect(o.rain[0].shelters.map((s) => s.id)).toEqual(["b", "a"]);
    expect(o.rain[0].shelterCapacity).toBe(1100);
    expect(rainActionTh(o.rain[0])).toContain("ศูนย์ b");
    expect(outlookWatchItems(o)[0].level).toBe("alert");
  });

  it("says so honestly when a warned district has no listed shelter", () => {
    const o = buildOutlook(forecast([d("สะเมิง", "Samoeng", { rain24h: 50 })]), [], null);
    expect(rainActionTh(o.rain[0])).toContain("ไม่มีศูนย์พักพิงในรายชื่อ");
  });

  it("shows measured rain beside the forecast without adding them", () => {
    const o = buildOutlook(forecast([d("จอมทอง", "Chom Thong", { rain24h: 36 })]), [], {
      generatedAt: "", stations: [], bands: { none: 0, light: 0, moderate: 0, heavy: 0, "very-heavy": 1 }, wettest: null, maxAgeHours: 6,
      districts: [{ th: "จอมทอง", en: "Chom Thong", max: 94.5, band: "very-heavy", stations: 1 }],
    });
    expect(o.rain[0].measured24h).toBe(94.5);
    expect(o.rain[0].level).toBe("watch");
  });

  it("ranks PM2.5 peaks on the board's levels and keeps 'no warning' from reading as clean", () => {
    const o = buildOutlook(forecast([d("ฝาง", "Fang", { pm25Peak: 92 }), d("ฮอด", "Hot", { pm25Peak: 30 }), d("สารภี", "Saraphi", { pm25Peak: 12 })]), [], null);
    expect(o.air.map((a) => [a.district.nameEn, a.level])).toEqual([["Fang", "critical"], ["Hot", "watch"]]);
    const calm = outlookWatchItems(buildOutlook(forecast([d("สารภี", "Saraphi", { pm25Peak: 12 })]), [], null))[1];
    expect(calm.level).toBe("good");
    expect(calm.evidenceTh).toMatch(/ต่ำไป/);
    expect(outlookWatchItems(buildOutlook(forecast([d("สารภี", "Saraphi")], false), [], null))[1].level).toBe("unknown");
  });
});
