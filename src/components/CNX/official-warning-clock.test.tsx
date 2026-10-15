// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import CnxWatchBoard from "./CNXWatchBoard";
import type { OfficialWarningsResponse } from "../../lib/cnx/tmd-cap-core";

const state = vi.hoisted(() => ({ feed: null as OfficialWarningsResponse | null }));
vi.mock("../../hooks/useOfficialWarnings", () => ({ useOfficialWarnings: () => state.feed }));
vi.mock("../../hooks/useLang", () => ({ useLang: () => ({ lang: "en", t: (_th: string, en: string) => en }) }));
vi.mock("../../lib/client-requests", () => ({ fetchJsonOrNull: async () => null }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each(["expiry", "stale check", "return to screen"])("rechecks a retained warning on screen at %s without new data", async reason => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const start = Date.parse("2026-10-15T03:00:00Z");
  vi.setSystemTime(start);
  state.feed = {
    provenance: "live", fetchedAt: new Date(start - (reason !== "expiry" ? 39 : 0) * 60_000).toISOString(),
    alerts: [{ identifier: "clock", sent: new Date(start).toISOString(), effective: null,
      expires: new Date(start + (reason === "expiry" ? 1 : 60) * 60_000).toISOString(),
      event: "Heavy rain", headline_th: null, headline_en: "Heavy rain clock test", severity: "Severe", urgency: "Expected", certainty: "Likely",
      instruction_th: null, instruction_en: null, web: null, areaDesc: "Chiang Mai", areaDesc_th: null, areaDesc_en: null, geocodeMatch: true, polygons: [],
    }], reason: null, reason_th: null, documentsRead: 1, documentsListed: 1, source: "TMD · CAP 1.2",
  };
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(CnxWatchBoard, { metrics: [], firesRfd: null, aerosol: null, smoke: null, hazeVision: null, dustboy: null, weatherLayers: null, riverGauges: [], rain: null, onOpenMetric: vi.fn() })));
    const official = () => container.querySelector('section[aria-labelledby="watch-official"]')?.textContent;
    expect(official()).toContain("Heavy rain clock test");
    await act(async () => {
      if (reason === "return to screen") {
        vi.setSystemTime(start + 2 * 60_000);
        window.dispatchEvent(new Event("focus"));
      } else await vi.advanceTimersByTimeAsync(2 * 60_000);
    });
    expect(official()).not.toContain("Heavy rain clock test");
    expect(official()).toContain(reason === "expiry" ? "No TMD warning in force" : "TMD warnings unavailable");
  } finally { await act(async () => root.unmount()); }
});
