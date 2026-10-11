// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
//
// One language per mode (Palette B3) for the information surfaces: the
// manual, the About document, and the arrivals / outbound flight panels.
// English mode must carry no Thai characters; Thai mode must carry no
// English interface words — only whitelisted source data (country names
// as OpenSky publishes them, agency/product names, codes and identifiers).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetLangForTests } from "../../hooks/useLang";
import { thaiCharCount, type Lang } from "../../lib/i18n";
import type { OutboundAnalysis } from "../../lib/cnx/outbound";
import CnxManualModal from "./CNXManualModal";
import CnxArrivalsPanel from "./CNXArrivalsPanel";
import CnxOutboundPanel from "./CNXOutboundPanel";
import CNXAboutContent from "./CNXAboutContent";

const ARRIVALS = {
  generatedAt: "2026-10-11T03:00:00Z",
  methodology:
    "International arrivals at VTCC (Chiang Mai Intl). Visitor counts are estimated as seat capacity × 82% assumed load factor — flight counts and origin countries are real observed data; passenger counts are not.",
  days: ["2026-10-11", "2026-10-10", "2026-10-09"].map((date, i) => ({
    date,
    totalFlights: 40 - i,
    internationalFlights: 12 - i,
    domesticFlights: 28,
    estimatedVisitors: 2100 - i * 100,
    byCountry: [
      { country: "China", flights: 5, estimatedVisitors: 900 },
      { country: "South Korea", flights: 3, estimatedVisitors: 560 },
      { country: "Japan", flights: 2, estimatedVisitors: 310 },
    ],
  })),
};

const bySize = { heavy: 0, wide: 0, narrow: 3, regional: 0 };
const OUTBOUND: OutboundAnalysis = {
  generatedAt: "2026-10-11T03:00:00Z",
  totalAirborne: 7,
  totalGround: 2,
  byQuadrant: [
    { quadrant: "south", headingMidDeg: 180, count: 4, topOrigins: [{ country: "Thailand", count: 3 }, { country: "China", count: 1 }], bySize },
    { quadrant: "north", headingMidDeg: 0, count: 2, topOrigins: [{ country: "Thailand", count: 2 }], bySize },
    { quadrant: "stationary", headingMidDeg: 0, count: 1, topOrigins: [], bySize },
  ],
  inferredTopDestination: "Bangkok (BKK) / Gulf",
  distinctOriginCountries: 2,
};

/** Source data and identifiers that legitimately stay in Latin script in
 *  Thai mode. Longest first so multi-word names strip before their parts. */
const SOURCE_WHITELIST = [
  "Google News RSS", "Google Flood Hub", "OpenSky Network", "NASA FIRMS", "VIIRS SNPP", "South Korea",
  "cnx.nonarkara.org", "data.go.th", "/states/all", "Open-Meteo", "Copernicus", "ThaiWater", "NOAA-20",
  "GDELT", "Longdo", "iTIC", "Windy", "CKAN", "CAMS", "PM2.5", "VTCC", "BKK",
  "Thailand", "China", "Japan", "ESC", "Esc",
].sort((a, b) => b.length - a.length);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/cnx/arrivals")) return new Response(JSON.stringify(ARRIVALS));
      if (String(url).includes("/api/cnx/snapshot-trend")) return new Response(JSON.stringify({ days: 7, totalSnapshots: 42 }));
      return new Response("unavailable", { status: 503 });
    }),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  __resetLangForTests(null);
  vi.unstubAllGlobals();
});

async function render(lang: Lang, node: React.ReactNode) {
  __resetLangForTests(lang);
  await act(async () => root.render(node));
  // Let the panels' fetches resolve and re-render.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** Visible text plus the accessible names and tooltips a reader meets. */
function interfaceText(): string {
  const attrs = [...container.querySelectorAll("[aria-label],[title],[alt],[placeholder]")].flatMap((el) =>
    ["aria-label", "title", "alt", "placeholder"].map((a) => el.getAttribute(a) ?? ""),
  );
  return [container.textContent ?? "", ...attrs].join(" \n ");
}

function latinLeftAfterWhitelist(text: string): string[] {
  let rest = text.replace(/\?scenario=[a-z-]+/g, " ");
  for (const w of SOURCE_WHITELIST) rest = rest.split(w).join(" ");
  // Single letters are keyboard keys (S, M) and compass suffixes (°N, °E).
  return rest.match(/[A-Za-z]{2,}/g) ?? [];
}

const PANELS = (
  <>
    <CnxArrivalsPanel />
    <CnxOutboundPanel snapshot={OUTBOUND} />
  </>
);

describe("one language per mode — information surfaces", () => {
  it("renders the manual with no Thai characters in English mode", async () => {
    await render("en", <CnxManualModal isOpen onClose={() => {}} />);
    const text = interfaceText();
    expect(text).toContain("CNX Dashboard Manual");
    expect(thaiCharCount(text)).toBe(0);
  });

  it("renders the manual with no English interface words in Thai mode", async () => {
    await render("th", <CnxManualModal isOpen onClose={() => {}} />);
    const text = interfaceText();
    expect(text).toContain("คู่มือห้องปฏิบัติการเชียงใหม่");
    expect(latinLeftAfterWhitelist(text)).toEqual([]);
  });

  it("renders arrivals and outbound panels with no Thai characters in English mode", async () => {
    await render("en", PANELS);
    const text = interfaceText();
    expect(text).toContain("Overseas Arrivals — VTCC");
    expect(text).toContain("Bangkok (BKK) / Gulf");
    expect(text).toContain("82% assumed load factor");
    expect(thaiCharCount(text)).toBe(0);
  });

  it("renders arrivals and outbound panels in Thai, keeping only source data in Latin script", async () => {
    await render("th", PANELS);
    const text = interfaceText();
    expect(text).toContain("ผู้โดยสารต่างชาติขาเข้า");
    expect(text).toContain("อัตราบรรทุกสมมติ 82%");
    expect(text).toContain("กรุงเทพฯ (BKK) / อ่าวไทย");
    expect(text).toContain("China");
    expect(latinLeftAfterWhitelist(text)).toEqual([]);
  });

  it("renders the About document entirely in English in English mode", async () => {
    await render("en", <CNXAboutContent />);
    const text = interfaceText();
    expect(text).toContain("The honesty rules");
    expect(text).toContain("Diagram 1 · Five different fallback shapes");
    expect(thaiCharCount(text)).toBe(0);
  });

  it("renders the About document without English section headings in Thai mode", async () => {
    await render("th", <CNXAboutContent />);
    const text = interfaceText();
    expect(text).toContain("กติกาความซื่อสัตย์");
    for (const english of ["The honesty rules", "Where the data comes from", "Architecture, in diagrams", "Download the documents", "Project Sponsor"]) {
      expect(text).not.toContain(english);
    }
  });
});
