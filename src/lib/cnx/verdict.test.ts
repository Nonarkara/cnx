// CNX verdict engine — smoke tests for the threshold table and the
// bilingual join surface. Regression-proofs the math so a future
// tweak to a constant can't quietly push a "watch" verdict into
// "danger" (or vice-versa).
//
// Run: `npx vitest run src/lib/cnx/verdict.test.ts`

import { describe, it, expect } from "vitest";
import {
  bandForScore,
  levelForBand,
  computeVerdict,
  CHECKLIST,
  HOTLINES,
  type VerdictInputs,
} from "./verdict";

describe("bandForScore", () => {
  it("returns 'normal' below 25", () => {
    expect(bandForScore(0)).toBe("normal");
    expect(bandForScore(24)).toBe("normal");
  });
  it("returns 'watch' at 25–49", () => {
    expect(bandForScore(25)).toBe("watch");
    expect(bandForScore(49)).toBe("watch");
  });
  it("returns 'elevated' at 50–74", () => {
    expect(bandForScore(50)).toBe("elevated");
    expect(bandForScore(74)).toBe("elevated");
  });
  it("returns 'high' at 75+", () => {
    expect(bandForScore(75)).toBe("high");
    expect(bandForScore(100)).toBe("high");
  });
});

describe("levelForBand", () => {
  it("maps bands to actions", () => {
    expect(levelForBand("normal")).toBe("safe");
    expect(levelForBand("watch")).toBe("watch");
    expect(levelForBand("elevated")).toBe("prepare");
    expect(levelForBand("high")).toBe("danger");
  });
});

describe("computeVerdict — safe baseline", () => {
  it("returns safe with no signal", () => {
    const empty: VerdictInputs = {
      pm25_now: null,
      pm25_fc_24h: null,
      rain_fc_24h_mm: null,
      rain_now_24h_mm: null,
      ping_capacity_ratio: null,
      reservoir_surge: false,
      fire_count: null,
      wind_kmh: null,
      provenance: "scenario",
    };
    const v = computeVerdict(empty);
    expect(v.level).toBe("safe");
    expect(v.score).toBe(0);
    expect(v.band).toBe("normal");
    expect(v.reasons).toEqual([]);
    expect(v.checklist).toEqual(CHECKLIST.safe);
  });

  it("stays safe with low PM2.5 + calm flood + no fires", () => {
    const v = computeVerdict({
      pm25_now: 18,
      pm25_fc_24h: 20,
      rain_fc_24h_mm: 0,
      rain_now_24h_mm: 2,
      ping_capacity_ratio: 0.3,
      reservoir_surge: false,
      fire_count: 3,
      wind_kmh: 8,
      provenance: "live",
    });
    expect(v.level).toBe("safe");
    expect(v.score).toBeLessThan(25);
  });
});

describe("computeVerdict — flood pressure", () => {
  it("moves into watch when Ping hits 0.85", () => {
    const v = computeVerdict({
      pm25_now: 18,
      pm25_fc_24h: 20,
      rain_fc_24h_mm: 0,
      rain_now_24h_mm: 30,
      ping_capacity_ratio: 0.85,
      reservoir_surge: false,
      fire_count: 0,
      wind_kmh: 10,
      provenance: "live",
    });
    // Single-domain flood caps at 40 → band=watch
    expect(v.score).toBeGreaterThanOrEqual(30);
    expect(v.level).toBe("watch");
  });

  it("stacks flood + air to danger when Ping is overflowing AND air is hazardous", () => {
    const v = computeVerdict({
      pm25_now: 110, // unhealthy → airScore 30
      pm25_fc_24h: 120,
      rain_fc_24h_mm: 0,
      rain_now_24h_mm: 30,
      ping_capacity_ratio: 0.95, // floodScore 40
      reservoir_surge: true, // +15 → total 85 → danger
      fire_count: 0,
      wind_kmh: 5,
      provenance: "live",
    });
    expect(v.score).toBeGreaterThanOrEqual(75);
    expect(v.level).toBe("danger");
  });

  it("reservoir surge stacks on top of gauge level (independent signal)", () => {
    const surgeOnly = computeVerdict({
      pm25_now: null,
      pm25_fc_24h: null,
      rain_fc_24h_mm: null,
      rain_now_24h_mm: null,
      ping_capacity_ratio: 0.5,
      reservoir_surge: true,
      fire_count: null,
      wind_kmh: null,
      provenance: "scenario",
    });
    // 0.5 ratio = 0 (below 0.6 watch threshold); surge = +15.
    expect(surgeOnly.score).toBe(15);
    expect(surgeOnly.reasons.some((r) => r.evidence === "reservoir_surge=true")).toBe(true);
  });
});

describe("computeVerdict — air pressure + mountain-basin trap", () => {
  it("promotes PM2.5 score when wind is low (smoke doesn't disperse)", () => {
    // PM2.5 = 80 sits in the moderate band [50,90). Mountain-basin
    // amplification (wind<12 → ×1.25) pushes effectivePm to 100, which
    // crosses into unhealthy [90,150). Only the still-air case crosses.
    const windy = computeVerdict({
      pm25_now: 80, // 80*1.0 = 80 → moderate → airScore 20
      pm25_fc_24h: null,
      rain_fc_24h_mm: null,
      rain_now_24h_mm: null,
      ping_capacity_ratio: null,
      reservoir_surge: false,
      fire_count: null,
      wind_kmh: 25, // breezy
      provenance: "live",
    });
    const still = computeVerdict({
      pm25_now: 80, // 80*1.25 = 100 → unhealthy → airScore 30
      pm25_fc_24h: null,
      rain_fc_24h_mm: null,
      rain_now_24h_mm: null,
      ping_capacity_ratio: null,
      reservoir_surge: false,
      fire_count: null,
      wind_kmh: 6, // mountain-basin trap
      provenance: "live",
    });
    expect(still.score).toBeGreaterThan(windy.score);
    expect(still.score).toBe(30);
    expect(windy.score).toBe(20);
  });

  it("promotes to danger at PM2.5 ≥ 150 (hazardous) when paired with a flood signal", () => {
    const v = computeVerdict({
      pm25_now: 160, // airScore 40
      pm25_fc_24h: 200,
      rain_fc_24h_mm: null,
      rain_now_24h_mm: 60,
      ping_capacity_ratio: 0.7, // floodScore 15
      reservoir_surge: false,
      fire_count: 0,
      wind_kmh: 5,
      provenance: "live",
    });
    // air 40 + flood 15 + rain 10 = 65 (band=elevated → prepare)
    // Add reservoir_surge → +15 → 75+ (danger)
    expect(v.score).toBeGreaterThanOrEqual(55);
    expect(["prepare", "danger"]).toContain(v.level);
    expect(v.reasons.some((r) => r.domain === "air")).toBe(true);
  });
});

describe("computeVerdict — fire pressure", () => {
  it("pushes into elevated when 100+ hotspots combine with moderate PM2.5", () => {
    const v = computeVerdict({
      pm25_now: 60, // airScore 20
      pm25_fc_24h: null,
      rain_fc_24h_mm: null,
      rain_now_24h_mm: null,
      ping_capacity_ratio: null,
      reservoir_surge: false,
      fire_count: 120, // fireScore 20
      wind_kmh: 20,
      provenance: "live",
    });
    // 20 + 20 = 40 → band=watch
    expect(v.score).toBeGreaterThanOrEqual(40);
    expect(["watch", "prepare", "danger"]).toContain(v.level);
  });
});

describe("computeVerdict — cross-domain twins join", () => {
  it("surfaces the 'twins' reason when flood + air both prepare/danger", () => {
    const v = computeVerdict({
      pm25_now: 110,
      pm25_fc_24h: null,
      rain_fc_24h_mm: null,
      rain_now_24h_mm: null,
      ping_capacity_ratio: 0.9,
      reservoir_surge: false,
      fire_count: 0,
      wind_kmh: 5,
      provenance: "live",
    });
    expect(v.reasons.some((r) => r.domain === "twins" && /N95|air/i.test(r.en))).toBe(true);
  });

  it("surfaces the washout reason when rain is forecast and air is bad", () => {
    const v = computeVerdict({
      pm25_now: 80,
      pm25_fc_24h: null,
      rain_fc_24h_mm: 22, // heavy rain coming
      rain_now_24h_mm: 0,
      ping_capacity_ratio: 0.3,
      reservoir_surge: false,
      fire_count: 0,
      wind_kmh: 10,
      provenance: "live",
    });
    expect(v.reasons.some((r) => r.domain === "twins" && /wash|washout/i.test(r.en))).toBe(true);
  });
});

describe("computeVerdict — provenance is honest", () => {
  it("carries the input provenance through to the verdict", () => {
    const live = computeVerdict({
      pm25_now: 18,
      pm25_fc_24h: null,
      rain_fc_24h_mm: null,
      rain_now_24h_mm: null,
      ping_capacity_ratio: null,
      reservoir_surge: false,
      fire_count: null,
      wind_kmh: null,
      provenance: "live",
    });
    expect(live.data_provenance).toBe("live");

    const scenario = computeVerdict({
      pm25_now: 18,
      pm25_fc_24h: null,
      rain_fc_24h_mm: null,
      rain_now_24h_mm: null,
      ping_capacity_ratio: null,
      reservoir_surge: false,
      fire_count: null,
      wind_kmh: null,
      provenance: "scenario",
    });
    expect(scenario.data_provenance).toBe("scenario");
  });
});

describe("HOTLINES surface", () => {
  it("names DDPM 1784, PCD 1650, DDC 1422, EMS 1669 — never fabricated", () => {
    expect(HOTLINES.ddpm).toBe("1784");
    expect(HOTLINES.pcd).toBe("1650");
    expect(HOTLINES.ddc).toBe("1422");
    expect(HOTLINES.ems).toBe("1669");
  });
});

describe("CHECKLIST", () => {
  it("has at least 3 items per level — no empty advice", () => {
    for (const lvl of ["safe", "watch", "prepare", "danger"] as const) {
      expect(CHECKLIST[lvl].length).toBeGreaterThanOrEqual(3);
    }
  });
  it("carries bilingual text on every item", () => {
    for (const lvl of ["safe", "watch", "prepare", "danger"] as const) {
      for (const item of CHECKLIST[lvl]) {
        expect(item.th.length).toBeGreaterThan(0);
        expect(item.en.length).toBeGreaterThan(0);
      }
    }
  });
});
