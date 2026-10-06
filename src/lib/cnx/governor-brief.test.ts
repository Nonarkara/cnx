import { describe, expect, it } from "vitest";
import { buildTiles, canonicalDistrict, districtTable, lineText, pm25Band, thaiDate, type BriefInputs } from "./governor-brief";
import type { BurnSeasonDoc } from "./burn-season";
import type { DustboyStation } from "./dustboy";

const OFFICIAL = ["เมืองเชียงใหม่", "พร้าว", "หางดง", "แม่แจ่ม"];

describe("canonicalDistrict", () => {
  it("maps loose DustBoy names onto official district names", () => {
    expect(canonicalDistrict("เมือง", OFFICIAL)).toBe("เมืองเชียงใหม่");
    expect(canonicalDistrict("พร้้าว", OFFICIAL)).toBe("พร้าว"); // doubled tone mark
    expect(canonicalDistrict("หางดง", OFFICIAL)).toBe("หางดง");
    expect(canonicalDistrict("", OFFICIAL)).toBeNull();
    expect(canonicalDistrict("แม่สาย", OFFICIAL)).toBeNull(); // Chiang Rai
  });
});

const station = (district: string, pm25: number | null, over: Partial<DustboyStation> = {}): DustboyStation =>
  ({ stationId: district + pm25, nameTh: "", district, province: "เชียงใหม่", longitude: 99, latitude: 18.8, pm25, suspect: false, readingAgeHours: 0, severity: "good", observedAt: "2026-10-03T14:00:00Z", ...over }) as DustboyStation;

const burn = {
  districtsLatest: OFFICIAL.map((th, i) => ({ code: `TH50${i}`, th, en: th, farmRai: 10, forestRai: 90 * (i + 1), totalRai: 10 + 90 * (i + 1) })),
} as unknown as BurnSeasonDoc;

describe("districtTable", () => {
  it("averages ground sensors per district, worst air first, and skips suspect sensors", () => {
    const rows = districtTable(
      [station("เมือง", 10), station("เมืองเชียงใหม่", 20), station("พร้้าว", 29), station("พร้าว", 400, { suspect: true }), station("หางดง", null)],
      burn,
      new Date("2026-10-03T15:00:00Z"),
    );
    expect(rows[0]).toMatchObject({ th: "พร้าว", pm25: 29, sensors: 1 });
    expect(rows[1]).toMatchObject({ th: "เมืองเชียงใหม่", pm25: 15, sensors: 2 });
    // No reading: not invented, sorted after measured districts.
    expect(rows.slice(2).every((r) => r.pm25 === null)).toBe(true);
  });
  it("excludes stale district evidence and retains the oldest contributing observation", () => {
    const rows = districtTable([station("เมือง", 12), station("เมือง", 500, { observedAt: "2026-10-02T14:00:00Z" }), station("เมือง", 14, { observedAt: "2026-10-03T13:00:00Z" })], burn, new Date("2026-10-03T15:00:00Z"));
    expect(rows[0]).toMatchObject({ pm25: 13, sensors: 2, observedAt: "2026-10-03T13:00:00Z" });
  });

});

describe("pm25Band", () => {
  it("follows the Thai PCD PM2.5 bands", () => {
    expect(pm25Band(12).th).toBe("ดีมาก");
    expect(pm25Band(30).level).toBe("watch");
    expect(pm25Band(76).level).toBe("critical");
  });
});

const inputs = (over: Partial<BriefInputs> = {}): BriefInputs => ({
  now: new Date("2026-10-03T15:00:00Z"),
  airGround: { avg: 12, stations: 108, observedAt: "2026-10-03T14:00:00Z", source: "CMU DustBoy" },
  worstDistrict: null,
  fires: { live: true, count: 0, observedAt: "2026-10-03T15:00:00Z", source: "NASA VIIRS" },
  river: { th: "สถานี P.1 ต่ำกว่าตลิ่ง 2.49 ม.", en: "P.1 2.49 m below bank", level: "good", observedAt: "2026-10-03T14:00:00Z" },
  floodForecast: { outlook: "none-forecast", points: 12 },
  arrivals: { date: "2026-10-02", flights: 97, international: 30, estimatedVisitors: 12000 },
  ...over,
});

describe("buildTiles", () => {
  it("labels historical aviation and passenger estimates explicitly in Thai", () => {
    const tile = buildTiles(inputs()).find(t => t.key === "visitors")!;
    expect(tile.titleTh).toContain("ย้อนหลัง");
    expect(tile.th).toContain("อัตราบรรทุกสมมติ");
    expect(tile.th).toContain("ไม่ใช่ยอดผู้โดยสารจริงหรือจำนวนนักท่องเที่ยว");
    expect(tile.th).toContain("2 ต.ค. 2569");
  });
  it("uses the rain observation window without extending river freshness", () => {
    const now = new Date("2026-10-05T06:00:00Z");
    const water = { th: "ฝนหนัก 102 มม.", en: "Heavy measured rain", level: "alert" as const, observedAt: "2026-10-05T02:00:00Z" };
    expect(buildTiles(inputs({ now, river: { ...water, kind: "rain" } })).find(t => t.key === "water")?.level).toBe("alert");
    expect(buildTiles(inputs({ now, river: { ...water, kind: "river" } })).find(t => t.key === "water")?.level).toBe("unknown");
  });
  it("says 'no data' rather than calm when a feed is missing", () => {
    const tiles = buildTiles(inputs({ airGround: { avg: null, stations: 0, observedAt: null, source: "x" }, fires: { live: false, count: null, observedAt: null, source: "x" }, river: null }));
    expect(tiles.filter((t) => t.level === "unknown").map((t) => t.key)).toEqual(["air", "fire", "water"]);
  });

  it("does not promote old air or river observations to a current briefing", () => {
    const old = "2026-10-02T14:00:00Z";
    const tiles = buildTiles(inputs({ airGround: { avg: 12, stations: 2, observedAt: old, source: "PCD" }, river: { th: "old reading", en: "old reading", level: "good", observedAt: old } }));
    expect(tiles.find((t) => t.key === "air")?.level).toBe("unknown");
    expect(tiles.find((t) => t.key === "water")?.level).toBe("unknown");
  });

  it("keeps a missing satellite count distinct from a verified zero", () => {
    expect(buildTiles(inputs({ fires: { live: true, count: null, observedAt: null, source: "NASA" } })).find((t) => t.key === "fire")?.level).toBe("unknown");
  });

  it("never presents a Flood Hub 'no flood' as confirmed safety", () => {
    const water = buildTiles(inputs()).find((t) => t.key === "water")!;
    expect(water.th).toContain("ไม่ใช่การยืนยันว่าปลอดภัย");
  });

  it("raises water to watch when Google forecasts flooding even if the river is low now", () => {
    expect(buildTiles(inputs({ floodForecast: { outlook: "flooding", points: 12 } })).find((t) => t.key === "water")!.level).toBe("watch");
  });
});

describe("lineText", () => {
  it("is dated in Thai, one line per hazard, with sources and link", () => {
    const text = lineText(buildTiles(inputs()), [], new Date("2026-10-03T15:00:00Z"), "https://cnx.nonarkara.org/cnx");
    expect(text.split("\n")[0]).toBe("สรุปสถานการณ์จังหวัดเชียงใหม่ 3 ต.ค. 2569 เวลา 22:00 น.");
    expect(text).toContain("🟢 คุณภาพอากาศ: PM2.5 เฉลี่ย 12");
    expect(text).toContain("ที่มา:");
    expect(text.trim().endsWith("https://cnx.nonarkara.org/cnx")).toBe(true);
  });

  it("includes reference times when forwarded and handles invalid times honestly", () => {
    const tiles = buildTiles(inputs());
    expect(lineText(tiles, [], inputs().now, "https://example.org")).toContain("เวลาอ้างอิง:");
    tiles[0].observedAt = "invalid";
    expect(lineText(tiles, [], inputs().now, "https://example.org")).toContain("เวลาอ้างอิง: ไม่ทราบ");
  });

  it("formats Thai dates in the Buddhist era", () => {
    expect(thaiDate("2026-04-15")).toBe("15 เม.ย. 2569");
  });
});
