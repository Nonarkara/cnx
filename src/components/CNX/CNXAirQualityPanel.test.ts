// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CnxAirQualityPanel from "./CNXAirQualityPanel";

let container: HTMLDivElement;
let root: Root;
function response(provenance: "live" | "unavailable" = "live") {
  return {
    cnAqi: { center: { lat: 18.8, lon: 99 }, bbox: [] },
    pm25: {
      provenance, provenanceNote: provenance === "unavailable" ? "The upstream source is unavailable." : null,
      observedAt: "2026-10-02T12:00:00Z", pm25: provenance === "live" ? 10 : null,
      pm25Avg24hrs: 12, pm25Aqi: 20, provinceAveragePm25: 13, severity: provenance === "live" ? "good" : "unknown",
      locName: { en: "Chiang Mai", th: "เชียงใหม่" }, amphoe: [],
      history24h: provenance === "live" ? [{ pm25: 10, ts: "2026-10-02T12:00:00Z" }] : [],
    },
  };
}
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
  await act(async () => root.render(createElement(CnxAirQualityPanel)));
}

describe("district air-quality failure and sparse data", () => {
  it("ends loading on an initial HTTP failure and lets the operator retry successfully", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(response())));
    vi.stubGlobal("fetch", fetch);
    await render();
    expect(container.textContent).toContain("readings unavailable");
    expect(container.textContent).not.toContain("Loading district");
    const retry = container.querySelector("button")!;
    expect(retry.disabled).toBe(false);
    await act(async () => retry.click());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Air quality");
    expect(container.textContent).toContain("GISTDA / Longdo");
  });
  it("renders a single observation with finite SVG coordinates and no claim of a trend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(response()))));
    await render();
    const chart = container.querySelector('svg[role="img"]')!;
    expect(chart.getAttribute("aria-label")).toContain("insufficient samples");
    expect(chart.querySelector("path")?.getAttribute("d")).not.toMatch(/NaN|Infinity/);
    expect(chart.querySelector("circle")?.getAttribute("cx")).toBe("100");
  });
  it("does not render clean-air numbers or a chart from an unavailable source", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(response("unavailable")))));
    await render();
    expect(container.textContent).toContain("upstream source is unavailable");
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    expect(container.textContent).not.toContain("OK");
  });
});
