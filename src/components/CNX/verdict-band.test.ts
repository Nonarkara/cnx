// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VerdictBand } from "./CNXTopBar";
import { computeVerdict } from "../../lib/cnx/verdict";
import type { CnxTwinResponse } from "../../lib/cnx/twin";
import { __resetLangForTests } from "../../hooks/useLang";
import type { Lang } from "../../lib/i18n";

const inputs = { pm25_now: null, pm25_fc_24h: null, rain_fc_24h_mm: null, rain_now_24h_mm: null, ping_capacity_ratio: null, reservoir_surge: false, fire_count: null, wind_kmh: null, provenance: "mixed" as const, flood_provenance: "scenario" as const };

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => {
  __resetLangForTests(null);
  vi.unstubAllGlobals();
});

/** Render in one language mode; the band shows that language only. */
async function render(lang: Lang, over: Partial<CnxTwinResponse["verdict"]> = {}): Promise<string> {
  __resetLangForTests(lang);
  const twin = { province_th: "เชียงใหม่", province_en: "Chiang Mai", verdict: { ...computeVerdict(inputs), ...over } } as CnxTwinResponse;
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(createElement(VerdictBand, { twin, onOpenEmergency: () => {} })));
  const text = container.textContent ?? "";
  await act(async () => root.unmount());
  return text;
}

describe("verdict band action and evidence presentation", () => {
  it("gives evidence gaps an actionable verification step and shows the actual checklist", async () => {
    const en = await render("en");
    expect(en).toContain("Evidence gap");
    expect(en).toContain("Verify missing or old readings");
    expect(en).toContain("Planning checklist");
    expect(en).toContain("Confirm the duty officer");
    expect(en).not.toContain("open Story for the full list");
    const th = await render("th");
    expect(th).toContain("ช่องว่างหลักฐาน");
    expect(th).toContain("ยืนยันค่าที่ขาดหรือเก่า");
    expect(th).toContain("รายการตรวจเพื่อวางแผน");
    expect(th).toContain("ยืนยันผู้รับผิดชอบเวร");
  });
  it("keeps urgent official instructions visible even when some evidence is missing", async () => {
    expect(await render("en", { level: "danger" })).toContain("Follow official instructions for the affected area now");
    expect(await render("th", { level: "danger" })).toContain("ปฏิบัติตามคำสั่งทางการในพื้นที่ทันที");
  });
  it("does not present the safe model state as an unconditional all-clear", async () => {
    const en = await render("en", { level: "safe", reasons: [] });
    expect(en).toContain("NO ELEVATED SIGNAL");
    expect(en).toContain("not an all-clear");
    expect(en).toContain("not an event probability");
    const th = await render("th", { level: "safe", reasons: [] });
    expect(th).toContain("ไม่มีสัญญาณยกระดับ");
    expect(th).toContain("ยังไม่ใช่การยืนยันว่าปลอดภัย");
    expect(th).toContain("ไม่ใช่ความน่าจะเป็นของเหตุการณ์");
  });
  it("shows one language per mode, never both stacked", async () => {
    const en = await render("en");
    const th = await render("th");
    expect(en).not.toContain("ขั้นตอนต่อไป");
    expect(th).not.toContain("Next step");
    expect(th).not.toContain("Evidence gap");
  });
});
