// Test fixtures for the flood desk (pure lib tests and the panel's SSR test).
// Not imported by the app.

import fixture from "./dam-fixture.json";
import { selectDamRows, summariseDams } from "./dam-core";
import type { RiverGauge, RiverLevelResponse } from "./river-level";
import type { RainResponse } from "./rain";
import type { DamResponse } from "./dam";

export const NOW = Date.parse("2026-10-11T05:00:00Z");

export function gauge(over: Partial<RiverGauge> = {}): RiverGauge {
  return {
    id: "p1", code: "P.1", nameTh: "สะพานนวรัฐ", nameEn: "Nawarat Bridge", riverTh: "ปิง", basinTh: "ปิง",
    latitude: 18.79, longitude: 99.0, levelMsl: 301.5, belowBankM: 2.7, bankLevelMsl: 304.2, criticalLevelMsl: 304.2,
    headroomM: 2.7, keyStation: true, dischargeM3s: null, agency: "RID", severity: "watch",
    sourceSituationCode: null, sourceBankText: null, observedAt: "2026-10-11T04:30:00Z", ...over,
  };
}

export function riverOk(gauges: RiverGauge[]): RiverLevelResponse {
  return {
    generatedAt: new Date(NOW).toISOString(), provenance: "live", gauges, gaugeCount: gauges.length, pingMainstemCount: 1,
    catalogueCount: null, unavailableReason: null, observedAt: gauges[0]?.observedAt ?? null, note: "",
    credit: {} as RiverLevelResponse["credit"], legal: {} as RiverLevelResponse["legal"],
  };
}

export function damsOk(): DamResponse {
  return { ...summariseDams(selectDamRows(fixture), NOW), collectedAt: new Date(NOW).toISOString(), provenance: "live", source: "", note: "", unavailableReason: null };
}

const rainRow = {
  id: "r1", rain24h: 94.5, at: "2026-10-11 11:00", station: "s", amphoeTh: "จอมทอง", amphoeEn: "Chom Thong", tambonTh: "t",
  lat: 18.4, lon: 98.5, agency: "DWR", band: "very-heavy" as const, observedAt: "2026-10-11T04:00:00.000Z",
};

export function rainOk(mm = 94.5): RainResponse {
  return {
    generatedAt: new Date(NOW).toISOString(), collectedAt: new Date(NOW).toISOString(), stations: [{ ...rainRow, rain24h: mm }],
    bands: { none: 0, light: 0, moderate: 0, heavy: 0, "very-heavy": 1 }, wettest: null, districts: [], maxAgeHours: 6,
    provenance: "live", source: "", note: "",
  };
}
