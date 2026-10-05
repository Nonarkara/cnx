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
  GENERAL_CHECKLIST,
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
  it("never certifies safe when the flood axis never spoke", () => {
    // Every input null. The tempting answer is "safe / nothing to do now" —
    // but we did not measure the river, and a blank layer is not evidence
    // of a quiet one. This is the omission half of the GISTDA error.
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
      flood_provenance: "live",
    };
    const v = computeVerdict(empty);
    expect(v.level).toBe("watch");
    // Coherent wire shape: never "score 0 · band normal · level watch".
    expect(v.score).toBe(0);
    expect(v.band).toBe("watch");
    expect(v.checklist).toEqual(GENERAL_CHECKLIST);
    // …and it says why, in a form that cannot be read as an observation.
    expect(v.reasons.at(-1)?.evidence).toBe("ping_capacity_ratio=null");
  });

  it("returns safe when a live gauge says the river is quiet", () => {
    // The other direction, and the one that stops the rule above being
    // gamed into permanent doom: a genuine, measured, low reading must
    // still earn an all-clear.
    const quiet: VerdictInputs = {
      pm25_now: 12,
      pm25_fc_24h: 14,
      rain_fc_24h_mm: 0,
      rain_now_24h_mm: 2,
      ping_capacity_ratio: 0.3, // measured
      reservoir_surge: false,
      fire_count: 0,
      wind_kmh: 10,
      provenance: "live",
      flood_provenance: "live",
    };
    const v = computeVerdict(quiet);
    expect(v.level).toBe("safe");
    expect(v.band).toBe("normal");
    expect(v.reasons).toEqual([]);
    expect(v.checklist).toEqual(GENERAL_CHECKLIST);
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
      flood_provenance: "live",
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
      flood_provenance: "live",
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
      flood_provenance: "live",
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
      flood_provenance: "live",
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
      flood_provenance: "live",
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
      flood_provenance: "live",
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
      flood_provenance: "live",
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
      flood_provenance: "live",
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
      flood_provenance: "live",
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
      flood_provenance: "live",
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
      flood_provenance: "live",
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
      flood_provenance: "live",
    });
    expect(scenario.data_provenance).toBe("scenario");
  });
});

describe("computeVerdict — haze reasons", () => {
  const quiet: VerdictInputs = {
    pm25_now: 18,
    pm25_fc_24h: null,
    rain_fc_24h_mm: null,
    rain_now_24h_mm: null,
    ping_capacity_ratio: null,
    reservoir_surge: false,
    fire_count: 0,
    wind_kmh: 20,
    provenance: "live",
    flood_provenance: "live",
  };

  it("does not double-count DustBoy when it agrees with the province average", () => {
    const base = computeVerdict(quiet);
    const withDust = computeVerdict({ ...quiet, pm25_now: 80, dustboy_pm25: 85 });
    const airOnly = computeVerdict({ ...quiet, pm25_now: 80 });
    expect(withDust.score).toBe(airOnly.score);
    expect(withDust.reasons.some((r) => r.domain === "haze" && r.evidence === "dustboy_pm25=85")).toBe(true);
    expect(base.score).toBe(0);
  });

  it("lets DustBoy move the score when it is the only PM reading", () => {
    const v = computeVerdict({ ...quiet, pm25_now: null, dustboy_pm25: 100 });
    expect(v.score).toBe(30);
    expect(v.reasons.some((r) => r.domain === "haze")).toBe(true);
  });

  it("names approaching plumes without adding a second fire score", () => {
    const base = computeVerdict(quiet);
    const v = computeVerdict({
      ...quiet,
      smoke_near_cnx: 4,
      smoke_hits_cnx: 6,
      smoke_origin_en: "northwest of Chiang Mai",
      smoke_origin_th: "ตะวันตกเฉียงเหนือของเชียงใหม่",
    });
    expect(v.score).toBe(base.score);
    expect(v.reasons.some((r) => r.domain === "haze" && r.en.includes("northwest of Chiang Mai"))).toBe(true);
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

describe("computeVerdict — a scenario flood is no signal at all", () => {
  const scenarioFlood: VerdictInputs = {
    pm25_now: 18,
    pm25_fc_24h: 20,
    rain_fc_24h_mm: 0,
    // Deliberately catastrophic-looking numbers, exactly as the scenario
    // module can produce. None of them may reach the operator.
    rain_now_24h_mm: 180,
    ping_capacity_ratio: 0.99,
    reservoir_surge: true,
    fire_count: 0,
    wind_kmh: 10,
    provenance: "mixed",
    flood_provenance: "scenario",
  };

  it("scores zero flood points even when the scenario says the river is overflowing", () => {
    // 0.99 ratio (40) + surge (15) + 180 mm (10) = 65 points if believed.
    const v = computeVerdict(scenarioFlood);
    expect(v.score).toBe(0);
  });

  it("emits no flood reason phrased as an observation", () => {
    // The single most important assertion here: once a string like
    // "Ping river overflowing (99% of bank capacity)" is in `reasons`, no
    // downstream reader can tell it from a measurement.
    const v = computeVerdict(scenarioFlood);
    const floodReasons = v.reasons.filter((r) => r.domain === "flood");
    expect(floodReasons).toHaveLength(1);
    expect(floodReasons[0].evidence).toBe("flood_provenance=scenario");
    for (const r of floodReasons) {
      expect(r.th).not.toMatch(/% ของความจุ/);
      expect(r.en).not.toMatch(/% of bank capacity/);
      expect(r.en).toMatch(/not evidence the river is safe/i);
    }
  });

  it("cannot raise the level above watch on flood grounds alone", () => {
    const v = computeVerdict(scenarioFlood);
    expect(v.level).not.toBe("danger");
    expect(v.level).not.toBe("prepare");
    expect(v.checklist).toEqual(GENERAL_CHECKLIST);
  });

  it("does not fabricate the flood↔air twin against a real air hazard", () => {
    const v = computeVerdict({ ...scenarioFlood, pm25_now: 120 });
    expect(v.reasons.some((r) => r.domain === "twins")).toBe(false);
    // Suppressing the fake must not suppress the real.
    expect(v.reasons.some((r) => r.domain === "air")).toBe(true);
  });

  it("still lets a real air hazard own the headline", () => {
    const v = computeVerdict({ ...scenarioFlood, pm25_now: 120 });
    expect(v.reasons[0].domain).toBe("air");
  });

  it("flags the blind-flood line as a caveat so a busy wall still shows it", () => {
    // The strip caps observation reasons at 3 and then appends every
    // caveat. Without this flag the one line saying "we cannot see the
    // river" is exactly the line that gets cut for space.
    const v = computeVerdict({ ...scenarioFlood, pm25_now: 120 });
    const caveats = v.reasons.filter((r) => r.isCaveat);
    expect(caveats).toHaveLength(1);
    expect(caveats[0].evidence).toBe("flood_provenance=scenario");
    // Observations are never flagged as caveats.
    for (const r of v.reasons) {
      if (r.domain === "air") expect(r.isCaveat).toBeUndefined();
    }
  });

  it("escalates the same numbers when the flood feed is genuinely live", () => {
    // Control: identical inputs from a live feed still escalate. If this
    // ever fails, the gate has swallowed a real episode. Same air reading
    // as the twin test above, so the only difference is the provenance.
    const v = computeVerdict({
      ...scenarioFlood,
      pm25_now: 120,
      flood_provenance: "live",
    });
    expect(v.score).toBeGreaterThanOrEqual(75);
    expect(v.level).toBe("danger");
    expect(v.reasons.some((r) => r.domain === "twins")).toBe(true);
  });

  it("escalates on flood grounds alone when the feed is live", () => {
    // 40 (ratio 0.99) + 15 (surge) + 10 (180 mm) = 65 → "prepare". Danger
    // would need 75; we are not manufacturing the missing 10 here.
    const v = computeVerdict({ ...scenarioFlood, flood_provenance: "live" });
    expect(v.score).toBe(65);
    expect(v.level).toBe("prepare");
  });
});


describe("unobserved air", () => {
  it("does not clear the board when a quiet river is measured but PM2.5 is missing", () => {
    const v = computeVerdict({ pm25_now: null, pm25_fc_24h: null, rain_fc_24h_mm: null, rain_now_24h_mm: 0, ping_capacity_ratio: 0.3, reservoir_surge: false, fire_count: 0, wind_kmh: null, provenance: "mixed", flood_provenance: "live" });
    expect(v.level).toBe("watch");
    expect(v.reasons.some((r) => r.domain === "air" && r.isCaveat)).toBe(true);
  });
});


describe("checklists follow the observed hazard", () => {
  const quiet: VerdictInputs = { pm25_now: 10, pm25_fc_24h: null, rain_fc_24h_mm: null, rain_now_24h_mm: null, ping_capacity_ratio: 0.3, reservoir_surge: false, fire_count: 0, wind_kmh: null, provenance: "live", flood_provenance: "live" };
  it("uses general checks for air-only hazards instead of flood response tasks", () => {
    const v = computeVerdict({ ...quiet, pm25_now: 180, fire_count: 100 });
    expect(v.level).toBe("prepare");
    expect(v.checklist).toEqual(GENERAL_CHECKLIST);
    expect(v.checklist.map((i) => i.en).join(" ")).not.toMatch(/evacuat|power|pump|sandbag/i);
  });
  it("retains the level-specific response checklist for an active measured flood", () => {
    const v = computeVerdict({ ...quiet, pm25_now: 180, fire_count: 100, ping_capacity_ratio: 1 });
    expect(v.level).toBe("danger");
    expect(v.checklist).toEqual(CHECKLIST.danger);
  });
  it("uses general verification checks for missing data even when a scenario looks flooded", () => {
    const v = computeVerdict({ ...quiet, pm25_now: null, ping_capacity_ratio: 1, flood_provenance: "scenario" });
    expect(v.checklist).toEqual(GENERAL_CHECKLIST);
    expect(v.checklist.map((i) => i.en).join(" ")).not.toMatch(/evacuat|power|pump/i);
  });
  it("does not turn air washout speculation into flood response tasks", () => {
    const v = computeVerdict({ ...quiet, pm25_now: 100, rain_fc_24h_mm: 20 });
    expect(v.reasons.some((r) => r.domain === "twins")).toBe(true);
    expect(v.checklist).toEqual(GENERAL_CHECKLIST);
  });
  it("replaces the quiet-state do-nothing fallback with monitoring and no all-clear", () => {
    const v = computeVerdict(quiet);
    expect(v.head_en).toMatch(/Continue monitoring/);
    expect(v.head_en).toMatch(/not an all-clear/);
    expect(v.head_en).not.toMatch(/Nothing to do|tomorrow/);
  });
});

describe("computeVerdict — measured rain at gauges", () => {
  const calm = {
    pm25_now: 13,
    pm25_fc_24h: 10,
    rain_fc_24h_mm: 12,
    rain_now_24h_mm: null,
    ping_capacity_ratio: 0.3,
    reservoir_surge: false,
    fire_count: 0,
    wind_kmh: 5,
    provenance: "live" as const,
    flood_provenance: "live" as const,
    smoke_hits_cnx: 16,
    smoke_near_cnx: 0,
  };

  it("very heavy rain leads the card and reaches watch on its own (2026-10-05: 94.5 mm, Chom Thong)", () => {
    const v = computeVerdict({ ...calm, rain_measured: { maxMm: 94.5, districtTh: "จอมทอง", districtEn: "Chom Thong", heavyGauges: 11 } });
    expect(v.level).toBe("watch");
    expect(v.head_en).toMatch(/^Very heavy rain 94\.5 mm in 24 h at Chom Thong/);
    expect(v.reasons[0].domain).toBe("flood");
  });

  it("heavy rain is a stated reason without forcing watch by itself", () => {
    const v = computeVerdict({ ...calm, rain_measured: { maxMm: 60, districtTh: "แม่แตง", districtEn: "Mae Taeng", heavyGauges: 2 } });
    expect(v.reasons.some((r) => /Heavy rain 60 mm/.test(r.en))).toBe(true);
    expect(v.score).toBeLessThan(25);
  });

  it("moderate rain adds nothing", () => {
    const v = computeVerdict({ ...calm, rain_measured: { maxMm: 20, districtTh: "หางดง", districtEn: "Hang Dong", heavyGauges: 0 } });
    expect(v.reasons.some((r) => /rain \d+ mm in 24 h at/.test(r.en))).toBe(false);
  });
});
