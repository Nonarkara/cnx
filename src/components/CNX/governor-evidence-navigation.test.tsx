// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { __resetLangForTests } from "../../hooks/useLang";
import CnxApp from "./CNXApp";
import CnxGovernorBrief from "./CNXGovernorBrief";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("./CNXTopBar", () => ({ default: ({ onOpenBrief }: { onOpenBrief: () => void }) => <button onClick={onOpenBrief}>Open governor brief</button>, VerdictBand: () => null }));
vi.mock("../../lib/client-requests", () => ({ fetchJsonOrNull: async () => null, buildScenarioUrl: (url: string) => url }));
let container: HTMLDivElement;
let root: Root;
const empty = { air: null, dustboy: null, fires: null, twin: null, riverGauges: [], flights: null };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  __resetLangForTests("en");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("closes the brief before handing off each metric ID", async () => {
  const calls: string[] = [];
  await act(async () => root.render(<CnxGovernorBrief {...empty} isOpen onClose={() => calls.push("close")} onOpenMetric={id => calls.push(id)} />));
  const actions = [...container.querySelectorAll("button")].filter(button => button.textContent?.startsWith("Inspect evidence"));
  expect(actions).toHaveLength(4);
  for (const button of actions) await act(async () => button.click());
  expect(calls).toEqual(["close", "air", "close", "fire", "close", "water", "close", "mobility"]);
});
it.each([false, true])("hands off all four brief topics to the real operations shell, desktop=%s", async desktop => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: query.includes("1280") ? desktop : query.includes("1024") ? desktop : false, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true }));
  await act(async () => root.render(<CnxApp />));
  for (const [tileName, selected] of [["Air quality", "Air"], ["Wildfire / hotspots", "Fire"], ["Water", desktop ? "Water" : "Water & rain"], ["Aviation · historical", "Aviation"]]) {
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Open governor brief")!.click());
    const dialog = container.querySelector('[role="dialog"][aria-label="Governor brief"]')!;
    expect(dialog).not.toBeNull();
    const action = [...dialog.querySelectorAll("button")].find(button => button.textContent === `Inspect evidence · ${tileName}`)!;
    expect(action).toBeDefined();
    await act(async () => action.click());
    expect(container.querySelector('[role="dialog"][aria-label="Governor brief"]')).toBeNull();
    const group = container.querySelector(`[role="group"][aria-label="${desktop ? "Operations desk topics" : "Switch panel"}"]`)!;
    expect(group.querySelector('[aria-pressed="true"]')?.textContent?.trim()).toContain(selected);
    expect(document.activeElement?.id).toBe(desktop ? "operation-evidence" : "hazard-panels");
  }
});

it.each([false, true])("keeps camera sources available on demand, desktop=%s", async desktop => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: query.includes("1280") ? desktop : query.includes("1024") ? desktop : false, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true }));
  await act(async () => root.render(<CnxApp />));
  if (!desktop) await act(async () => [...container.querySelectorAll<HTMLButtonElement>('#hazard-panels button')].find(button => button.textContent?.trim() === "Water & rain")!.click());
  const host = desktop ? container.querySelector('[aria-label="Measured operational conditions"]')! : container.querySelector('#hazard-panels')!;
  const details = host.querySelector('details')!;
  expect(host.querySelector('[aria-label="CNX CCTV — all real cameras"]')).toBeNull();
  await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
  expect(host.querySelector('[aria-label="CNX CCTV — all real cameras"]')).not.toBeNull();
  await act(async () => { details.open = false; details.dispatchEvent(new Event("toggle")); });
  expect(host.querySelector('[aria-label="CNX CCTV — all real cameras"]')).toBeNull();
});
