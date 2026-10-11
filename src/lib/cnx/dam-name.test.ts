// A governor's flood desk must not name a dam that does not exist.
//
// ThaiWater's `analyst/dam` feed ships two records for Mae Ngat:
//   { en: "Mae Ngud", th: "แม่งัดสมบูรณ์ชล" }   <- newer, wins our dedupe
//   { en: "MAE NGAT DAM", th: "แม่งัด" }        <- older
// The newer one is simply wrong. Read live from the publisher on
// 2026-10-11; /api/cnx/dam was serving nameEn "Mae Ngud" while the same
// board's About page, flood rule and verdict copy all say Mae Ngat.
//
// This is a label correction and nothing else. The discipline that matters:
// the correction must be disclosed in the response `note`, so a reader
// never mistakes our spelling for the publisher's.

import { describe, expect, it } from "vitest";
import { compactDamRow, selectDamRows, UPSTREAM_EN_CORRECTIONS } from "./dam-core";
import { NOTE } from "./dam";

const row = (over: Record<string, unknown> = {}) => ({
  dam_date: "2026-10-11",
  dam_storage: 251.89,
  dam_storage_percent: 95.16,
  dam_inflow: null, dam_released: null, dam_spilled: null,
  basin: { basin_code: 6 }, // Ping basin — the filter selectDamRows applies
  geocode: { province_code: null, province_name: { th: "เชียงใหม่" }, amphoe_name: { th: "แม่แตง" } },
  dam: {
    id: 3, dam_oldcode: "3", dam_lat: 19.16, dam_long: 99.04,
    max_storage: 300, normal_storage: 265,
    dam_name: { th: "แม่งัดสมบูรณ์ชล", en: "Mae Ngud", jp: "メーガット ソムブーンチョン" },
  },
  ...over,
});

describe("reservoir names: the publisher's romanisation is corrected, and said so", () => {
  it("does not print 'Mae Ngud' — there is no such dam", () => {
    const r = compactDamRow(row() as never, "large");
    expect(r?.nameEn).toBe("Mae Ngat");
    expect(r?.nameEn).not.toMatch(/Ngud/);
  });

  it("leaves the Thai name alone — that is the one the feed gets right", () => {
    expect(compactDamRow(row() as never, "large")?.nameTh).toBe("แม่งัดสมบูรณ์ชล");
  });

  it("changes no number: storage, normal and percentage are the publisher's", () => {
    const r = compactDamRow(row() as never, "large");
    expect(r?.storageMcm).toBe(251.89);
    expect(r?.normalMcm).toBe(265);
    expect(r?.upstreamPct).toBe(95.16);
  });

  it("does not touch any other dam's name", () => {
    const other = compactDamRow(
      row({ dam: { ...(row().dam as object), dam_name: { th: "ภูมิพล", en: "Bhumibol" } } }) as never,
      "large",
    );
    expect(other?.nameEn).toBe("Bhumibol");
  });

  it("discloses the correction rather than passing it off as the publisher's", () => {
    expect(NOTE).toMatch(/Mae Ngud/);
    expect(NOTE).toMatch(/romanisation|spells/i);
  });

  it("never surfaces the publisher's Japanese field", () => {
    // The same feed carries 「女性の乳房」 ("female breasts") as dam_name.jp
    // on a duplicate Mae Ngat record. Nothing may read it.
    const r = compactDamRow(row() as never, "large") as unknown as Record<string, unknown>;
    expect(Object.keys(r)).not.toContain("jp");
    expect(JSON.stringify(r)).not.toContain("メーガット");
  });

  it("still selects the reservoir through the full envelope path", () => {
    const rows = selectDamRows({ data: { dam_daily: [row()], dam_medium: [] } } as never);
    expect(rows.map((r) => r.nameEn)).toContain("Mae Ngat");
  });

  it("keeps the correction map keyed on Thai, so a wrong English key cannot drift", () => {
    expect(Object.keys(UPSTREAM_EN_CORRECTIONS)).toContain("แม่งัดสมบูรณ์ชล");
  });
});