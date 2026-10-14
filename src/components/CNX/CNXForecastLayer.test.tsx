// @vitest-environment happy-dom
//
// The moving marks on the map are the wind forecast. Rain is a colour wash
// that stays off until Rain is pressed. The bar has to say both, in the
// language of the current mode, or an operator reads the streaks as rain.

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetLangForTests } from "../../hooks/useLang";
import { thaiCharCount, type Lang } from "../../lib/i18n";
import type { ForecastField } from "../../lib/cnx/wind-field-core";
import type { ForecastFieldResponse } from "../../lib/cnx/wind-field";
import CNXForecastLayer from "./CNXForecastLayer";

const NOW = Date.parse("2026-10-11T05:00:00Z");

function flat(n: number): (number | null)[] {
  return [n, n, n, n];
}

// Eastward 2 m/s over a grid that covers the city readout point.
const FIELD: ForecastField = {
  grid: { lon0: 98.5, lat0: 18.4, d: 0.6, nx: 2, ny: 2 },
  times: [Math.floor(NOW / 1000)],
  u10: [flat(2)],
  v10: [flat(0)],
  u850: [flat(1)],
  v850: [flat(0)],
  precip: [flat(3.2)],
  pm25: [flat(40)],
};

const FORECAST: ForecastFieldResponse = {
  generatedAt: new Date(NOW).toISOString(),
  fetchedAt: new Date(NOW - 3_600_000).toISOString(),
  provenance: "model",
  source: "Open-Meteo",
  note: "Regional model on a 0.3 degree grid.",
  field: FIELD,
  outlook: [],
};

let container: HTMLDivElement;
let root: Root;

function stubMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  stubMotion(false);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  __resetLangForTests(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(lang: Lang, node: ReactElement = createElement(CNXForecastLayer, { map: null, mapReady: false, styleKey: "streets", forecast: FORECAST, tone: "dark" })): Promise<void> {
  __resetLangForTests(lang);
  await act(async () => root.render(node));
}

function note(): HTMLElement | null {
  return container.querySelector("[role='note']");
}

function press(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === label);
  if (!button) throw new Error(`no button ${label}`);
  button.click();
}

describe("forecast marks say wind and rain apart", () => {
  it("says the moving lines are wind, and rain is a colour wash, in English", async () => {
    await render("en");
    const text = note()?.textContent ?? "";
    expect(text).toContain("The moving lines are wind");
    expect(text).toContain("Surface wind, 10 m up");
    expect(text).toContain("The arrow at the city points where the air is going");
    expect(text).toContain("Rain is a colour wash. Press Rain to show it.");
    expect(text).not.toContain("The colour wash is rain");
    expect(container.textContent).toContain("Arrow points east, where the air is going.");
    expect(container.textContent).toContain("wind from the west");
    const labels = Array.from(container.querySelectorAll("[aria-label],[title]")).flatMap((el) => [el.getAttribute("aria-label") ?? "", el.getAttribute("title") ?? ""]);
    expect(thaiCharCount([container.textContent ?? "", ...labels].join(" "))).toBe(0);
  });

  it("says the same thing in Thai, without the English sentences", async () => {
    await render("th");
    const text = note()?.textContent ?? "";
    expect(text).toContain("เส้นที่เคลื่อนบนแผนที่คือลม");
    expect(text).toContain("ลมผิวพื้น สูง 10 เมตร");
    expect(text).toContain("ลูกศรที่ตัวเมืองชี้ไปทางที่อากาศไป");
    expect(text).toContain("ฝนเป็นสีบนแผนที่ กดปุ่มฝนเพื่อแสดง");
    expect(text).not.toContain("The moving lines are wind");
    expect(container.textContent).toContain("ลูกศรชี้ตะวันออก");
    expect(container.textContent).toContain("ลมจากตะวันตก");
  });

  it("names the colour wash as rain once Rain is on, and drops the press-Rain hint", async () => {
    await render("en");
    await act(async () => press("Rain"));
    const text = note()?.textContent ?? "";
    expect(text).toContain("The moving lines are wind");
    expect(text).toContain("The colour wash is rain");
    expect(text).toContain("millimetres per hour");
    expect(text).not.toContain("Press Rain to show it.");
    expect(container.textContent).toContain("Rain colour, mm/h");
  });

  it("hides the wind sentence when wind is off, and keeps the rain wash", async () => {
    await render("en");
    await act(async () => {
      press("Rain");
      press("Wind off");
    });
    const text = note()?.textContent ?? "";
    expect(text).not.toContain("The moving lines are wind");
    expect(text).toContain("The colour wash is rain");
    expect(container.textContent).not.toContain("Arrow points");
  });

  it("names the smoke-level wind when that layer is selected", async () => {
    await render("en");
    await act(async () => press("Smoke wind ~1.5 km"));
    expect(note()?.textContent).toContain("Smoke wind, about 1.5 km up");
    expect(note()?.textContent).not.toContain("Surface wind, 10 m up");
  });

  it("calls still lines wind when motion is reduced", async () => {
    stubMotion(true);
    await render("en");
    expect(note()?.textContent).toContain("The still lines are wind");
    expect(note()?.textContent).not.toContain("The moving lines are wind");
  });

  it("names the PM2.5 wash without calling it rain", async () => {
    await render("en");
    await act(async () => press("PM2.5"));
    const text = note()?.textContent ?? "";
    expect(text).toContain("The colour wash is PM2.5");
    expect(text).toContain("The lines remain the wind.");
    expect(text).not.toContain("The colour wash is rain");
  });
});
