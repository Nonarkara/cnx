// A civic board must not raise a flood alert on a number that cannot be a
// river.
//
// projectGauge accepted any finite `waterlevel_msl`. Dam storage and rain
// already carried MAX_PLAUSIBLE_* bounds; the river — the layer that drives
// the province's flood verdict — did not. A corrupt or mis-scaled reading
// (-9999, a datum error) became a river level, fed severityFor, and could
// move the headline. The rule is REJECT, never clamp: a missing reading is
// visibly missing, a clamped one is a lie.

import { describe, expect, it } from "vitest";
import {
  PLAUSIBLE_BANK_DELTA_M,
  PLAUSIBLE_DISCHARGE_MAX_M3S,
  PLAUSIBLE_LEVEL_MAX_MSL,
  projectGauge,
  severityFor,
} from "./river-level";
import type { UpstreamRow } from "./river-level";

/** P.1 at Nawarat Bridge: bank 304.2 m, today's observed level. */
const gauge = (over: Record<string, unknown> = {}): UpstreamRow =>
  ({
    waterlevel_msl: "301.5",
    waterlevel_datetime: "2026-10-12 09:00",
    discharge: "850",
    station: {
      id: 1234,
      station_code: "P.1",
      station_name_th: "สะพานนวรัฐ",
      tele_station_lat: "18.79",
      tele_station_long: "99.0",
      min_bank: "304.2",
      critical_level_msl: "304.2",
    },
    ...over,
  }) as unknown as UpstreamRow;

describe("an implausible river reading is rejected, never clamped", () => {
  it("accepts today's normal reading", () => {
    const g = projectGauge(gauge());
    expect(g?.levelMsl).toBe(301.5);
    expect(g?.severity).toBe("watch"); // 2.7 m below bank, 2.7 m headroom
  });

  it("rejects a negative level instead of publishing it", () => {
    expect(projectGauge(gauge({ waterlevel_msl: "-9999" }))).toBeNull();
  });

  it("rejects an absurdly high level", () => {
    expect(projectGauge(gauge({ waterlevel_msl: 99999 }))).toBeNull();
  });

  it("rejects a reading far above the top of the plausible band", () => {
    expect(projectGauge(gauge({ waterlevel_msl: PLAUSIBLE_LEVEL_MAX_MSL + 1 }))).toBeNull();
  });

  it("keeps a HIGH headwater gauge — FOP064 really reads 1183.78 m MSL", () => {
    // Measured live on 2026-10-12 from /api/cnx/river-level. A first pass
    // set the band at 1,000 m and would have deleted this station: the Ping
    // headwaters in northern Chiang Mai are above 1,000 m MSL. A constant
    // guessed from geography loses to geography.
    const headwater = gauge({
      waterlevel_msl: "1183.78",
      station: {
        id: 999, tele_station_oldcode: "FOP064", station_name_th: "ห้วงแม่ตอง",
        tele_station_lat: "19.05", tele_station_long: "98.1",
        min_bank: "1185.0", critical_level_msl: "1190.0",
      },
    });
    const g = projectGauge(headwater);
    expect(g?.code).toBe("FOP064");
    expect(g?.levelMsl).toBe(1183.78);
  });

  it("rejects a reading far from the station's OWN bank — a datum fault, not a flood", () => {
    // Bank 304.2. 350 m is 46 m above it: physically absurd for any Thai river.
    expect(projectGauge(gauge({ waterlevel_msl: "350" }))).toBeNull();
    expect(projectGauge(gauge({ waterlevel_msl: "250" }))).toBeNull();
  });

  it("still accepts a genuine over-the-bank flood reading", () => {
    // The real 2011-style event: several metres OVER the bank, not tens.
    const g = projectGauge(gauge({ waterlevel_msl: "310.5", critical_level_msl: "304.2" }));
    expect(g?.levelMsl).toBe(310.5);
    expect(g?.belowBankM).toBeCloseTo(-6.3, 1);
    expect(g?.severity).toBe("critical");
  });

  it("rejects an impossible discharge but keeps the reading's absence honest", () => {
    expect(projectGauge(gauge({ discharge: "99999999" }))).toBeNull();
  });

  it("keeps a null discharge rather than inventing one", () => {
    const g = projectGauge(gauge({ discharge: null }));
    expect(g?.dischargeM3s).toBeNull();
    expect(g?.levelMsl).toBe(301.5);
  });

  it("still accepts a reading whose station publishes no bank level", () => {
    const row = gauge();
    const st = { ...(row.station as Record<string, unknown>) } as Record<string, unknown>;
    delete st.min_bank;
    expect(projectGauge({ ...row, station: st } as unknown as UpstreamRow)?.levelMsl).toBe(301.5);
  });

  it("cannot be fooled into publishing a clamped value", () => {
    // If any bound were implemented by clamping, a garbage reading would
    // come back as a real level near the boundary. It must be null.
    for (const bad of ["-1", "-9999", "5000", "99999", String(PLAUSIBLE_LEVEL_MAX_MSL + 1000)]) {
      expect(projectGauge(gauge({ waterlevel_msl: bad }))).toBeNull();
    }
  });
});

describe("the bound does not change what a real event means", () => {
  it("severity is unchanged for readings inside the band", () => {
    expect(severityFor(10, 8)).toBe("good");
    expect(severityFor(2, 6)).toBe("watch");
    expect(severityFor(0.5, 3)).toBe("alert");
    expect(severityFor(0, 0)).toBe("critical");
  });

  it("the bank tolerance is wider than any observed Thai event", () => {
    // 2011 Ping peaked a few metres over bank; 50 m leaves a wide margin
    // while still catching a datum error, which is off by orders of
    // magnitude rather than metres.
    expect(PLAUSIBLE_BANK_DELTA_M).toBeGreaterThan(10); // 20 m is 3x the 2011 peak
    expect(PLAUSIBLE_DISCHARGE_MAX_M3S).toBeGreaterThan(20_000);
  });
});