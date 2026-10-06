// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CnxExecutiveOverview from "./CNXExecutiveOverview";
import CnxGovernorBrief from "./CNXGovernorBrief";
import CnxMetricEvidence from "./CNXMetricEvidence";
import CnxFirePanel from "./CNXFirePanel";
import CnxSocialSidebar from "./CNXSocialSidebar";
import type { CnxFiresResponse, SocialListeningResponse } from "../../types/cnx";
import { buildExecutiveBrief } from "../../lib/cnx/executive-brief";

const empty = { air: null, dustboy: null, fires: null, twin: null, riverGauges: [], flights: null };
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("governor evidence paths", () => {
  it("does not count or badge other languages as English", async () => {
    const initialData = { generatedAt: "2026-10-07T00:00:00Z", provenance: "live", counts: { th: 1, en: 2 }, items: ["th", "en", "zh"].map(lang => ({
      id: lang, lang, title: lang, source: "google-news", tone: "info", publishedAt: "2026-10-07T00:00:00Z",
    })) } as SocialListeningResponse;
    await act(async () => root.render(createElement(CnxSocialSidebar, { initialData, scenarioId: null })));
    const labels = Array.from(container.querySelectorAll("button")).map(button => button.textContent?.replace(/\s/g, ""));
    expect(labels).toContain("TH1");
    expect(labels).toContain("EN1");
    expect(container.querySelectorAll("article")[2].textContent).toContain("ZH");
  });
  it("opens the satellite evidence first and distinguishes nearby detections", async () => {
    const firms = { generatedAt: "2026-10-07T00:00:00Z", provenance: "live", provinceCount: 0, totalCount: 1, hotspots: [
      { id: "outside", longitude: 100, latitude: 20, brightness: null, satellite: "NOAA-20", severity: "watch", confidence: 90, detectedAt: "2026-10-06T23:00:00Z" },
    ] } as CnxFiresResponse;
    await act(async () => root.render(createElement(CnxFirePanel, { firms, rfd: null, aerosol: null })));
    expect(container.textContent).toContain("ในจังหวัดเชียงใหม่ 0 จุด · นอกจังหวัดในพื้นที่ติดตาม 1 จุด");
    expect(container.textContent).toContain("นอกจังหวัดเชียงใหม่");
    expect(container.textContent).not.toContain("loading RFD");
    const selected = container.querySelector('button[aria-pressed="true"]');
    expect(selected?.textContent).toContain("FIRMS");
  });
  it("opens the relevant operational topic from every overview metric", async () => {
    const openMetric = vi.fn();
    const openMap = vi.fn();
    await act(async () => root.render(createElement(CnxExecutiveOverview, {
      ...empty, social: null, onOpenMetric: openMetric, onOpenMap: openMap,
      onOpenBrief: vi.fn(), onOpenEmergency: vi.fn(), onOpenData: vi.fn(),
    })));
    const cards = container.querySelectorAll("article");
    for (const card of cards) await act(async () => (card.querySelector("button") as HTMLButtonElement).click());
    expect(openMetric.mock.calls.map(call => call[0])).toEqual(["water", "air", "fire", "mobility"]);
    expect(openMap).not.toHaveBeenCalled();
  });

  it("also routes priority evidence links to their own topic", async () => {
    const openMetric = vi.fn();
    await act(async () => root.render(createElement(CnxExecutiveOverview, {
      ...empty, social: null, onOpenMetric: openMetric, onOpenMap: vi.fn(),
      onOpenBrief: vi.fn(), onOpenEmergency: vi.fn(), onOpenData: vi.fn(),
    })));
    const buttons = Array.from(container.querySelectorAll("ol button"));
    for (const button of buttons) await act(async () => (button as HTMLButtonElement).click());
    expect(openMetric.mock.calls.map(call => call[0])).toEqual(["water", "air", "fire", "mobility"]);
  });

  it("copies a public URL even when the brief is opened on localhost", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    await act(async () => root.render(createElement(CnxGovernorBrief, { ...empty, isOpen: true, onClose: vi.fn() })));
    const copy = Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes("คัดลอกส่ง LINE"))!;
    await act(async () => copy.click());
    const text = writeText.mock.calls[0][0];
    expect(text).toContain("https://cnx.nonarkara.org/cnx");
    expect(text).not.toMatch(/localhost|127\.0\.0\.1/);
    expect(text).toContain("ตรวจสอบ");
  });

  it("keeps missing evidence and the verification action visible in the desk", async () => {
    const metric = buildExecutiveBrief(empty).metrics[0];
    await act(async () => root.render(createElement(CnxMetricEvidence, { metric })));
    expect(container.textContent).toContain("ข้อมูลไม่เพียงพอ");
    expect(container.textContent).toContain(metric.actionTh);
    expect(container.textContent).toContain(metric.source);
    expect(container.textContent).not.toContain("ติดตามต่อเนื่อง");
    expect(container.querySelector("time")).toBeNull();
  });
});
