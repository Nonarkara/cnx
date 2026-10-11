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

/** Proper names, standards and identifiers the Thai standards and
 *  governance sections keep in Latin script. Longest first. */
const STANDARDS_NAMES = [
  "Centre for Digital Built Britain", "docs/DIGITAL-TWIN-STANDARDS.md", "Early Warnings for All", "Cloudflare Workers",
  "ISO/IEC 30173:2023", "ISO/IEC 30173", "Google Flood Hub", "/api/cnx/cap.xml", "Cell Broadcast", "ITU-T Y.4600",
  "Kritzinger", "NASA FIRMS", "Restricted", "Flood Hub", "Cloudflare", "ThaiWater", "DustBoy", "CAP 1.2", "Gemini", "GISTDA", "FIRMS", "UNDRR",
  "PM2.5", "RCAD", "LINE", "SMS", "URL", "WMO", "CAP", "IP",
].sort((a, b) => b.length - a.length);

/** Text of the About section whose kicker starts with `kicker`. */
function sectionText(kicker: string): string {
  const section = [...container.querySelectorAll("section")].find((s) => s.firstElementChild?.textContent?.startsWith(kicker));
  expect(section, `section ${kicker}`).toBeDefined();
  return section?.textContent ?? "";
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

  it("renders the standards, governance and privacy sections in English with no Thai", async () => {
    await render("en", <CNXAboutContent />);
    const text = sectionText("07 ·") + sectionText("08 ·");
    for (const phrase of [
      "Standards position",
      "Disaster risk knowledge",
      "What it does not do",
      "scope Restricted",
      "Official TMD warnings for Chiang Mai",
      "ITU-T Y.4600",
      "Gemini Principles",
      "docs/DIGITAL-TWIN-STANDARDS.md",
      "Governance and privacy",
      "To be assigned",
      "If the relay machine is down for 24 hours",
      "Personal Data Protection Act",
      "does not keep the images",
      "does not record who wrote them",
    ]) {
      expect(text).toContain(phrase);
    }
    expect(thaiCharCount(text)).toBe(0);
  });

  it("renders the standards, governance and privacy sections in Thai, keeping only names and identifiers in Latin script", async () => {
    await render("th", <CNXAboutContent />);
    const text = sectionText("07 ·") + sectionText("08 ·");
    for (const phrase of ["จุดยืนต่อมาตรฐาน", "สิ่งที่ไม่ทำ", "การกำกับดูแลและความเป็นส่วนตัว", "รอการแต่งตั้ง", "ถ้าเครื่องรีเลย์หยุดทำงาน 24 ชั่วโมง", "พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล"]) {
      expect(text).toContain(phrase);
    }
    let rest = text;
    for (const w of STANDARDS_NAMES) rest = rest.split(w).join(" ");
    expect(rest.match(/[A-Za-z]{2,}/g) ?? []).toEqual([]);
  });

  it("states the corrected digital-twin and relay facts (defects D1, D4, D6, D7)", async () => {
    await render("en", <CNXAboutContent />);
    const text = interfaceText();
    expect(text).toContain("not from the ISO standard");
    expect(text).toContain("control back to the physical world is optional, not required");
    expect(text).not.toMatch(/formalising a distinction|requires automatic two-way flow/);
    expect(text).not.toMatch(/early-to-mid maturity tier/);
    expect(text).toContain("There is one machine to watch");
    expect(text).not.toMatch(/no server to babysit/i);
    expect(text).toContain("RID’s daily dam report");
    expect(text).not.toMatch(/\b311\b/);
  });

  it("renders the About document without English section headings in Thai mode", async () => {
    await render("th", <CNXAboutContent />);
    const text = interfaceText();
    expect(text).toContain("กติกาความซื่อสัตย์");
    for (const english of ["The honesty rules", "Where the data comes from", "Architecture, in diagrams", "Download the documents", "Project Sponsor", "Standards position", "Governance and privacy", "To be assigned"]) {
      expect(text).not.toContain(english);
    }
  });
});
