// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { __resetLangForTests } from "../../hooks/useLang";
import { WATER_CAMERAS, WATER_METHODOLOGY } from "../../lib/cnx/water-vision-core";
import type { WaterVisionResponse } from "../../lib/cnx/water-vision";
import CnxWaterVisionPanel from "./CNXWaterVisionPanel";
const NOW = Date.parse("2026-10-20T08:00:00Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const feed = (): WaterVisionResponse => ({ generatedAt: ago(1), provenance: "live", note: null, methodology: WATER_METHODOLOGY, cameras: WATER_CAMERAS.map(camera => ({ ...camera, observedAt: ago(44), collectedAt: ago(1), metrics: { meanLuminance: 0.5, contrast: 0.2, luminanceRange: 0.6 }, status: "inspectable", frameChanged: false, note: null })) });
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers(); vi.setSystemTime(NOW); __resetLangForTests("en"); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("re-ages captures without new payloads and never calls inspectable views flooded", async () => {
  await act(async () => root.render(<CnxWaterVisionPanel feed={feed()} />));
  expect(container.textContent).toContain("3 inspectable images");
  expect(container.textContent).toContain("not flood detection");
  expect([...container.querySelectorAll("time")].some(time => time.dateTime === ago(44))).toBe(true);
  expect(container.textContent).toContain("does not establish still water");
  await act(async () => vi.advanceTimersByTimeAsync(2 * 60_000));
  expect(container.textContent).toContain("0 inspectable images");
  expect(container.textContent).toContain("Stale capture");
});
it("rejects a stale batch even when its image timestamps are recent", async () => {
  const data = feed(); data.generatedAt = ago(46); data.cameras = data.cameras.map(camera => ({ ...camera, observedAt: ago(1) }));
  await act(async () => root.render(<CnxWaterVisionPanel feed={data} />));
  expect(container.textContent).toContain("0 inspectable images");
  expect(container.textContent).toContain("Analysis batch is stale or unavailable");
});
it.each(["en", "th"] as const)("keeps absent imagery neutral and credits the sources (%s)", async lang => {
  __resetLangForTests(lang);
  await act(async () => root.render(<CnxWaterVisionPanel feed={null} />));
  expect(container.textContent).toContain(lang === "en" ? "Capture time unknown" : "ไม่ทราบเวลาถ่าย");
  expect(container.querySelector('a[href="https://flood.nonarkara.org/"]')?.textContent).toContain("FloodDash");
  expect(container.querySelectorAll('a[href="https://telemetry.dwr.go.th/reportCctv"]')).toHaveLength(3);
  expect(container.textContent).not.toContain(lang === "en" ? "Safe roads" : "ถนนปลอดภัย");
});
it("recovers a failed preview without renewing its analysis and hands off the real map point", async () => {
  const onShowOnMap = vi.fn();
  await act(async () => root.render(<CnxWaterVisionPanel feed={feed()} onShowOnMap={onShowOnMap} />));
  const preview = container.querySelector("img")!;
  await act(async () => preview.dispatchEvent(new Event("error")));
  expect(container.textContent).toContain("Preview unavailable");
  expect(container.textContent).toContain("may differ from the analyzed frame");
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Retry preview")!.click());
  expect(container.querySelector("img")?.getAttribute("src")).toBe(WATER_CAMERAS[0].snapshotUrl);
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "View area on map")!.click());
  expect(onShowOnMap).toHaveBeenCalledWith({ lat: WATER_CAMERAS[0].latitude, lon: WATER_CAMERAS[0].longitude });
});
