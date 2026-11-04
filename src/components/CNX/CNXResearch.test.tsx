// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
//
// The research tab: one language per mode, the PDF window and the phone
// fallback both present, and every figure comes from the stats it is given.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetLangForTests } from "../../hooks/useLang";
import { thaiCharCount } from "../../lib/i18n";
import CNXResearch, { PDF_URL, type ResearchStats } from "./CNXResearch";

const STATS: ResearchStats = {
  datasets: 311, resources: 2869, orgs: 45, unreadablePct: 41, spatial: 6, medianAge: 1.1, shelters: 177, shelterBuilding: 45,
  over20Pct: 50, towerSites: 6, towerMedianKm: 25, entities: 32, agencies: 29, buildDays: 36, onTime: 24, sloTotal: 25, pages: 9,
};

let host: HTMLElement;
let root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); __resetLangForTests(null); });

function render(lang: "th" | "en") {
  __resetLangForTests(lang);
  act(() => root.render(<CNXResearch stats={STATS} />));
  return host;
}

describe("research tab", () => {
  it("embeds the PDF and offers a page-image fallback with one image per page", () => {
    const el = render("en");
    expect(el.querySelector("iframe")?.getAttribute("src")).toContain(PDF_URL);
    expect(el.querySelectorAll("ol img")).toHaveLength(STATS.pages);
    expect([...el.querySelectorAll("a[download]")].some((a) => a.getAttribute("href") === PDF_URL)).toBe(true);
  });

  it("states the preprint status and the competing interests in both languages", () => {
    expect(render("en").textContent).toMatch(/not peer reviewed/i);
    expect(host.textContent).toMatch(/Competing interests/);
    expect(render("th").textContent).toContain("ผลประโยชน์ทับซ้อน");
  });

  it("English mode carries no Thai characters", () => {
    expect(thaiCharCount(render("en").textContent ?? "")).toBe(0);
  });

  it("Thai mode keeps English only for the paper's own title, authors, citation and file names", () => {
    const el = render("th");
    const strip = el.cloneNode(true) as HTMLElement;
    strip.querySelectorAll('[lang="en"], a[download], .font-mono').forEach((n) => n.remove());
    const latin = (strip.textContent ?? "").match(/\b[A-Za-z]{4,}\b/g) ?? [];
    const allowed = new Set(["Arkaraprasertkul", "Thiengburanathum", "Chiang", "Engineering", "CMU", "depa", "RCAD", "Smart", "City", "Thailand", "Claude", "CNX", "BibTeX", "Nov", "PDF", "Preprint", "LaTeX", "Non", "Poon", "Data", "AI"]);
    expect(latin.filter((w) => !allowed.has(w))).toEqual([]);
  });

  it("shows the numbers it was given, not constants", () => {
    const en = render("en").textContent ?? "";
    expect(en).toContain("311 datasets");
    expect(en).toContain("2,869 resources");
    expect(en).toContain("41% of resources could not be parsed");
    expect(en).toContain("0 of 177 shelter rows");
  });
});
