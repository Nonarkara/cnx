// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CnxOpenData from "./CNXOpenData";

const catalogue = {
  generatedAt: "2026-10-02T12:00:00Z", fetched: 1, totalDatasets: 1,
  datasets: [{ id: "water", titleEn: "Water quality", publisher: "Water agency", tags: ["water"], format: "CSV", url: "https://data.go.th/dataset/water" }],
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(createElement(CnxOpenData)));
}
describe("open-data search and failure", () => {
  it("shows no matches rather than unrelated publisher records for an empty search result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(catalogue))));
    await render();
    expect(container.textContent).toContain("Water quality");
    const input = container.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "missing-dataset");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("No datasets match");
    expect(container.textContent).not.toContain("Water quality");
  });
  it("ends its loading placeholder on source failure and retries without a page reload", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(catalogue)));
    vi.stubGlobal("fetch", fetch);
    await render();
    expect(container.textContent).toContain("Catalogue unavailable");
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    await act(async () => container.querySelector("button")!.click());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Water quality");
  });
});
