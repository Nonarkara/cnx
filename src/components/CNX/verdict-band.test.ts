// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VerdictBand } from "./CNXTopBar";
import { computeVerdict } from "../../lib/cnx/verdict";
import type { CnxTwinResponse } from "../../lib/cnx/twin";
import { __resetLangForTests } from "../../hooks/useLang";
import type { Lang } from "../../lib/i18n";

const inputs = { pm25_now: null, pm25_fc_24h: null, rain_fc_24h_mm: null, rain_now_24h_mm: null, ping_capacity_ratio: null, reservoir_surge: false, fire_count: null, wind_kmh: null, provenance: "mixed" as const, flood_provenance: "scenario" as const };

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  __resetLangForTests(null);
  vi.unstubAllGlobals();
});

let root: Root | null = null;

/** Render in one language mode; the band shows that language only. */
async function render(lang: Lang, over: Partial<CnxTwinResponse["verdict"]> = {}): Promise<HTMLDivElement> {
  __resetLangForTests(lang);
  const twin = { province_th: "เชียงใหม่", province_en: "Chiang Mai", verdict: { ...computeVerdict(inputs), ...over } } as CnxTwinResponse;
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(VerdictBand, { twin, onOpenEmergency: () => {} })));
  return container;
}

describe("verdict band action and evidence presentation", () => {
  it("gives evidence gaps an actionable verification step and shows the actual checklist", async () => {
    const en = (await render("en")).textContent ?? "";
    expect(en).toContain("Evidence gap");
    expect(en).toContain("Verify missing or old readings");
    expect(en).toContain("Planning checklist");
    expect(en).toContain("Confirm the duty officer");
    expect(en).not.toContain("open Story for the full list");
    const th = (await render("th")).textContent ?? "";
    expect(th).toContain("ช่องว่างหลักฐาน");
    expect(th).toContain("ยืนยันค่าที่ขาดหรือเก่า");
    expect(th).toContain("รายการตรวจเพื่อวางแผน");
    expect(th).toContain("ยืนยันผู้รับผิดชอบเวร");
  });
  it("keeps urgent official instructions visible even when some evidence is missing", async () => {
    expect((await render("en", { level: "danger" })).textContent).toContain("Follow official instructions for the affected area now");
    expect((await render("th", { level: "danger" })).textContent).toContain("ปฏิบัติตามคำสั่งทางการในพื้นที่ทันที");
  });
  it("does not present the safe model state as an unconditional all-clear", async () => {
    const en = (await render("en", { level: "safe", reasons: [] })).textContent ?? "";
    expect(en).toContain("NO ELEVATED SIGNAL");
    expect(en).toContain("not an all-clear");
    expect(en).toContain("not an event probability");
    const th = (await render("th", { level: "safe", reasons: [] })).textContent ?? "";
    expect(th).toContain("ไม่มีสัญญาณยกระดับ");
    expect(th).toContain("ยังไม่ใช่การยืนยันว่าปลอดภัย");
    expect(th).toContain("ไม่ใช่ความน่าจะเป็นของเหตุการณ์");
  });
  it("shows one language per mode, never both stacked", async () => {
    const en = (await render("en")).textContent ?? "";
    const th = (await render("th")).textContent ?? "";
    expect(en).not.toContain("ขั้นตอนต่อไป");
    expect(th).not.toContain("Next step");
    expect(th).not.toContain("Evidence gap");
  });
});

describe("the band's surfaces", () => {
  it("states the level, the provenance and the headline without a click", async () => {
    const container = await render("en");
    const band = container.querySelector('[data-surface="cnx-verdict-band"]');
    expect(band).not.toBeNull();
    const text = band!.textContent ?? "";
    expect(text).toContain("WATCH");
    expect(text).toContain("Mixed evidence");
    // the situation itself — the board's headline — is in the band, not
    // behind the disclosure
    expect(text).toContain(computeVerdict(inputs).head_en);
  });

  it("puts the reasoning one click away, not two", async () => {
    // The band replaced a strip that rendered the reasoning inline. If the
    // reasoning were nested inside a second closed disclosure, a reader
    // would have to open two panels to reach it — and the test would still
    // pass on textContent alone.
    const container = await render("en");
    const band = container.querySelector('[data-surface="cnx-verdict-band"]')!;
    const disclosure = band.querySelector("details")!;
    const panel = disclosure.querySelector("div")!;
    const nextStep = [...panel.querySelectorAll("p")].find((p) => (p.textContent ?? "").includes("Next step"));
    expect(nextStep).toBeDefined();
    // the reasoning sits in the panel this disclosure opens, and is not
    // behind a further closed disclosure of its own
    expect(nextStep!.closest("details")).toBe(disclosure);
    expect(panel.contains(nextStep!)).toBe(true);
  });

  it("does not repeat the level or the headline inside the panel", async () => {
    const container = await render("en");
    const band = container.querySelector('[data-surface="cnx-verdict-band"]')!;
    const disclosure = band.querySelector("details")!;
    const panel = disclosure.querySelector("div")!;
    const panelText = panel.textContent ?? "";
    expect(panelText).not.toContain("NO ELEVATED SIGNAL");
    expect(panelText).not.toContain("not an all-clear");
    // the province and the emergency numbers travel with the reasoning
    expect(panelText).toContain("Chiang Mai");
    expect(panelText).toContain("DDPM");
  });
});
