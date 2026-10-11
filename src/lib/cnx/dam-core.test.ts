// dam-core against rows captured verbatim from ThaiWater analyst/dam on
// 2026-10-11 (src/lib/cnx/dam-fixture.json).

import { describe, expect, it } from "vitest";
import fixture from "./dam-fixture.json";
import { compactDamRow, damAgeDays, damBand, damReportTime, pctOfNormal, selectDamRows, summariseDams, type DamRow } from "./dam-core";

const NOW = Date.parse("2026-10-11T05:00:00Z"); // 12:00 Bangkok, report day
const rows = selectDamRows(fixture);
const byName = (th: string) => rows.find((r) => r.nameTh === th);

describe("selectDamRows — the captured envelope", () => {
  it("keeps Ping-basin large dams and Chiang Mai medium reservoirs only", () => {
    const large = rows.filter((r) => r.kind === "large").map((r) => r.nameTh).sort();
    expect(large).toEqual(["ภูมิพล", "แม่กวงอุดมธารา", "แม่งัดสมบูรณ์ชล"].sort());
    expect(byName("สิริกิติ์")).toBeUndefined(); // Nan basin
    expect(byName("อ่างเก็บน้ำห้วยหินชะแนนใหญ่")).toBeUndefined(); // Sakon Nakhon
  });

  it("collapses the RID/EGAT duplicate to the newer RID report, not EGAT's 0 %", () => {
    const ngat = rows.filter((r) => r.id === "large:3");
    expect(ngat).toHaveLength(1);
    expect(ngat[0]).toMatchObject({ nameTh: "แม่งัดสมบูรณ์ชล", agency: "RID", date: "2026-10-11", storageMcm: 251.89, upstreamPct: 95.16 });
    expect(rows.filter((r) => r.id === "large:1")).toHaveLength(1);
  });

  it("compacts a real row with units and coordinates intact", () => {
    expect(byName("ภูมิพล")).toEqual({
      id: "large:1", kind: "large", nameTh: "ภูมิพล", nameEn: "Bhumibol", provinceTh: "ตาก", amphoeTh: "สามเงา",
      lat: 17.241944, lon: 98.971456, date: "2026-10-11", storageMcm: 9344.28, normalMcm: 13462, maxMcm: 13462,
      upstreamPct: 69.41, inflowMcm: 28.08, releaseMcm: 2, spillMcm: 0, agency: "RID",
    });
  });

  it("drops a medium reservoir that has never reported (1970 date, null storage)", () => {
    expect(byName("อ่างเก็บน้ำแม่มาว")).toBeUndefined();
  });

  it("tolerates a missing or malformed envelope", () => {
    expect(selectDamRows(null)).toEqual([]);
    expect(selectDamRows({ data: { dam_daily: "nope" } })).toEqual([]);
  });
});

describe("compactDamRow — rejection rules", () => {
  const base = fixture.data.dam_daily[0];
  it("rejects impossible calendar dates, coordinates and storage", () => {
    expect(compactDamRow({ ...base, dam_date: "2026-02-30" }, "large")).toBeNull();
    expect(compactDamRow({ ...base, dam_storage: -1 }, "large")).toBeNull();
    expect(compactDamRow({ ...base, dam: { ...base.dam, dam_lat: 91 } }, "large")).toBeNull();
  });
  it("treats an EGAT-style 0 % as missing, not empty", () => {
    expect(compactDamRow({ ...base, dam_storage_percent: 0 }, "large")?.upstreamPct).toBeNull();
  });
  it("nulls an implausible flow rather than passing it through", () => {
    expect(compactDamRow({ ...base, dam_inflow: -3 }, "large")?.inflowMcm).toBeNull();
  });
});

describe("grading", () => {
  it("prefers RID's published percent, computes only when it is absent", () => {
    expect(pctOfNormal({ storageMcm: 251.89, normalMcm: 265, upstreamPct: 95.16 })).toBe(95.2);
    expect(pctOfNormal({ storageMcm: 251.89, normalMcm: 265, upstreamPct: null })).toBe(95.1);
    expect(pctOfNormal({ storageMcm: 10, normalMcm: null, upstreamPct: null })).toBeNull();
  });
  it("bands on % of normal storage, with unknown kept unknown", () => {
    expect(damBand(100.7)).toBe("over");
    expect(damBand(95.16)).toBe("near-full");
    expect(damBand(84)).toBe("high");
    expect(damBand(70)).toBe("normal");
    expect(damBand(null)).toBe("unknown");
  });
  it("reads report days as Bangkok calendar days", () => {
    expect(damReportTime("2026-10-11")).toBe(Date.parse("2026-10-10T17:00:00Z"));
    expect(damAgeDays("2026-10-11", NOW)).toBe(0);
    // 23:30 UTC on the 10th is already the 11th in Bangkok.
    expect(damAgeDays("2026-10-11", Date.parse("2026-10-10T17:30:00Z"))).toBe(0);
    expect(damAgeDays("2026-10-12", NOW)).toBe(-1);
  });
});

describe("summariseDams", () => {
  it("answers 'near full?' from the captured day: Mae Ngat near full, medium reservoirs over", () => {
    const s = summariseDams(rows, NOW);
    expect(s.large.map((d) => d.nameTh)).toEqual(["แม่งัดสมบูรณ์ชล", "แม่กวงอุดมธารา", "ภูมิพล"]);
    expect(s.large[0]).toMatchObject({ band: "near-full", severity: "watch", pctNormal: 95.2, pctMax: 78, spilling: false });
    expect(s.nearFull[0]).toMatchObject({ nameTh: "อ่างเก็บน้ำแม่ทะลบหลวง", band: "over", severity: "alert" });
    expect(s.newestDate).toBe("2026-10-11");
  });
  it("drops the 2021 report instead of showing it as today", () => {
    const s = summariseDams(rows, NOW);
    expect(s.medium.find((d) => d.nameTh === "อ่างเก็บน้ำแม่ตะไคร้")).toBeUndefined();
    expect(s.dropped).toBe(1);
  });
  it("goes empty, not stale-but-shown, three days after the report", () => {
    const s = summariseDams(rows, Date.parse("2026-10-14T05:00:00Z"));
    expect(s.large).toEqual([]);
    expect(s.newestDate).toBeNull();
  });
  it("flags spill", () => {
    const spill: DamRow = { ...rows[0], spillMcm: 1.2 };
    expect(summariseDams([spill], NOW).spilling).toHaveLength(1);
  });
});
