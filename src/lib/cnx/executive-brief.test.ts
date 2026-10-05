import { describe, expect, it } from "vitest";
import { buildExecutiveBrief, type ExecutiveBriefInput } from "./executive-brief";
import type { DustboyResponse, DustboyStation } from "./dustboy";
import type { RiverGauge } from "./river-level";
import type { CnxTwinResponse } from "./twin";

const now = new Date("2026-10-04T06:00:00Z");
const stamp = "2026-10-04T05:30:00Z";
const base: ExecutiveBriefInput = { now, air: null, dustboy: null, fires: null, twin: null, riverGauges: [], flights: null };
const metric = (input: Partial<ExecutiveBriefInput>, id: "water" | "air" | "fire" | "mobility") => buildExecutiveBrief({ ...base, ...input }).metrics.find(m => m.id === id)!;
const sensor = (changes: Partial<DustboyStation> = {}): DustboyStation => ({
  stationId: "d1", nameTh: "test", district: "เมือง", province: "เชียงใหม่", longitude: 99, latitude: 18,
  pm25: 10, suspect: false, readingAgeHours: 0, severity: "good", observedAt: stamp, ...changes,
});
const dust = (stations: DustboyStation[]): DustboyResponse => ({ provenance: "live", generatedAt: now.toISOString(), stations } as DustboyResponse);
const gauge = (changes: Partial<RiverGauge> = {}): RiverGauge => ({
  id: "p1", code: "P.1", nameTh: "สะพานนวรัฐ", nameEn: "Nawarat", riverTh: "แม่น้ำปิง", basinTh: "ปิง",
  latitude: 18.79, longitude: 99, levelMsl: 300, belowBankM: 2, bankLevelMsl: 302, criticalLevelMsl: null,
  headroomM: null, keyStation: true, dischargeM3s: null, agency: "RID", severity: "good",
  sourceSituationCode: null, sourceBankText: null, observedAt: stamp, ...changes,
});

describe("executive evidence overview", () => {
  it("keeps absent domains unknown and does not give an all-clear", () => {
    const brief = buildExecutiveBrief(base);
    expect(brief.unknownCount).toBe(4);
    expect(brief.observedCount).toBe(0);
    expect(brief.metrics.every(m => m.value === "—")).toBe(true);
    expect(brief.headlineEn).toContain("Evidence gaps");
  });

  it("excludes suspect, stale, future, other-province and invalid district readings", () => {
    const brief = buildExecutiveBrief({ ...base, dustboy: dust([
      sensor({ pm25: 40 }), sensor({ stationId: "d2", pm25: 20, observedAt: "2026-10-04T04:00:00Z" }),
      sensor({ suspect: true, pm25: 999 }), sensor({ pm25: 500, observedAt: "2026-10-04T02:59:59Z" }),
      sensor({ pm25: 600, observedAt: "2026-10-04T06:06:00Z" }), sensor({ province: "ลำพูน", pm25: 700 }),
      sensor({ district: "แม่ริม", pm25: -1 }),
    ]) });
    expect(brief.districts).toEqual([{ th: "เมืองเชียงใหม่", en: "Mueang Chiang Mai", pm25: 30, sensors: 2, observedAt: "2026-10-04T04:00:00Z", level: "watch" }]);
    expect(brief.metrics[1].value).toBe("30");
    expect(brief.metrics[1].summaryEn).toContain("screening only");
  });

  it("uses fresh PCD ground observations rather than CAMS, fetch time or province averages", () => {
    const air = { generatedAt: now.toISOString(), provinceAvgPm25: 999, stations: [
      { stationId: "p", name: "PCD", latitude: 18, longitude: 99, source: "pcd" as const, pm25: 12, observedAt: stamp },
      { stationId: "m", name: "CAMS", latitude: 18, longitude: 99, source: "open-meteo" as const, pm25: 999, observedAt: stamp },
    ] };
    const result = metric({ air, dustboy: dust([sensor({ pm25: 20 })]) }, "air");
    expect(result.value).toBe("12");
    expect(result.source).toBe("PCD ground stations");
    expect(result.observedAt).toBe(stamp);
  });

  it("rejects old ground readings even when the feed was just fetched", () => {
    const result = metric({ dustboy: dust([sensor({ observedAt: "2026-10-04T02:59:59Z" })]) }, "air");
    expect(result.state).toBe("stale");
    expect(result.level).toBe("unknown");
    expect(result.value).toBe("—");
    expect(metric({ dustboy: dust([sensor({ suspect: true })]) }, "air").state).toBe("unavailable");
  });

  it("ranks the worst measured district first and prioritizes air action", () => {
    const brief = buildExecutiveBrief({ ...base, dustboy: dust([sensor(), sensor({ district: "แม่ริม", pm25: 100 })]) });
    expect(brief.districts[0].en).toBe("Mae Rim");
    expect(brief.metrics[1].level).toBe("critical");
    expect(brief.headlineEn).toContain("Air:");
    expect(brief.attentionCount).toBe(1);
  });

  it("treats zero bank clearance as critical and uses published arithmetic", () => {
    const result = metric({ riverGauges: [gauge({ bankLevelMsl: 300, belowBankM: 9 })] }, "water");
    expect(result.level).toBe("critical");
    expect(result.summaryEn).toContain("at bank level");
    expect(result.source).toContain("RID");
    expect(result.value).toBe("0.00");
    expect(result.unit).toBe("ม. ถึงตลิ่ง");
    expect(result.summaryEn).toContain("measured level 300.00 m MSL");
    expect(result.summaryEn).toContain("bank reference 300.00 m MSL");
  });

  it("does not let a lower P.1 reading hide a critical measured Ping gauge", () => {
    const result = metric({ riverGauges: [gauge(), gauge({ code: "P.67", bankLevelMsl: 299.8 })] }, "water");
    expect(result.level).toBe("critical");
    expect(result.source).toContain("P.67");
    expect(result.summaryEn).toContain("0.20 m above bank");
  });

  it("distinguishes the critical station threshold from overtopping", () => {
    const result = metric({ riverGauges: [gauge({ criticalLevelMsl: 299.5 })] }, "water");
    expect(result.level).toBe("critical");
    expect(result.value).toBe("2.00");
    expect(result.unit).toBe("ม. ต่ำกว่าตลิ่ง");
    expect(result.summaryEn).toContain("2.00 m below bank");
    expect(result.summaryEn).toContain("critical threshold");
    expect(result.summaryEn).not.toContain("above bank");
  });

  it("preserves unknown grading when no bank or critical threshold exists", () => {
    const result = metric({ riverGauges: [gauge({ bankLevelMsl: null, belowBankM: null })] }, "water");
    expect(result.state).toBe("current");
    expect(result.value).toBe("300.00");
    expect(result.level).toBe("unknown");
    expect(result.summaryEn).toContain("thresholds unavailable");
    expect(result.unit).toBe("ม. รทก. / MSL");
  });

  it("leads with remaining bank distance while preserving the measured datum", () => {
    const result = metric({ riverGauges: [gauge()] }, "water");
    expect(result.value).toBe("2.00");
    expect(result.unit).toBe("ม. ต่ำกว่าตลิ่ง");
    expect(result.summaryEn).toContain("measured level 300.00 m MSL");
    expect(result.summaryEn).toContain("bank reference 302.00 m MSL");
  });

  it.each([
    [301, "1.00", "ม. ก่อนเกณฑ์วิกฤต", "below", "watch"],
    [300, "0.00", "ม. ถึงเกณฑ์วิกฤต", "at", "critical"],
    [299.5, "0.50", "ม. เกินเกณฑ์วิกฤต", "above", "critical"],
  ])("uses the critical reference when the bank is unknown (%s)", (critical, value, unit, relation, level) => {
    const result = metric({ riverGauges: [gauge({ bankLevelMsl: null, belowBankM: null, criticalLevelMsl: Number(critical) })] }, "water");
    expect(result.value).toBe(value);
    expect(result.unit).toBe(unit);
    expect(result.level).toBe(level);
    expect(result.summaryEn).toContain(`${relation} the station critical threshold`);
    expect(result.summaryEn).toContain("bank threshold unavailable");
    expect(result.summaryEn).toContain("measured level 300.00 m MSL");
    expect(result.summaryEn).toContain(`critical reference ${Number(critical).toFixed(2)} m MSL`);
    expect(result.summaryEn).not.toContain("above bank");
  });

  it("rejects stale/future measured gauges and never reads scenario capacity", () => {
    const twin = { deltas: { flood: { ping_capacity_ratio: 0.1, provenance: "scenario", measured: null } } } as unknown as CnxTwinResponse;
    expect(metric({ twin, riverGauges: [gauge({ observedAt: "2026-10-04T02:59:59Z" })] }, "water").state).toBe("stale");
    expect(metric({ twin, riverGauges: [gauge({ observedAt: "2026-10-04T06:06:00Z" })] }, "water").state).toBe("unavailable");
  });

  it("can use current measured twin fallback even if other flood fields are scenario", () => {
    const twin = { deltas: { flood: { provenance: "scenario", measured: { provenance: "live", station_code: "P.1", station_name_th: "P1", level_msl: 300, below_bank_m: -0.2, headroom_m: null, observed_at: stamp, gauge_count: 43 } } } } as unknown as CnxTwinResponse;
    const result = metric({ twin }, "water");
    expect(result.value).toBe("0.20");
    expect(result.unit).toBe("ม. เหนือตลิ่ง");
    expect(result.summaryEn).toContain("0.20 m above bank");
    expect(result.summaryEn).toContain("measured level 300.00 m MSL");
    expect(result.level).toBe("critical");
  });

  it("keeps a live zero satellite window honest without inventing a detection time", () => {
    const fires = { generatedAt: now.toISOString(), provenance: "live" as const, totalCount: 0, hotspots: [] };
    const result = metric({ fires }, "fire");
    expect(result.state).toBe("current");
    expect(result.value).toBe("0");
    expect(result.observedAt).toBeNull();
    expect(result.summaryEn).toContain("not active-fire count");
    expect(metric({ fires: { ...fires, provenance: "scenario" } }, "fire").level).toBe("unknown");
    expect(metric({ fires: { ...fires, generatedAt: "2026-10-04T02:00:00Z" } }, "fire").state).toBe("stale");
  });

  it("uses hotspot detection time without treating an earlier satellite pass as a dead feed", () => {
    const result = metric({ fires: { generatedAt: now.toISOString(), provenance: "live", totalCount: 1,
      hotspots: [{ id: "h", latitude: 18, longitude: 99, brightness: null, confidence: 90, satellite: "NOAA-20", detectedAt: "2026-10-04T00:00:00Z", severity: "watch" }] } }, "fire");
    expect(result.state).toBe("current");
    expect(result.observedAt).toBe("2026-10-04T00:00:00Z");
    expect(result.level).toBe("watch");
  });

  it("uses upstream aircraft observation age, and never invents passenger totals", () => {
    const flights = { fetchedAt: now.getTime(), observedAt: now.getTime() - 60_000, airborne: [], ground: [], degraded: false, source: "adsb.lol" as const };
    const result = metric({ flights }, "mobility");
    expect(result.value).toBe("0");
    expect(result.unit).toBe("aircraft");
    expect(result.summaryEn).toContain("not passengers");
    expect(metric({ flights: { ...flights, observedAt: now.getTime() - 600_001 } }, "mobility").state).toBe("stale");
    expect(metric({ flights: { ...flights, degraded: true } }, "mobility").state).toBe("unavailable");
  });
});

describe("hotspots are counted inside the province", () => {
  it("leads with the provincial count and names detections just outside it", () => {
    const now = new Date("2026-10-05T06:00:00Z");
    const brief = buildExecutiveBrief({
      air: null,
      dustboy: null,
      twin: null,
      riverGauges: [],
      flights: null,
      now,
      fires: { generatedAt: now.toISOString(), hotspots: [], totalCount: 16, provinceCount: 5, provenance: "live" },
    });
    const fire = brief.metrics.find((m) => m.id === "fire")!;
    expect(fire.value).toBe("5");
    expect(fire.summaryEn).toContain("11 more just outside the province");
  });
});

describe("measured heavy rain raises the water tile", () => {
  const now = new Date("2026-10-05T06:00:00Z");
  const base = { air: null, dustboy: null, fires: null, twin: null, riverGauges: [], flights: null, now };
  const rainResponse = (max: number, band: "heavy" | "very-heavy") => ({
    generatedAt: now.toISOString(),
    stations: [],
    bands: { none: 0, light: 0, moderate: 0, heavy: band === "heavy" ? 1 : 0, "very-heavy": band === "very-heavy" ? 1 : 0 },
    wettest: null,
    districts: [{ th: "จอมทอง", en: "Chom Thong", max, band, stations: 3 }],
    maxAgeHours: 6,
    provenance: "live" as const,
    source: "ThaiWater",
    note: "",
  });

  it("shows very heavy rain even with no river reading, and calls for flash-flood watch", () => {
    const water = buildExecutiveBrief({ ...base, rain: rainResponse(94.5, "very-heavy") }).metrics.find((m) => m.id === "water")!;
    expect(water.state).toBe("current");
    expect(water.level).toBe("alert");
    expect(water.summaryTh).toContain("จอมทอง 94.5");
    expect(water.actionEn).toMatch(/flash floods/);
  });

  it("does nothing when the rain feed is unavailable", () => {
    const water = buildExecutiveBrief({ ...base, rain: { ...rainResponse(94.5, "very-heavy"), provenance: "unavailable" } }).metrics.find((m) => m.id === "water")!;
    expect(water.state).toBe("unavailable");
  });
});
