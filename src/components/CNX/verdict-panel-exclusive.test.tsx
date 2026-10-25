// @vitest-environment happy-dom
//
// The evidence panel and the map's Layers control are exclusive overlays.
//
// The panel is right-anchored; the Layers control opens over the map's left
// column. With both open, the panel covered 95% of the basemap <select> at
// 390 px — the defect class docs/SHIP-AUDIT.md records as already paid for
// once. So opening one must close the other, and an overlay must never
// close itself.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VerdictBand } from "./CNXTopBar";
import CnxGlyphLegend from "./CNXGlyphLegend";
import { claimExclusiveOverlay, onExclusiveOverlay } from "../../lib/cnx/exclusive-overlay";
import { computeVerdict } from "../../lib/cnx/verdict";
import type { CnxTwinResponse } from "../../lib/cnx/twin";
import { __resetLangForTests } from "../../hooks/useLang";
import type { Lang } from "../../lib/i18n";

const inputs = { pm25_now: null, pm25_fc_24h: null, rain_fc_24h_mm: null, rain_now_24h_mm: null, ping_capacity_ratio: null, reservoir_surge: false, fire_count: null, wind_kmh: null, provenance: "mixed" as const, flood_provenance: "scenario" as const };

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  __resetLangForTests(null);
  vi.unstubAllGlobals();
});

let root: Root | null = null;

async function render(lang: Lang): Promise<HTMLDivElement> {
  __resetLangForTests(lang);
  const twin = { province_th: "เชียงใหม่", province_en: "Chiang Mai", verdict: { ...computeVerdict(inputs) } } as CnxTwinResponse;
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(VerdictBand, { twin, onOpenEmergency: () => {} })));
  return container;
}

/** Open the band's disclosure the way a reader does, and let React see it. */
async function openDisclosure(disclosure: HTMLDetailsElement): Promise<void> {
  await act(async () => {
    disclosure.open = true;
    disclosure.dispatchEvent(new Event("toggle"));
  });
}

describe("the evidence panel is an exclusive overlay", () => {
  it("closes when the map's Layers control opens", async () => {
    const container = await render("en");
    const disclosure = container.querySelector<HTMLDetailsElement>('[data-surface="cnx-verdict-band"] details')!;
    await openDisclosure(disclosure);
    expect(disclosure.open).toBe(true);

    // the map claims the overlay slot
    await act(async () => {
      claimExclusiveOverlay("map-layers");
    });
    expect(disclosure.open).toBe(false);
  });

  it("does not close itself when it claims the overlay slot", async () => {
    const container = await render("en");
    const disclosure = container.querySelector<HTMLDetailsElement>('[data-surface="cnx-verdict-band"] details')!;
    await openDisclosure(disclosure);
    await act(async () => {
      claimExclusiveOverlay("verdict-panel");
    });
    expect(disclosure.open).toBe(true);
  });

  it("leaves the panel closed when another overlay opens and it was never opened", async () => {
    const container = await render("en");
    const disclosure = container.querySelector<HTMLDetailsElement>('[data-surface="cnx-verdict-band"] details')!;
    await act(async () => {
      claimExclusiveOverlay("map-layers");
    });
    expect(disclosure.open).toBe(false);
  });
});

describe("the exclusive overlay agreement", () => {
  it("keeps the symbol key and expanded forecast mutually reachable", async () => {
    __resetLangForTests("en");
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(createElement(CnxGlyphLegend)));
    const key = container.querySelector("button")!;
    await act(async () => key.click());
    expect(key.getAttribute("aria-expanded")).toBe("true");
    await act(async () => claimExclusiveOverlay("forecast-panel"));
    expect(key.getAttribute("aria-expanded")).toBe("false");

    const closeForecast = vi.fn();
    const off = onExclusiveOverlay("forecast-panel", closeForecast);
    await act(async () => key.click());
    expect(key.getAttribute("aria-expanded")).toBe("true");
    expect(closeForecast).toHaveBeenCalledOnce();
    off();
  });
  it("closes only the overlays that are not the one claiming", () => {
    const closed: string[] = [];
    const offA = onExclusiveOverlay("verdict-panel", () => closed.push("verdict-panel"));
    const offB = onExclusiveOverlay("map-layers", () => closed.push("map-layers"));
    claimExclusiveOverlay("map-layers");
    expect(closed).toEqual(["verdict-panel"]);
    offA();
    offB();
    // after unsubscribing, a claim reaches nobody
    claimExclusiveOverlay("map-layers");
    expect(closed).toEqual(["verdict-panel"]);
  });

  it("works in the other direction too: the map stands down for the panel", () => {
    const closed: string[] = [];
    const off = onExclusiveOverlay("map-layers", () => closed.push("map-layers"));
    claimExclusiveOverlay("verdict-panel");
    expect(closed).toEqual(["map-layers"]);
    off();
  });
});
