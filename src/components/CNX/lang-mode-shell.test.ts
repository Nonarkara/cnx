// @vitest-environment happy-dom
//
// One language per mode (Palette slop pattern B3). In English mode the shell
// may show Thai only where the source data itself is Thai — place and
// shelter names, headlines, attribution lines — and in Thai mode the English
// interface strings must be gone. Rendered on the client because the server
// snapshot of the language store is always the Thai default.

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetLangForTests } from "../../hooks/useLang";
import { thaiCharCount, type Lang } from "../../lib/i18n";
import { buildExecutiveBrief } from "../../lib/cnx/executive-brief";
import { buildWatchList } from "../../lib/cnx/watch-list";
import type { ProvinceOutlook } from "../../lib/cnx/outlook";
import type { SheltersFile, Shelter } from "../../lib/cnx/shelters";
import type { DistrictOutlook } from "../../lib/cnx/wind-field-core";
import type { SocialListeningResponse } from "../../types/cnx";
import CnxWatchBoard from "./CNXWatchBoard";
import CnxOutlookPanel from "./CNXOutlookPanel";
import { DataAge } from "./CNXDataAge";
import CnxMetricEvidence from "./CNXMetricEvidence";
import CnxOperationalPulse from "./CNXOperationalPulse";
import CnxExecutiveOverview from "./CNXExecutiveOverview";
import CnxGovernorBrief from "./CNXGovernorBrief";
import CnxEmergencyModal from "./CNXEmergencyModal";
import CnxSocialSidebar from "./CNXSocialSidebar";
import CnxTicker from "./CNXTicker";

const NOW = Date.parse("2026-10-11T05:00:00Z");
const empty = { air: null, dustboy: null, fires: null, twin: null, riverGauges: [], flights: null };
const metrics = buildExecutiveBrief({ ...empty, now: new Date(NOW) }).metrics;

// Source data that exists only in Thai and is shown as published.
const MAE_RIM: DistrictOutlook = { nameTh: "แม่ริม", nameEn: "Mae Rim", rain6h: 20, rain24h: 62, rain48h: 80, peakRainMmH: 14.2, peakRainAt: NOW / 1000 + 6 * 3600, pm25Peak: 48, pm25PeakAt: NOW / 1000 + 9 * 3600 };
const SHELTER: Shelter = { id: "s1", nameTh: "โรงเรียนบ้านแม่ริม", amphoeTh: "แม่ริม", tambonTh: "ริมใต้", capacity: 300, electricity: true, water: true, toilets: 4, lat: 18.9, lon: 98.94, precision: "place", matchedName: null, osm: null };
const PUBLISHER = "ปภ.เชียงใหม่";
const OUTLOOK: ProvinceOutlook = {
  available: true,
  fetchedAt: new Date(NOW - 2 * 3_600_000).toISOString(),
  rain: [{ district: MAE_RIM, level: "alert", measured24h: 12.5, shelters: [SHELTER], shelterCapacity: 300, point: { lat: 18.9, lon: 98.94 } }],
  air: [{ district: MAE_RIM, level: "alert", peak: 48, peakAt: NOW / 1000 + 9 * 3600, point: { lat: 18.9, lon: 98.94 } }],
  wettest: MAE_RIM,
  dirtiest: MAE_RIM,
  hasPm25: true,
};
const SHELTERS: SheltersFile = { generatedAt: "2026-10-01T00:00:00Z", source: { publisher: PUBLISHER, datasetUrl: "", resourceUrl: "", fetchedAt: null }, geocoder: "osm", counts: { total: 1, place: 1, tambon: 0, amphoe: 0, none: 0 }, shelters: [SHELTER] };
const NEWS: SocialListeningResponse = {
  generatedAt: new Date(NOW - 5 * 60_000).toISOString(), provenance: "live", counts: { th: 1, en: 1 },
  items: [
    { id: "a", lang: "th", title: "ฝนตกหนักที่แม่ริม", source: "google-news", tone: "info", publishedAt: new Date(NOW - 30 * 60_000).toISOString() },
    { id: "b", lang: "en", title: "Heavy rain in Mae Rim", source: "google-news", tone: "info", publishedAt: new Date(NOW - 40 * 60_000).toISOString() },
  ],
} as SocialListeningResponse;

// Watch-list attribution lines come from lib/cnx/watch-list as one published
// string (often Thai) — data, not interface text.
const WATCH_SOURCES = buildWatchList({ metrics, firesRfd: null, aerosol: null, aeronet: null, jaxa: null, floodhub: null, gistda: null, smoke: null, hazeVision: null, dustboy: null, weatherLayers: null, riverGauges: [], rain: null, outlook: OUTLOOK })
  .systems.map((s) => s.source);
const WHITELIST = [SHELTER.nameTh, SHELTER.tambonTh!, PUBLISHER, NEWS.items[0].title, ...WATCH_SOURCES].sort((a, b) => b.length - a.length);

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  __resetLangForTests(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(lang: Lang, el: ReactElement): Promise<string> {
  __resetLangForTests(lang);
  await act(async () => root.render(el));
  return container.textContent ?? "";
}

/** Visible text plus labels a screen reader announces, minus whitelisted
 *  source data and the governor brief's LINE message (Thai by design). */
function englishModeResidue(): string {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("pre").forEach((el) => el.remove());
  const labels = Array.from(clone.querySelectorAll("[aria-label],[title]")).flatMap((el) => [el.getAttribute("aria-label") ?? "", el.getAttribute("title") ?? ""]);
  let text = [clone.textContent ?? "", ...labels].join(" ");
  for (const name of WHITELIST) text = text.split(name).join("");
  return text;
}

const SHELL: [name: string, el: () => ReactElement][] = [
  ["watch board", () => createElement(CnxWatchBoard, { metrics, firesRfd: null, aerosol: null, smoke: null, hazeVision: null, dustboy: null, weatherLayers: null, riverGauges: [], rain: null, outlook: OUTLOOK, onOpenMetric: vi.fn() })],
  ["outlook panel", () => createElement(CnxOutlookPanel, { outlook: OUTLOOK, shelters: SHELTERS, onShowOnMap: vi.fn() })],
  ["data age", () => createElement("div", null,
    createElement(DataAge, { observedAt: null, source: "DustBoy" }),
    createElement(DataAge, { observedAt: new Date(NOW - 90 * 60_000).toISOString(), source: "PCD" }),
    createElement(DataAge, { observedAt: new Date(NOW - 6 * 3_600_000).toISOString(), source: "ThaiWater" }))],
  ["metric evidence", () => createElement(CnxMetricEvidence, { metric: metrics[0] })],
  ["operational pulse", () => createElement(CnxOperationalPulse, { ...empty, onOpenMetric: vi.fn() })],
  ["executive overview", () => createElement(CnxExecutiveOverview, { ...empty, social: NEWS, onOpenMetric: vi.fn(), onOpenMap: vi.fn(), onOpenBrief: vi.fn(), onOpenEmergency: vi.fn(), onOpenData: vi.fn() })],
  ["governor brief", () => createElement(CnxGovernorBrief, { ...empty, isOpen: true, onClose: vi.fn(), outlook: OUTLOOK })],
  ["emergency numbers", () => createElement(CnxEmergencyModal, { isOpen: true, onClose: vi.fn() })],
  ["news rail", () => createElement(CnxSocialSidebar, { initialData: NEWS, scenarioId: null })],
  ["ticker", () => createElement(CnxTicker, { air: null, flood: null, story: null, flights: null, social: NEWS, cctv: { reachableCount: 2, totalCount: 3 } as never, fires: { provenance: "live", totalCount: 3, provinceCount: 0 } as never })],
];

describe("one language per mode — shell components", () => {
  it.each(SHELL)("%s shows no Thai interface text in English mode", async (_name, el) => {
    await render("en", el());
    const residue = englishModeResidue();
    expect(thaiCharCount(residue), residue).toBe(0);
  });

  it("the English-mode probe is not vacuous", async () => {
    await render("th", SHELL[0][1]());
    expect(thaiCharCount(englishModeResidue())).toBeGreaterThan(0);
    const en = await render("en", createElement("div", null, SHELL[0][1](), SHELL[1][1]()));
    expect(en).toContain("Watching now");
    expect(en).toContain("Next 48 hours");
  });

  it("watch board and outlook speak Thai only in Thai mode", async () => {
    const text = await render("th", createElement("div", null, SHELL[0][1](), SHELL[1][1]()));
    for (const en of ["Watching now", "All warning systems", "View evidence", "Next 48 hours", "Show on map", "Rain and flash floods", "Model forecast", "never an all-clear"]) {
      expect(text).not.toContain(en);
    }
    expect(text).toContain("ต้องเฝ้าระวังตอนนี้");
    expect(text).toContain("48 ชั่วโมงข้างหน้า");
    expect(text).toContain("อ.แม่ริม");
  });

  it("names the missing feed honestly in either language", async () => {
    const th = await render("th", SHELL[2][1]());
    expect(th).toContain("DustBoy · ไม่มีค่าสังเกต");
    expect(th).toContain("PCD · 90 นาทีก่อน");
    expect(th).toContain("ข้อมูลเก่า · 6 ชม.ก่อน");
    expect(th).not.toMatch(/no observation|min ago|stale/);
    const en = await render("en", SHELL[2][1]());
    expect(en).toContain("DustBoy · no observation");
    expect(en).toContain("PCD · 90 min ago");
    expect(en).toContain("stale · 6 h ago");
  });

  it("keeps the watch board's no-data chip in both languages", async () => {
    const th = await render("th", SHELL[0][1]());
    expect(th).toContain("ไม่มีข้อมูล");
    const en = await render("en", SHELL[0][1]());
    expect(en).toContain("No data");
    expect(en).toContain("Mae Rim");
  });

  it("keeps the LINE message Thai while the brief's chrome switches", async () => {
    const en = await render("en", SHELL[6][1]());
    expect(en).toContain("Copy Thai text for LINE");
    expect(container.querySelector("pre")?.textContent).toContain("สรุปสถานการณ์จังหวัดเชียงใหม่");
    const th = await render("th", SHELL[6][1]());
    expect(th).toContain("คัดลอกส่ง LINE");
    expect(th).not.toContain("Governor brief");
  });
});
