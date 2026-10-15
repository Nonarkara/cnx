// @vitest-environment happy-dom
//
// The official TMD row on the rendered watch board: first, framed apart,
// one language per mode, and "no warning" never shown as a green normal.

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetLangForTests } from "../../hooks/useLang";
import { __resetOfficialWarningsForTests } from "../../hooks/useOfficialWarnings";
import { thaiCharCount, type Lang } from "../../lib/i18n";
import type { OfficialWarningsResponse } from "../../lib/cnx/tmd-cap-core";
import CnxWatchBoard from "./CNXWatchBoard";

const NOW = Date.parse("2026-10-11T05:00:00Z");
const FEED_LIVE = (alerts: OfficialWarningsResponse["alerts"]): OfficialWarningsResponse => ({
  provenance: "live", fetchedAt: new Date(NOW - 5 * 60_000).toISOString(), alerts, reason: null, reason_th: null, documentsRead: 11, documentsListed: 11, source: "TMD · CAP 1.2",
});
const ALERT: OfficialWarningsResponse["alerts"][number] = {
  identifier: "TMD20261011090000_2", sent: "2026-10-11T05:00:00+07:00", effective: "2026-10-11T06:00:00+07:00", expires: "2026-10-11T18:00:00+07:00",
  event: "Heavy Rain", headline_th: "พื้นที่เสี่ยงภัยฝนตกหนัก", headline_en: "Heavy Rain Risk Area", severity: "Severe", urgency: "Expected", certainty: "Likely",
  instruction_th: "ระวังน้ำท่วมฉับพลัน", instruction_en: "Beware of flash floods", web: null, areaDesc: "เชียงใหม่", areaDesc_th: "เชียงใหม่ ลำพูน", areaDesc_en: "Chiang Mai Lamphun",
  geocodeMatch: true, polygons: [],
};

let container: HTMLDivElement;
let root: Root;
function serve(feed: OfficialWarningsResponse | null) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
    String(input).includes("/api/cnx/official-warnings") && feed ? new Response(JSON.stringify(feed), { status: 200, headers: { "Content-Type": "application/json" } }) : new Response("unavailable", { status: 503 })));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  __resetOfficialWarningsForTests();
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

async function render(lang: Lang): Promise<HTMLElement> {
  __resetLangForTests(lang);
  // `now` must be injected. buildWatchList falls back to the wall clock
  // when it is absent, and `vi.spyOn(Date, "now")` does NOT change what
  // `new Date()` returns — so without this the board read real time and
  // ALERT (expires 2026-10-11T18:00+07:00) silently flipped from "in
  // force" to "expired" the moment that wall-clock minute passed. These
  // tests are wall-clock independent only because of this argument.
  const el = createElement(CnxWatchBoard, { metrics: [], firesRfd: null, aerosol: null, smoke: null, hazeVision: null, dustboy: null, weatherLayers: null, riverGauges: [], rain: null, onOpenMetric: vi.fn(), now: new Date(NOW) });
  await act(async () => root.render(el));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return container;
}

/** The official frame is the first block after the board header. */
const officialFrame = (c: HTMLElement) => c.querySelector('section[aria-labelledby="watch-official"]') as HTMLElement;

describe("official TMD row on the watch board", () => {
  it("leads the board with the alert, in Thai only in Thai mode", async () => {
    serve(FEED_LIVE([ALERT]));
    const c = await render("th");
    const frame = officialFrame(c);
    expect(c.textContent?.indexOf("ประกาศทางการ · กรมอุตุนิยมวิทยา")).toBeLessThan(c.textContent?.indexOf("ต้องเฝ้าระวังตอนนี้") ?? 0);
    expect(frame.textContent).toContain("พื้นที่เสี่ยงภัยฝนตกหนัก");
    expect(frame.textContent).toContain("ระวังน้ำท่วมฉับพลัน");
    expect(frame.textContent).not.toMatch(/Heavy Rain Risk Area|Official warning/);
    expect(frame.firstElementChild?.nextElementSibling?.className).toContain("border-[var(--sev-alert)]");
  });

  it("opens the original official document for verification", async () => {
    serve(FEED_LIVE([{ ...ALERT, web: "https://www.tmd.go.th/warnings/example" }]));
    const frame = officialFrame(await render("en"));
    const link = frame.querySelector<HTMLAnchorElement>('a[href="https://www.tmd.go.th/warnings/example"]');
    expect(link?.textContent).toContain("Read official warning");
    expect(link?.rel).toContain("noopener");
  });

  it("shows the English alert with no Thai in English mode", async () => {
    serve(FEED_LIVE([ALERT]));
    const frame = officialFrame(await render("en"));
    expect(frame.textContent).toContain("Official warning · Thai Meteorological Department");
    expect(frame.textContent).toContain("Heavy Rain Risk Area");
    expect(thaiCharCount(frame.textContent ?? "")).toBe(0);
  });

  it("says no TMD warning is in force, on a neutral chip", async () => {
    serve(FEED_LIVE([]));
    const frame = officialFrame(await render("th"));
    expect(frame.textContent).toContain("ไม่มีประกาศ TMD ที่มีผลสำหรับเชียงใหม่");
    expect(frame.textContent).not.toContain("ปกติ");
    expect(frame.querySelector(".sev-fill-good")).toBeNull();
  });

  it("shows unavailable when the route cannot be read", async () => {
    serve(null);
    const frame = officialFrame(await render("en"));
    expect(frame.textContent).toContain("TMD warnings unavailable");
    expect(frame.textContent).toContain("No data");
  });
});
