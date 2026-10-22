// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CnxSocialSidebar from "./CNXSocialSidebar";
import { __resetLangForTests } from "../../hooks/useLang";
import type { SocialListeningResponse } from "../../types/cnx";

const { payload } = vi.hoisted(() => ({ payload: { current: null as SocialListeningResponse | null } }));
vi.mock("../../lib/client-requests", () => ({
  fetchJsonOrNull: async () => payload.current,
  buildScenarioUrl: (url: string) => url,
}));

const outcomes = {
  googleNewsTh: { state: "ok" as const, itemCount: 1 },
  googleNewsEn: { state: "ok" as const, itemCount: 1 },
  gdelt: { state: "ok" as const, itemCount: 0 },
};

function feed(items: SocialListeningResponse["items"]): SocialListeningResponse {
  return {
    generatedAt: new Date().toISOString(),
    items,
    counts: { th: items.filter((i) => i.lang === "th").length, en: items.filter((i) => i.lang === "en").length },
    provenance: "live",
    unavailableReason: null,
    sources: outcomes,
  };
}

const oneItem = feed([
  { id: "a", source: "google-news", lang: "th", title: "ข่าวหนึ่ง", url: "https://example.test/a", publishedAt: new Date().toISOString() },
  { id: "b", source: "gdelt", lang: "en", title: "News two", url: "https://example.test/b", publishedAt: new Date().toISOString() },
]);

let container: HTMLDivElement;
let root: Root;

async function render(initialData: SocialListeningResponse | null) {
  payload.current = initialData;
  await act(async () => root.render(createElement(CnxSocialSidebar, { scenarioId: null, initialData })));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  __resetLangForTests("en");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  __resetLangForTests(null);
  vi.unstubAllGlobals();
});

/** The element that scrolls the headlines, and the rail that holds it. */
function surfaces() {
  const rail = container.firstElementChild as HTMLElement;
  const list = [...rail.children].find((c) => (c.className || "").includes("overflow-y-auto")) as HTMLElement | undefined;
  return { rail, list };
}

describe("the news rail never becomes a window onto its own headlines", () => {
  it("does not clip the rail: the column scrolls instead of hiding the overflow", async () => {
    await render(oneItem);
    const { rail } = surfaces();
    // `overflow-hidden` here is what silently destroyed the list: 24 headlines
    // sat in a 30 px window with no way to reach them.
    expect(rail.className).not.toContain("overflow-hidden");
    expect(rail.className).toContain("overflow-y-auto");
  });

  it("keeps a usable floor under the list while there are headlines", async () => {
    await render(oneItem);
    const { list } = surfaces();
    expect(list).toBeDefined();
    expect(list!.className).toContain("min-h-[200px]");
  });

  it("does not pad an empty rail with 200 px of nothing", async () => {
    // The honest empty states ("this rail is blind, not empty") must not be
    // stretched into a box that claims there is room for news.
    await render(feed([]));
    const { list } = surfaces();
    expect(list).toBeDefined();
    expect(list!.className).not.toContain("min-h-[200px]");
  });

  it("states the item count the rail actually holds", async () => {
    await render(oneItem);
    expect(container.textContent).toContain("2 items");
  });
});
