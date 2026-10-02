// The measured-gauge path in the verdict engine.
//
// This is the first time the flood axis on this board has been allowed to
// say something about the river that it actually observed. The tests
// below are mostly about what it must NOT do: speak from a scenario
// number, certify safety from an absence, or age an observation into a
// fresh one.

import { describe, it, expect } from "vitest";
import { computeVerdict, isCurrentGaugeReading, type VerdictInputs, type PingMeasured } from "./verdict";

/** A real P.1 reading as observed on 2026-10-02: 2.42 m of headroom. */
function measured(over: Partial<PingMeasured> = {}): PingMeasured {
  return {
    stationCode: "P.1",
    stationNameTh: "สะพานนวรัฐ",
    headroomM: 2.42,
    belowBankM: 2.42,
    levelMsl: 301.78,
    reportingCount: 43,
    observedAt: new Date().toISOString(),
    ...over,
  };
}

/** Everything null: the "we measured nothing at all" case. */
const silent: VerdictInputs = {
  pm25_now: null,
  pm25_fc_24h: null,
  rain_fc_24h_mm: null,
  rain_now_24h_mm: null,
  ping_capacity_ratio: null,
  reservoir_surge: false,
  fire_count: null,
  wind_kmh: null,
  provenance: "scenario",
  flood_provenance: "scenario",
};

const floodReasons = (v: ReturnType<typeof computeVerdict>) => v.reasons.filter((r) => r.domain === "flood");

describe("a measured gauge unblinds the flood axis", () => {
  it("stops the board from claiming a blind flood axis once a real gauge reports", () => {
    const v = computeVerdict({ ...silent, ping_measured: measured() });
    // The caveat that says "no live river reading" must be GONE. That
    // sentence is now false, and printing it beside a real reading is a
    // number-right/sentence-wrong split.
    expect(floodReasons(v).some((r) => r.isCaveat)).toBe(false);
  });

  it("may support safe when both river and current air have readings", () => {
    // A quiet measured river supports the flood axis; it cannot fill in
    // missing air evidence. Both domains must have a current reading.
    const v = computeVerdict({ ...silent, pm25_now: 10, ping_measured: measured() });
    expect(v.score).toBe(0);
    expect(v.level).toBe("safe");
  });

  it("a quiet river cannot certify safe when current air is missing", () => {
    const v = computeVerdict({ ...silent, ping_measured: measured() });
    expect(v.level).toBe("watch");
    expect(v.reasons.some((r) => r.domain === "air" && r.isCaveat)).toBe(true);
  });

  it("still refuses safe when there is no gauge at all", () => {
    const v = computeVerdict(silent);
    expect(v.level).toBe("watch");
    expect(floodReasons(v).some((r) => r.isCaveat)).toBe(true);
  });

  it("states the reading as an observation, with evidence", () => {
    const v = computeVerdict({ ...silent, ping_measured: measured() });
    const r = floodReasons(v)[0];
    expect(r.en).toMatch(/P\.1 is 2\.42 m below its bank level/);
    expect(r.evidence).toBe("gauge_below_bank=2.42m");
    expect(r.isCaveat).toBeFalsy();
  });

  it("ages the observation in the sentence, so a stale gauge cannot read as fresh", () => {
    const old = new Date(Date.now() - (3 * 3600_000 - 60_000)).toISOString();
    const v = computeVerdict({ ...silent, ping_measured: measured({ observedAt: old }) });
    expect(floodReasons(v)[0].en).toMatch(/observed 3 h ago/);
  });

  it("shows minutes for a recent reading and days for an old one", () => {
    const mins = computeVerdict({
      ...silent,
      ping_measured: measured({ observedAt: new Date(Date.now() - 20 * 60_000).toISOString() }),
    });
    expect(floodReasons(mins)[0].en).toMatch(/observed 20 min ago/);

    const days = computeVerdict({
      ...silent,
      ping_measured: measured({ observedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() }),
    });
    expect(floodReasons(days)[0].en).toMatch(/not current/);
    expect(floodReasons(days)[0].isCaveat).toBe(true);
  });

  it("does not grade a reading when its observation stamp is unusable", () => {
    const v = computeVerdict({ ...silent, ping_measured: measured({ observedAt: "not-a-date" }) });
    const en = floodReasons(v)[0].en;
    expect(en).toMatch(/not current/);
    expect(floodReasons(v)[0].isCaveat).toBe(true);
  });
});

describe("escalation is driven by the measured river, not by our own bands", () => {
  it("goes critical when the gauge is at or above its published threshold", () => {
    const v = computeVerdict({ ...silent, ping_measured: measured({ headroomM: 0, belowBankM: 0.1 }) });
    expect(v.score).toBeGreaterThanOrEqual(40);
    expect(v.level).not.toBe("safe");
    expect(floodReasons(v)[0].en).toMatch(/at or above its published critical level/);
    expect(floodReasons(v)[0].evidence).toBe("gauge_headroom=0.00m");
  });

  it("escalates on a gauge within a metre of its bank", () => {
    const v = computeVerdict({ ...silent, ping_measured: measured({ headroomM: null, belowBankM: 0.4 }) });
    // 25 points — the low edge of the "watch" band (25–49). Not
    // "prepare": that needs 50. The score is the assertion; the level
    // follows the table.
    expect(v.score).toBe(25);
    expect(v.level).toBe("watch");
    expect(floodReasons(v)[0].en).toMatch(/0\.40 m from its bank level/);
  });

  it("treats a gauge at or over the bank as critical", () => {
    const v = computeVerdict({ ...silent, ping_measured: measured({ headroomM: null, belowBankM: -0.3 }) });
    expect(v.score).toBe(40);
    expect(floodReasons(v)[0].en).toMatch(/0\.30 m from its bank level/);
  });

  it("says nothing about the river when the gauge has no bank geometry", () => {
    // No bank level and no threshold: there is no measured statement to
    // make. The board must fall back to saying it could not measure —
    // never to inventing a position for the water.
    const v = computeVerdict({
      ...silent,
      ping_measured: measured({ headroomM: null, belowBankM: null }),
    });
    const flood = floodReasons(v);
    // Exactly one flood reason, and it is the blind-axis caveat — an
    // ungradable gauge is the same position as no gauge at all.
    expect(flood).toHaveLength(1);
    expect(flood[0].isCaveat).toBe(true);
    expect(flood[0].evidence).toBe("flood_provenance=scenario");
    // And it must not unlock a "safe" verdict.
    expect(v.level).toBe("watch");
  });

  it("never calls a sub-bank reading a clearance", () => {
    const v = computeVerdict({ ...silent, ping_measured: measured() });
    const text = floodReasons(v).map((r) => `${r.th} ${r.en}`).join(" ");
    expect(text).not.toMatch(/\bsafe\b/i);
    expect(text).not.toMatch(/no flood risk|all clear/i);
  });
});

describe("a measured gauge never launders the scenario numbers", () => {
  const catastrophicScenario: VerdictInputs = {
    pm25_now: 18,
    pm25_fc_24h: 20,
    rain_fc_24h_mm: 0,
    rain_now_24h_mm: 180,
    ping_capacity_ratio: 0.99,
    reservoir_surge: true,
    fire_count: 0,
    wind_kmh: 10,
    provenance: "mixed",
    flood_provenance: "scenario",
  };

  it("keeps the scenario ratio, dam surge and rainfall silent beside a real gauge", () => {
    // This is the mixture hazard: a measured river level standing next to
    // an invented dam release and a fabricated 180 mm of rain. A
    // governor reading that would be reading two different worlds.
    const v = computeVerdict({ ...catastrophicScenario, ping_measured: measured() });
    const text = floodReasons(v).map((r) => r.en).join(" | ");
    expect(text).not.toMatch(/Ping river overflowing/);
    expect(text).not.toMatch(/dam releasing/);
    expect(text).not.toMatch(/180 mm/);
    // Only the real gauge speaks.
    expect(text).toMatch(/P\.1 is 2\.42 m below its bank level/);
  });

  it("scores exactly zero flood points for that same mixture", () => {
    // 40 + 15 + 10 = 65 points of fiction if any of it were believed.
    const v = computeVerdict({ ...catastrophicScenario, ping_measured: measured() });
    expect(v.score).toBe(0);
  });

  it("still lets the scenario numbers through when the module really is live", () => {
    const v = computeVerdict({ ...catastrophicScenario, flood_provenance: "live" });
    const text = floodReasons(v).map((r) => r.en).join(" | ");
    expect(text).toMatch(/Ping river overflowing/);
    expect(text).toMatch(/dam releasing/);
  });

  it("lets a real air reading dominate the headline over a quiet gauge", () => {
    const v = computeVerdict({
      ...silent,
      pm25_now: 155,
      flood_provenance: "scenario",
      ping_measured: measured(),
    });
    // The river is quiet, the air is not. A governor must be led by the
    // air, not reassured by the gauge.
    expect(v.level).not.toBe("safe");
    expect(v.reasons[0].domain).not.toBe("flood");
  });
});


describe("gauge observation freshness", () => {
  it("applies exact three-hour and five-minute boundaries before display rounding", () => {
    const now = Date.parse("2026-10-02T12:00:00Z");
    expect(isCurrentGaugeReading("2026-10-02T09:00:00Z", now)).toBe(true);
    expect(isCurrentGaugeReading("2026-10-02T08:59:59Z", now)).toBe(false);
    expect(isCurrentGaugeReading("2026-10-02T12:05:00Z", now)).toBe(true);
    expect(isCurrentGaugeReading("2026-10-02T12:05:01Z", now)).toBe(false);
  });
  it.each(["not-a-date", new Date(Date.now() - 13 * 3_600_000).toISOString(), new Date(Date.now() + 30 * 60_000).toISOString()])("cannot certify safe from %s", (observedAt) => {
    const v = computeVerdict({ ...silent, pm25_now: 10, ping_measured: measured({ observedAt }) });
    expect(v.level).toBe("watch");
    expect(v.score).toBe(0);
    expect(floodReasons(v).some((r) => r.isCaveat)).toBe(true);
  });
  it("does not escalate an old high gauge as a current flood", () => {
    const v = computeVerdict({ ...silent, pm25_now: 10, ping_measured: measured({ observedAt: new Date(Date.now() - 13 * 3_600_000).toISOString(), headroomM: -1, belowBankM: -1 }) });
    expect(v.score).toBe(0);
    expect(v.reasons.some((r) => r.en.includes("at or above"))).toBe(false);
  });
});
