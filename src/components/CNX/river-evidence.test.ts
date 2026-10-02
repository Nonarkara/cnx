import { describe, expect, it } from "vitest";
import { gaugeEvidence } from "./CNXRiverLevelPanel";
import type { RiverGauge } from "../../lib/cnx/river-level";
const NOW = Date.parse("2026-10-02T12:00:00Z");
const gauge = (over: Partial<RiverGauge> = {}): RiverGauge => ({ observedAt: "2026-10-02T11:45:00Z", belowBankM: 0.8, headroomM: -0.2, criticalLevelMsl: 304.2, ...over }) as RiverGauge;
describe("human-readable river evidence", () => {
  it("distinguishes critical threshold exceedance from bank overtopping", () => {
    const evidence = gaugeEvidence(gauge(), NOW);
    expect(evidence.bank).toBe("0.80 m below bank");
    expect(evidence.critical).toBe("0.20 m above official critical level");
    expect(evidence.current).toBe(true);
  });
  it("keeps unknown bank geometry unknown even with a critical threshold", () => {
    expect(gaugeEvidence(gauge({ belowBankM: null }), NOW).bank).toBe("Bank relation unknown");
    expect(gaugeEvidence(gauge({ headroomM: null }), NOW).critical).toBe("Critical threshold relation unknown");
  });
  it("uses words for at-bank and above-bank readings rather than ambiguous signs", () => {
    expect(gaugeEvidence(gauge({ belowBankM: 0 }), NOW).bank).toBe("At published bank level");
    expect(gaugeEvidence(gauge({ belowBankM: -0.1 }), NOW).bank).toBe("0.10 m above bank");
  });
  it("does not present stale, future or invalid observations as current", () => {
    for (const observedAt of ["2026-10-02T01:00:00Z", "2026-10-02T13:00:00Z", "bad-date"]) expect(gaugeEvidence(gauge({ observedAt }), NOW).current).toBe(false);
    expect(gaugeEvidence(gauge(), null).current).toBe(false);
  });
});
