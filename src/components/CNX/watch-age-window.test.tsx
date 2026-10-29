// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import CnxWatchBoard from "./CNXWatchBoard";
import type { WatchItem } from "../../lib/cnx/watch-list";

const state = vi.hoisted(() => ({ rows: [] as WatchItem[] }));
vi.mock("../../lib/cnx/watch-list", async importOriginal => ({
  ...await importOriginal<typeof import("../../lib/cnx/watch-list")>(),
  buildWatchList: () => ({ systems: state.rows, watch: state.rows, attentionCount: state.rows.length, gapCount: 0 }),
}));
vi.mock("../../hooks/useOfficialWarnings", () => ({ useOfficialWarnings: () => null }));
vi.mock("../../hooks/useLang", () => ({ useLang: () => ({ lang: "en", t: (_th: string, en: string) => en }) }));
vi.mock("../../lib/client-requests", () => ({ fetchJsonOrNull: async () => null }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("keeps valid daily/model/detection clocks readable without falsely calling them stale", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const now = new Date("2026-10-30T05:00:00Z");
  vi.setSystemTime(now);
  const cases = [
    { id: "fire", hours: 11, stale: false, kind: "satellite" as const },
    { id: "aeronet", hours: 18, stale: false, kind: "measured" as const },
    { id: "floodhub", hours: 6, stale: false, kind: "model" as const },
    { id: "air", hours: 4, stale: true, kind: "measured" as const },
    { id: "haze-vision", hours: 1, stale: true, kind: "vision" as const },
    { id: "jaxa-aot", hours: 73, stale: true, kind: "satellite" as const },
  ];
  state.rows = cases.map(({ id, hours, kind }): WatchItem => ({
    id, kind, domain: "haze", systemTh: id, systemEn: id, source: `${id} source`, level: "watch",
    valueTh: "Evidence", valueEn: "Evidence", evidenceTh: "Scope", evidenceEn: "Scope",
    actionTh: null, actionEn: null, observedAt: new Date(now.getTime() - hours * 3_600_000).toISOString(), openMetric: null,
  }));
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(CnxWatchBoard, { metrics: [], firesRfd: null,
      aerosol: null, smoke: null, hazeVision: null, dustboy: null, weatherLayers: null,
      riverGauges: [], rain: null, onOpenMetric: vi.fn(), now })));
    for (const selector of ['[aria-labelledby="watch-now"]', '[aria-labelledby="watch-systems"]']) {
      const rows = Array.from(container.querySelectorAll(`${selector} li`));
      for (const item of cases) {
        const row = rows.find(row => row.textContent?.includes(`${item.id} source`));
        expect(row, `${selector}: ${item.id}`).toBeDefined();
        const time = row!.querySelector("time");
        expect(time?.getAttribute("dateTime")).toBe(state.rows.find(row => row.id === item.id)!.observedAt);
        expect(time?.textContent?.includes("stale"), `${selector}: ${item.id}`).toBe(item.stale);
      }
    }
  } finally { await act(async () => root.unmount()); }
});
