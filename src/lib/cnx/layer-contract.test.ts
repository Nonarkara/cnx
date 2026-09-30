// CNX layer contract — enforcement tests.
//
// THE DEFECT THESE PREVENT
//
// A national flood map was formally contested in 2026-09 by a resident
// standing in floodwater whose own house was missing from the map, while
// vast irrigated paddies were painted as flood. The failure was
// two-sided: standing water counted as flood (commission) and real
// flooding omitted (omission), which compound — the false water makes
// the true water harder to see.
//
// A layer that does not declare how it treats permanent water will make
// that commission error silently. A layer that does not declare its
// validation status will look equally authoritative whether it has ever
// been checked against someone standing in the water or not.
//
// These tests make the declaration mandatory, and they pin the one fact
// we are currently required to admit.

import { describe, it, expect } from "vitest";
import {
  LAYER_CONTRACTS,
  contractGaps,
  getLayerContract,
  standingWaterWarning,
} from "./layer-contract";

describe("layer contract registry", () => {
  it("every registered layer declares measures, mustNotConclude, direction and source", () => {
    for (const [id, c] of Object.entries(LAYER_CONTRACTS)) {
      expect(c.id, `${id} id must match its key`).toBe(id);
      expect(c.measures.th.length, `${id} needs a Thai measures statement`).toBeGreaterThan(0);
      expect(c.measures.en.length, `${id} needs an English measures statement`).toBeGreaterThan(0);
      expect(c.mustNotConclude.th.length, `${id} needs a Thai boundary`).toBeGreaterThan(0);
      expect(c.mustNotConclude.en.length, `${id} needs an English boundary`).toBeGreaterThan(0);
      expect(["omission", "commission", "unknown"]).toContain(c.errorDirection);
      expect(["none", "cross-checked", "ground-truthed"]).toContain(c.validation);
      expect(c.source.length, `${id} needs a source attribution`).toBeGreaterThan(0);
    }
  });

  it("no layer may ship with an unhandled permanent-water axis and no warning", () => {
    for (const [id, c] of Object.entries(LAYER_CONTRACTS)) {
      if (c.permanentWater !== "unhandled") continue;
      // If we have NOT masked standing water, we MUST say so in words the
      // operator will read. This is the commission-error axis and it is
      // the exact defect the GISTDA letter describes.
      expect(c.standingWaterRisk, `${id} unhandled permanent water needs a stated risk`).not.toBeNull();
      expect(c.standingWaterRisk!.en.length).toBeGreaterThan(0);
      expect(c.standingWaterRisk!.th.length).toBeGreaterThan(0);
    }
  });

  it("never says 'validated' for a layer that has not been", () => {
    // Guards the specific overclaim we are most at risk of: presenting a
    // satellite classification with the authority of a measurement.
    for (const [id, c] of Object.entries(LAYER_CONTRACTS)) {
      if (c.validation !== "none") continue;
      expect(
        contractGaps(c).some((g) => g.includes("never validated")),
        `${id} with validation:none must be reported as a gap`,
      ).toBe(true);
    }
  });
});

describe("GISTDA flood extent — the contested layer", () => {
  const c = LAYER_CONTRACTS["gistda-flood-extent"];

  it("is registered and admits permanent water is unhandled", () => {
    expect(c).toBeDefined();
    expect(c.permanentWater).toBe("unhandled");
  });

  it("states the standing-water risk explicitly in both languages", () => {
    expect(c.standingWaterRisk?.en).toMatch(/standing water|perennial|irrigation/i);
    expect(c.standingWaterRisk?.th).toMatch(/น้ำท่วม/);
  });

  it("is admitted as never ground-truthed in Chiang Mai", () => {
    // This is the honest position today. It must stay visible until
    // someone actually checks it against a reported flood site.
    expect(c.validation).toBe("none");
  });

  it("forbids using absence from the layer as evidence of safety", () => {
    // The omission-error half. A map that misses flooded communities is
    // the failure in the letter; the corollary is that it must never be
    // read as "this area is fine".
    expect(c.mustNotConclude.en).toMatch(/safe/i);
  });

  it("does not claim to measure depth or damage", () => {
    expect(c.measures.en).toMatch(/not depth/);
  });
});

describe("contractGaps", () => {
  it("reports the commission axis for an unhandled layer", () => {
    const gaps = contractGaps(LAYER_CONTRACTS["gistda-flood-extent"]);
    expect(gaps.some((g) => g.includes("permanent water unhandled"))).toBe(true);
  });

  it("reports the validation gap honestly rather than hiding it", () => {
    const gaps = contractGaps(LAYER_CONTRACTS["rainfall-stations"]);
    expect(gaps.some((g) => g.includes("never validated"))).toBe(true);
  });

  it("is silent on the permanent-water axis for a measured layer", () => {
    const gaps = contractGaps(LAYER_CONTRACTS["ping-gauges"]);
    expect(gaps.some((g) => g.includes("permanent water unhandled"))).toBe(false);
  });
});

describe("getLayerContract", () => {
  it("returns null for an unknown layer rather than inventing one", () => {
    // Refusing is the point. An unknown layer must not get a default
    // contract that silently marks it as fine.
    expect(getLayerContract("not-a-real-layer")).toBeNull();
  });

  it("round-trips a registered layer", () => {
    expect(getLayerContract("reservoirs")?.id).toBe("reservoirs");
  });
});

describe("standingWaterWarning", () => {
  it("phrases the caveat as an upper bound, not a confirmed flood", () => {
    expect(standingWaterWarning("en")).toMatch(/upper bound/i);
    expect(standingWaterWarning("th")).toMatch(/ขอบเขตสูงสุด/);
  });
});
