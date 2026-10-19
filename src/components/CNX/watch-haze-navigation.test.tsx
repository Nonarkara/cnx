// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { __resetLangForTests } from "../../hooks/useLang";
import CnxApp from "./CNXApp";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("./CNXAboutModal", () => ({ default: () => null }));
vi.mock("./CNXTopBar", () => ({ default: () => null, VerdictStrip: () => null }));
vi.mock("../../lib/client-requests", () => ({ fetchJsonOrNull: async () => null, buildScenarioUrl: (url: string) => url }));
vi.mock("./CNXHazeModal", () => ({ default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => isOpen ? <div role="dialog" aria-label="Haze evidence"><button onClick={onClose}>Close haze evidence</button></div> : null }));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each([false, true])("opens all four haze evidence rows without changing the selected desk, desktop=%s", async desktop => {
  __resetLangForTests("en");
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: (query.includes("1280") || query.includes("1024")) && desktop, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true }));
  await act(async () => root.render(<CnxApp />));
  const selectedDesk = () => container.querySelector(desktop ? 'aside[aria-label="Operations desk"] [aria-pressed="true"]' : '[role="group"][aria-label="Switch panel"] [aria-pressed="true"]')?.textContent;
  const initialDesk = selectedDesk();
  expect(initialDesk).toBeDefined();
  for (const source of ["CAMS aerosol column (AOD 550)", "AERONET ground-truth AOD", "Smoke trajectory", "Haze webcam vision"]) {
    const action = [...container.querySelectorAll("button")].find(button => button.title === `${source} — open the supporting evidence`);
    expect(action, source).toBeDefined();
    await act(async () => action!.click());
    expect(container.querySelector('[role="dialog"][aria-label="Haze evidence"]')).not.toBeNull();
    expect(selectedDesk()).toBe(initialDesk);
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Close haze evidence")!.click());
  }
});
