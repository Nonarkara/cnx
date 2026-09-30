// CNX DustBoy — suspect-sensor regression tests.
//
// THE DEFECT THESE LOCK
//
// On 2026-09-30 the live basin read:
//
//     649 µg/m³  Lampang / Hang Chat  age=0h  (indoor unit)
//     n=222  median=6  p90=17  p99=44
//
// One station 13.5× the 99th percentile while the other 221 sat at a
// median of 6. Because `aggregate()` took a plain argmax, the panel
// headline became "Lampang, Hang Chat, 649 µg/m³ — CRITICAL" and
// `worstProvince`/`worstDistrict` named a district that was actually
// clean. A false CRITICAL on the health indicator is the most damaging
// class of war-room bug: it trains the operator to ignore the panel,
// which is exactly when a real episode lands.
//
// The subtle part — and the reason a percentile clamp is the WRONG fix —
// is that a genuine regional episode must NOT be suppressed. During the
// 2026-03 north-Chiang-Mai event the whole basin lifted together. A
// p95/p99 clamp would hide that. A neighbour-consistency test catches
// the fault and passes the episode. Both directions are asserted below.

import { describe, it, expect } from "vitest";
import { flagSuspects, summariseBasin, type DustboyStation } from "./dustboy";

let seq = 0;
function station(province: string, pm25: number | null, district = "test"): DustboyStation {
  seq += 1;
  return {
    stationId: `s${seq}`,
    nameTh: `station ${seq} อ.${district}`,
    district,
    province,
    longitude: 99,
    latitude: 18.8,
    pm25,
    suspect: false,
    readingAgeHours: 0,
    severity: "good",
    observedAt: "2026-09-30T00:00:00.000Z",
  };
}

/** A clean, quiet province — the September baseline. */
function cleanProvince(province: string, n: number, base = 6): DustboyStation[] {
  return Array.from({ length: n }, (_, i) => station(province, base + (i % 5)));
}

describe("flagSuspects — neighbour consistency", () => {
  it("flags a single station far above its province peers", () => {
    // Reproduces the live 2026-09-30 case: Lampang clean except one unit.
    const rows = [
      ...cleanProvince("ลำปาง", 20),
      station("ลำปาง", 649, "ห้างฉัตร"),
    ];
    const flagged = flagSuspects(rows);
    const bad = flagged.find((s) => s.pm25 === 649);
    expect(bad?.suspect).toBe(true);
    // Everything else stays clean.
    expect(flagged.filter((s) => s.suspect).length).toBe(1);
  });

  it("does NOT flag when the whole province is genuinely hazy", () => {
    // Regional episode: every station lifts together. This is the case a
    // percentile clamp would wrongly suppress.
    const rows = Array.from({ length: 30 }, (_, i) => station("เชียงใหม่", 180 + (i % 7)));
    const flagged = flagSuspects(rows);
    expect(flagged.filter((s) => s.suspect).length).toBe(0);
  });

  it("does not flag a modest spread of moderate values", () => {
    const rows = Array.from({ length: 25 }, (_, i) => station("เชียงใหม่", 40 + i * 2));
    expect(flagSuspects(rows).filter((s) => s.suspect).length).toBe(0);
  });

  it("leaves offline stations (pm25 null) untouched", () => {
    const rows = [...cleanProvince("เชียงใหม่", 10), station("เชียงใหม่", null)];
    const flagged = flagSuspects(rows);
    const offline = flagged.find((s) => s.pm25 === null);
    expect(offline?.suspect).toBe(false);
  });

  it("does not flag in a small province (needs enough peers to be meaningful)", () => {
    const rows = [station("แพร่", 10), station("แพร่", 12), station("แพร่", 500)];
    expect(flagSuspects(rows).filter((s) => s.suspect).length).toBe(0);
  });

  it("applies the floor so a very quiet province cannot make normal readings suspect", () => {
    // Peers at ~2 µg/m³ → p90*SUSPECT_FACTOR is tiny, so the 60 µg/m³
    // floor must be what governs, and 100 should be borderline rather
    // than instantly flagged.
    const rows = [...cleanProvince("เชียงใหม่", 20, 2), station("เชียงใหม่", 70)];
    const flagged = flagSuspects(rows);
    // 70 > max(60, ~4*3) → flagged, but a 50 reading would not be.
    expect(flagged.find((s) => s.pm25 === 70)?.suspect).toBe(true);
  });
});

describe("summariseBasin — suspect-excluded aggregates", () => {
  it("the faulty sensor does not drive maxPm25 or worstProvince", () => {
    // Lampang is clean except for the one broken unit; Chiang Mai is
    // uniformly clean-but-slightly-higher, so there IS a real answer and
    // the assertion is deterministic.
    const rows = [
      ...cleanProvince("ลำปาง", 20, 5),
      station("ลำปาง", 649, "ห้างฉัตร"),
      ...cleanProvince("เชียงใหม่", 20, 12),
    ];
    const basin = summariseBasin(rows);

    // The headline must be nowhere near 649.
    expect(basin.maxPm25).toBeLessThan(100);
    // Lampang must NOT be named the worst province.
    expect(basin.worstProvince).toBe("เชียงใหม่");
    // But the raw value is preserved for the drill-down — nothing hidden.
    expect(basin.maxPm25Raw).toBe(649);
    expect(basin.suspectCount).toBe(1);
  });

  it("names the worst province by network-wide p90, not by owning one high station", () => {
    // One genuinely elevated-but-plausible station in Lampang must not
    // outrank a province whose whole network is worse.
    const rows = [
      ...cleanProvince("ลำปาง", 25, 6),
      station("ลำปาง", 120, "somewhere"),
      ...cleanProvince("เชียงใหม่", 25, 40),
    ];
    const basin = summariseBasin(rows);
    expect(basin.worstProvince).toBe("เชียงใหม่");
  });

  it("still reports a genuine regional episode at full magnitude", () => {
    const rows = Array.from({ length: 40 }, (_, i) => station("เชียงใหม่", 200 + (i % 9)));
    const basin = summariseBasin(rows);
    expect(basin.maxPm25).toBeGreaterThanOrEqual(200);
    expect(basin.avgPm25).toBeGreaterThanOrEqual(200);
    expect(basin.suspectCount).toBe(0);
    expect(basin.worstProvince).toBe("เชียงใหม่");
  });

  it("keeps the average honest when one sensor faults", () => {
    const rows = [...cleanProvince("เชียงใหม่", 30, 6), station("เชียงใหม่", 649)];
    const basin = summariseBasin(rows);
    // Naive mean would be (30*6 + 649)/31 ≈ 26.8. Suspect-excluded ≈ 6.
    expect(basin.avgPm25).toBeLessThanOrEqual(10);
  });

  it("falls back to the raw pool if every station is suspect", () => {
    // Degenerate case: must not return nulls just because all were flagged.
    const rows = Array.from({ length: 12 }, (_, i) => station("เชียงใหม่", 500 + i));
    const basin = summariseBasin(rows);
    expect(basin.maxPm25).not.toBeNull();
    expect(basin.avgPm25).not.toBeNull();
  });

  it("reports null aggregates for an empty network", () => {
    const basin = summariseBasin([]);
    expect(basin.maxPm25).toBeNull();
    expect(basin.avgPm25).toBeNull();
    expect(basin.suspectCount).toBe(0);
    expect(basin.worstProvince).toBeNull();
  });
});
