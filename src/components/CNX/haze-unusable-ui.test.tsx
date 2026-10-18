// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { __resetLangForTests } from "../../hooks/useLang";
import type { HazeVisionResponse } from "../../lib/cnx/haze-vision";
import CnxHazeModal from "./CNXHazeModal";
import CNXAboutContent from "./CNXAboutContent";
vi.mock("../../lib/client-requests", () => ({ fetchJsonOrNull: async () => null }));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  __resetLangForTests("en");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it.each(["en", "th"] as const)("keeps an unusable frame unscored and explains uncertain causes in %s", async lang => {
  __resetLangForTests(lang);
  const response: HazeVisionResponse = {
    provenance: "live", generatedAt: new Date().toISOString(), methodology: "Visual screening", note: null,
    agreement: { r: null, pairs: 0, pm25Min: null, pm25Max: null, pm25Median: null, pm25P95: null, eventReadings: 0, spansHazeEvent: false },
    cameras: [{ cameraId: "detail", label: "Public camera", latitude: 18.8, longitude: 99, snapshotUrl: "https://example.test/frame.jpg", observedAt: new Date().toISOString(), verdict: "unusable", score: null, metrics: null, baselineSamples: 12, nearestPm25: null }],
  };
  await act(async () => root.render(<CnxHazeModal isOpen onClose={vi.fn()} air={null} aerosol={null} dustboy={null} citizen={null} smoke={null} hazeVision={response} />));
  const figure = container.querySelector("figure")!;
  expect(figure.textContent).toContain(lang === "en" ? "Insufficient visual detail — cannot assess" : "รายละเอียดภาพไม่พอ — ประเมินไม่ได้");
  expect(figure.textContent).toContain(lang === "en" ? "Fog, obstruction or a placeholder" : "หมอก สิ่งบดบัง หรือภาพแทนที่");
  expect(figure.textContent).not.toContain(lang === "en" ? "Low visual haze" : "หมอกควันในภาพต่ำ");
  expect(figure.textContent).not.toMatch(/score 0|คะแนน 0/);
  expect(container.textContent).toContain(lang === "en" ? "0 assessed · 1 unassessable" : "ประเมินได้ 0 · ประเมินไม่ได้ 1");
});
it("describes the limited off-Mac standby and sparse camera screening without accuracy claims", async () => {
  await act(async () => root.render(<CNXAboutContent />));
  expect(container.textContent).toContain("best-effort off-Mac collector");
  expect(container.textContent).toContain("recovery time is not guaranteed");
  expect(container.textContent).toContain("Other relay functions still depend on the Mac");
  expect(container.textContent).toContain("not validated detection accuracy");
});
