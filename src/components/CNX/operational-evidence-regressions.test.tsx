// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { __resetLangForTests } from "../../hooks/useLang";
import { fetchJsonOrNull } from "../../lib/client-requests";
import type { CctvSlot } from "../../types/cnx";
import type { ProvinceOutlook } from "../../lib/cnx/outlook";
import CnxArrivalsPanel from "./CNXArrivalsPanel";
import CnxCctvModal from "./CNXCctvModal";
import CnxCctvStrip from "./CNXCctvStrip";
import CnxGovernorBrief from "./CNXGovernorBrief";
vi.mock("../../lib/client-requests", () => ({ fetchJsonOrNull: vi.fn() }));
let container: HTMLDivElement;
let root: Root;
const arrivals = { generatedAt: "2026-10-14T16:50:00Z", methodology: "Seats × 82% assumed load factor", days: [{ date: "2026-10-14", estimatedVisitors: 120, totalFlights: 2, domesticFlights: 1, internationalFlights: 1, byCountry: [] }] };
const camera = { id: "test", label: "Ping", source: "municipal", category: "flood", latitude: 18.8, longitude: 99, reachable: true, posterUrl: "https://example.test/camera.jpg", capturedAt: "2026-10-13T00:00:00Z" } as CctvSlot;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T16:59:50Z"));
  __resetLangForTests("en");
  vi.mocked(fetchJsonOrNull).mockReset().mockResolvedValue(null);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
it("ages day labels across Bangkok midnight and exposes failed refresh without nationality claims", async () => {
  vi.mocked(fetchJsonOrNull).mockResolvedValueOnce(arrivals);
  await act(async () => root.render(<CnxArrivalsPanel />));
  expect(container.textContent).toContain("Today");
  expect(container.textContent).toContain("est. international-arrival passengers");
  expect(container.textContent).not.toContain("overseas visitors");
  expect(container.textContent).toContain("not nationality or tourist counts");
  await act(async () => vi.advanceTimersByTimeAsync(15 * 60_000));
  expect(container.textContent).toContain("Yesterday");
  expect(container.textContent).not.toContain("Today");
  expect(container.textContent).toContain("Refresh failed");
  expect(container.querySelector("time")?.dateTime).toBe(arrivals.generatedAt);
});
it("ends a failed initial load and allows a successful retry", async () => {
  await act(async () => root.render(<CnxArrivalsPanel />));
  expect(container.textContent).toContain("Arrival data unavailable");
  vi.mocked(fetchJsonOrNull).mockResolvedValueOnce(arrivals);
  await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).toContain("120");
  expect(container.textContent).not.toContain("Arrival data unavailable");
});
it("shows capture time and stale status independently of snapshot refresh, with error recovery", async () => {
  await act(async () => root.render(<CnxCctvModal slot={camera} onClose={vi.fn()} />));
  expect(container.textContent).toContain("stale");
  expect(container.querySelector("time")?.dateTime).toBe(camera.capturedAt);
  const image = container.querySelector("img")!;
  expect(image.alt).not.toContain("Latest");
  await act(async () => image.dispatchEvent(new Event("error")));
  expect(container.textContent).toContain("Image failed to load");
  await act(async () => image.dispatchEvent(new Event("load")));
  expect(container.textContent).not.toContain("Image failed to load");
});
it("names missing camera capture time instead of implying freshness", async () => {
  await act(async () => root.render(<CnxCctvModal slot={{ ...camera, capturedAt: undefined }} onClose={vi.fn()} />));
  expect(container.textContent).toContain("Capture time unknown");
  expect(container.querySelector("time")).toBeNull();
});
it("keeps an open camera dialog outside a hidden responsive gallery and allows Escape", async () => {
  await act(async () => root.render(<CnxCctvStrip feed={{ generatedAt: new Date().toISOString(), slots: [camera], totalCount: 1, reachableCount: 1 }} />));
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  container.style.display = "none";
  const dialog = document.body.querySelector('[role="dialog"]');
  expect(dialog).not.toBeNull();
  expect(container.contains(dialog)).toBe(false);
  expect(dialog?.contains(document.activeElement)).toBe(true);
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  expect(document.body.style.overflow).not.toBe("hidden");
});
it("keeps modeled forecast actions in the visible printable brief and copied LINE text", async () => {
  const outlook: ProvinceOutlook = { available: true, fetchedAt: "2026-10-14T16:00:00Z", rain: [], air: [{ district: { nameTh: "แม่ริม", nameEn: "Mae Rim", rain6h: 0, rain24h: 0, rain48h: 0, peakRainMmH: 0, peakRainAt: null, pm25Peak: 90, pm25PeakAt: Date.now() / 1000 }, level: "alert", peak: 90, peakAt: Date.now() / 1000, point: { lat: 18.8, lon: 99 } }], wettest: null, dirtiest: null, hasPm25: true };
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  await act(async () => root.render(<CnxGovernorBrief isOpen onClose={vi.fn()} air={null} dustboy={null} fires={null} twin={null} riverGauges={[]} flights={null} outlook={outlook} />));
  const action = [...container.querySelectorAll("ol li")].find(el => el.textContent?.includes("48 h air (model)"));
  expect(action?.textContent).toContain("Mae Rim");
  expect(action?.closest(".print\\:hidden")).toBeNull();
  const copy = [...container.querySelectorAll("button")].find(el => el.textContent?.includes("Copy Thai text"))!;
  await act(async () => copy.click());
  expect(writeText.mock.calls[0][0]).toContain("48 ชม. ฝุ่น (แบบจำลอง)");
  expect(writeText.mock.calls[0][0]).toContain("แม่ริม");
});

it("replaces a known offline external player with a readable fallback and source link", async () => {
  const offline = { ...camera, source: "windy" as const, reachable: false, playerUrl: "https://example.test/player" };
  await act(async () => root.render(<CnxCctvModal slot={offline} onClose={vi.fn()} />));
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.textContent).toContain("Camera view unavailable");
  expect(container.textContent).toContain("cannot confirm current conditions");
  expect(container.textContent).toContain("stale");
  expect(container.querySelector("time")?.dateTime).toBe(camera.capturedAt);
  expect(container.querySelector('a[target="_blank"]')?.getAttribute("href")).toBe(offline.playerUrl);
  await act(async () => root.render(<CnxCctvModal slot={{ ...offline, reachable: true }} onClose={vi.fn()} />));
  expect(container.querySelector("iframe")?.src).toBe(offline.playerUrl);
});
