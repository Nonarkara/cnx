// @vitest-environment happy-dom
// The board states its situation once. The verdict used to live in the news
// rail AND behind a closed disclosure below the board; the band replaced
// both, and this pins the "exactly one" contract so a second surface cannot
// creep back in.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { __resetLangForTests } from "../../hooks/useLang";
import CnxApp from "./CNXApp";

const { twinPayload } = vi.hoisted(() => ({
  twinPayload: {
    province_th: "เชียงใหม่",
    province_en: "Chiang Mai",
    verdict: {
      level: "watch",
      band: "watch",
      score: 42,
      head_th: "สถานการณ์ทดสอบสำหรับการทดสอบ",
      head_en: "Test situation for the band contract",
      data_provenance: "mixed",
      reasons: [{ domain: "air", th: "เหตุการณ์ทดสอบ", en: "Test event", isCaveat: false, evidence: "pm25=48" }],
      checklist: [{ th: "ตรวจสอบผู้รับผิดชอบ", en: "Confirm the duty officer" }],
    },
    deltas: { flood: { measured: null } },
  },
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("../../lib/client-requests", () => ({
  fetchJsonOrNull: async (url: string) => (url.includes("/api/cnx/twin") ? twinPayload : null),
  buildScenarioUrl: (url: string) => url,
}));

let container: HTMLDivElement;
let root: Root;

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

it("states the situation exactly once, above the board", async () => {
  await act(async () => root.render(<CnxApp />));
  const bands = container.querySelectorAll('[data-surface="cnx-verdict-band"]');
  expect(bands).toHaveLength(1);
  // The band is the only verdict surface: the news rail no longer carries
  // one, and nothing hides it at any width.
  const band = bands[0] as HTMLElement;
  expect(band.className).not.toContain("hidden");
  // ...and it is read before the map, not after it.
  const map = container.querySelector('section[aria-label*="แผนที่"], section[aria-label*="Operational map"]');
  expect(map).not.toBeNull();
  expect(band.compareDocumentPosition(map!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
