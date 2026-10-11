// @vitest-environment happy-dom
// One language per mode (pattern B3) for the hazard panels: English mode
// carries no Thai beyond the published place/station names in the
// fixtures, and Thai mode carries none of the English interface strings.
// Honesty survives both modes: missing data still says so.
//
// vitest.config includes only *.test.ts, so lang-mode-hazards.run.test.ts
// imports this file to run it.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CnxRainPanel from "./CNXRainPanel";
import CnxRiverLevelPanel from "./CNXRiverLevelPanel";
import CnxAirQualityPanel from "./CNXAirQualityPanel";
import { __resetLangForTests } from "../../hooks/useLang";
import { thaiCharCount } from "../../lib/i18n";
import type { RainResponse } from "../../lib/cnx/rain";
import type { RiverLevelResponse } from "../../lib/cnx/river-level";

/** Published source names that stay Thai in either mode. */
const RAIN_STATION = "บ้านโป่งแยง";
const RIVER_STATION = "สะพานนวรัฐ";
const PUBLISHER_ABBR = "สทนช.";
const SOURCE_NAMES = [RAIN_STATION, RIVER_STATION, PUBLISHER_ABBR];

function thaiOutsideSourceNames(html: string): number {
  return thaiCharCount(SOURCE_NAMES.reduce((s, name) => s.split(name).join(""), html));
}

/** ThaiWater's "YYYY-MM-DD HH:mm" in Bangkok time, `minutesAgo` before now. */
function bangkokStamp(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000 + 7 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
}

function rainFixture(fresh: boolean): RainResponse {
  const at = bangkokStamp(fresh ? 30 : 60 * 12);
  return {
    provenance: "live",
    generatedAt: new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    source: "ThaiWater",
    note: "",
    maxAgeHours: 6,
    bands: { none: 0, light: 0, moderate: 0, heavy: 1, "very-heavy": 0 },
    wettest: null,
    districts: [],
    stations: [{
      id: "r1", rain24h: 48.5, at, station: RAIN_STATION, amphoeTh: "แม่ริม", amphoeEn: "Mae Rim", tambonTh: "โป่งแยง",
      lat: 18.9, lon: 98.8, agency: "HII", band: "heavy", observedAt: new Date().toISOString(),
    }],
  };
}

function riverFixture(provenance: "live" | "unavailable" = "live"): RiverLevelResponse {
  return {
    generatedAt: new Date().toISOString(),
    provenance,
    gauges: provenance === "live" ? [{
      id: "g1", code: "P.1", nameTh: RIVER_STATION, nameEn: null, riverTh: "แม่น้ำปิง", basinTh: "ลุ่มน้ำปิง",
      latitude: 18.79, longitude: 99.0, levelMsl: 302.1, belowBankM: 1.2, bankLevelMsl: 303.3, criticalLevelMsl: 304.2,
      headroomM: 2.1, keyStation: true, dischargeM3s: 85.4, agency: "RID", severity: "good", sourceSituationCode: null, sourceBankText: null,
      observedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    }] : [],
    gaugeCount: provenance === "live" ? 1 : 0,
    pingMainstemCount: 1,
    catalogueCount: 128,
    unavailableReason: provenance === "live" ? null : "upstream timeout",
    observedAt: provenance === "live" ? new Date(Date.now() - 20 * 60_000).toISOString() : null,
    note: "1 gauge in the Ping basin reported a reading.",
    credit: { publisher: `ThaiWater v3 — National Hydroinformatics Data Center (${PUBLISHER_ABBR})`, publisherUrl: "https://www.thaiwater.net", agencies: ["RID"] },
    legal: { intendedUse: "Public-goods flood situational awareness.", terms: "Observations remain the property of the publishing agencies." },
  };
}

function aqFixture() {
  return {
    cnAqi: { center: { lat: 18.8, lon: 99 }, bbox: [] },
    pm25: {
      provenance: "live", provenanceNote: null, observedAt: new Date().toISOString(), pm25: 62,
      pm25Avg24hrs: 55, pm25Aqi: 120, provinceAveragePm25: 48, severity: "alert",
      locName: { en: "Chiang Mai", th: "เชียงใหม่", ap_th: "เมืองเชียงใหม่", ap_en: "Mueang Chiang Mai" },
      amphoe: [{ ap_idn: "5001", ap_tn: "เมืองเชียงใหม่", ap_en: "Mueang Chiang Mai", pm25: 62, pm25Avg24hr: 55, severity: "alert" }],
      history24h: [{ pm25: 50, ts: new Date(Date.now() - 3_600_000).toISOString() }, { pm25: 62, ts: new Date().toISOString() }],
    },
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  __resetLangForTests(null);
});

async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
}

describe("rain panel — one language per mode", () => {
  it("English mode shows English interface and Thai only in the station name", async () => {
    __resetLangForTests("en");
    await render(<CnxRainPanel rain={rainFixture(true)} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Measured rain / 24h");
    expect(text).toContain("heavy rain");
    expect(text).toContain("Mae Rim");
    expect(text).toContain(RAIN_STATION);
    expect(thaiOutsideSourceNames(container.innerHTML)).toBe(0);
  });
  it("Thai mode carries none of the English interface strings", async () => {
    __resetLangForTests("th");
    await render(<CnxRainPanel rain={rainFixture(true)} />);
    const html = container.innerHTML;
    expect(html).toContain("ฝนที่วัดได้");
    expect(html).toContain("ฝนหนัก");
    for (const en of ["Measured rain", "heavy rain", "stations reporting", "Measured rainfall evidence", "station-owning agencies"]) expect(html).not.toContain(en);
  });
  it("still says that missing current data is not the same as no rain, in both modes", async () => {
    __resetLangForTests("en");
    await render(<CnxRainPanel rain={rainFixture(false)} />);
    expect(container.textContent).toContain("this is not the same as no rain");
    __resetLangForTests("th");
    await act(async () => root.unmount());
    root = createRoot(container);
    await render(<CnxRainPanel rain={rainFixture(false)} />);
    expect(container.textContent).toContain("ไม่ใช่ไม่มีฝน");
  });
});

describe("river panel — one language per mode", () => {
  it("English mode shows gauge evidence in English with the Thai station name as published", async () => {
    __resetLangForTests("en");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(riverFixture()))));
    await render(<CnxRiverLevelPanel />);
    const text = container.textContent ?? "";
    expect(text).toContain("Ping basin — gauge evidence");
    expect(text).toContain("1.20 m below bank");
    expect(text).toContain(RIVER_STATION);
    expect(thaiOutsideSourceNames(container.innerHTML)).toBe(0);
  });
  it("Thai mode carries none of the English interface strings", async () => {
    __resetLangForTests("th");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(riverFixture()))));
    await render(<CnxRiverLevelPanel />);
    const text = container.textContent ?? "";
    expect(text).toContain("ต่ำกว่าตลิ่ง 1.20 ม.");
    for (const en of ["Ping basin — gauge evidence", "below bank", "official critical level", "Gauge measurements", "observations", "Intended use"]) expect(text).not.toContain(en);
  });
  it("an unreadable feed is never presented as safe, in either mode", async () => {
    __resetLangForTests("en");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(riverFixture("unavailable")))));
    await render(<CnxRiverLevelPanel />);
    expect(container.textContent).toContain("not evidence that the river is safe");
    expect(container.textContent).toContain("Current river conditions are unverified");
  });
});

describe("air-quality panel — one language per mode", () => {
  it("English mode names districts in English and drops the Thai twin", async () => {
    __resetLangForTests("en");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(aqFixture()))));
    await render(<CnxAirQualityPanel />);
    const text = container.textContent ?? "";
    expect(text).toContain("Air quality · 1 district");
    expect(text).toContain("Mueang Chiang Mai");
    expect(thaiOutsideSourceNames(container.innerHTML)).toBe(0);
  });
  it("Thai mode names districts in Thai and drops the English twin", async () => {
    __resetLangForTests("th");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(aqFixture()))));
    await render(<CnxAirQualityPanel />);
    const text = container.textContent ?? "";
    expect(text).toContain("เมืองเชียงใหม่");
    expect(text).toContain("เตือนภัย");
    for (const en of ["Air quality", "Mueang Chiang Mai", "District", "24h trend", "ALERT", "not official AQI categories"]) expect(text).not.toContain(en);
  });
});
