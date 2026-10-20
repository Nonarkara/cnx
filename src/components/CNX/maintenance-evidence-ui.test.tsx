// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { __resetLangForTests } from "../../hooks/useLang";
import { fetchJsonOrNull } from "../../lib/client-requests";
import type { FloodHubResponse } from "../../lib/cnx/floodhub";
import * as briefLogic from "../../lib/cnx/governor-brief";
import CnxGovernorBrief from "./CNXGovernorBrief";
import CnxRainPanel from "./CNXRainPanel";
vi.mock("../../lib/client-requests", () => ({ fetchJsonOrNull: vi.fn() }));
const NOW = Date.parse("2026-10-20T08:00:00Z");
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers(); vi.setSystemTime(NOW); __resetLangForTests("en");
  vi.mocked(fetchJsonOrNull).mockReset().mockResolvedValue(null);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each(["en", "th"] as const)("does not describe absent rain indefinitely as loading (%s)", async lang => {
  __resetLangForTests(lang);
  await act(async () => root.render(<CnxRainPanel rain={null} />));
  expect(container.textContent).toContain(lang === "en" ? "No confirmed current rain data" : "ไม่มีข้อมูลฝนปัจจุบันที่ยืนยันได้");
  expect(container.textContent).not.toMatch(/Loading measured rainfall|กำลังอ่านข้อมูลฝน/);
});
const props = { onClose: vi.fn(), air: null, dustboy: null, fires: null, twin: null, riverGauges: [], flights: null };
const hub = (issuedTime: string): FloodHubResponse => ({ generatedAt: new Date(NOW).toISOString(), provenance: "live", outlook: "flooding", worst: "SEVERE", note: "", points: [{ gaugeId: "model", latitude: 18.8, longitude: 99, kmFromCity: 1, qualityVerified: false, severity: "SEVERE", trend: "RISE", issuedTime, forecastStart: new Date(NOW).toISOString(), forecastEnd: new Date(NOW + 24 * 3600_000).toISOString() }] });
it("does not carry successful Flood Hub evidence through a failed reopen", async () => {
  const tiles = vi.spyOn(briefLogic, "buildTiles");
  vi.mocked(fetchJsonOrNull).mockResolvedValueOnce(null).mockResolvedValueOnce(hub(new Date(NOW - 3600_000).toISOString())).mockResolvedValueOnce(null);
  await act(async () => root.render(<CnxGovernorBrief {...props} isOpen />));
  expect(tiles.mock.calls.at(-1)?.[0].floodForecast?.outlook).toBe("flooding");
  await act(async () => root.render(<CnxGovernorBrief {...props} isOpen={false} />));
  await act(async () => root.render(<CnxGovernorBrief {...props} isOpen />));
  expect(tiles.mock.calls.at(-1)?.[0].floodForecast).toBeNull();
  expect(container.textContent).toContain("Flood Hub");
  expect(container.textContent).toContain("unavailable");
});
it("does not renew an old forecast with a recent response timestamp", async () => {
  const tiles = vi.spyOn(briefLogic, "buildTiles");
  vi.mocked(fetchJsonOrNull).mockResolvedValueOnce(null).mockResolvedValueOnce(hub(new Date(NOW - 31 * 3600_000).toISOString())).mockResolvedValueOnce(null);
  await act(async () => root.render(<CnxGovernorBrief {...props} isOpen />));
  const water = tiles.mock.results.at(-1)?.value.find((tile: briefLogic.BriefTile) => tile.key === "water");
  expect(water?.th).not.toContain("Google คาดการณ์");
  expect(water?.en).toContain("No current Google river forecast");
  expect(container.textContent).toContain("No current Google Flood Hub forecast");
});

it("keeps operational evidence notes in the visible printable brief and Thai LINE copy", async () => {
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  await act(async () => root.render(<CnxGovernorBrief {...props} isOpen operationalNotes={[{ th: "ตรวจลำห้วย · ที่มา DWR", en: "Check local streams · source DWR" }]} />));
  const note = [...container.querySelectorAll("li")].find(row => row.textContent === "Check local streams · source DWR");
  expect(note).toBeDefined();
  expect(note?.closest(".print\\:hidden")).toBeNull();
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Copy Thai text"))!.click());
  expect(writeText.mock.calls[0][0]).toContain("ตรวจลำห้วย · ที่มา DWR");
});
