import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VerdictStrip } from "./CNXTopBar";
import { computeVerdict } from "../../lib/cnx/verdict";
import type { CnxTwinResponse } from "../../lib/cnx/twin";
const inputs = { pm25_now: null, pm25_fc_24h: null, rain_fc_24h_mm: null, rain_now_24h_mm: null, ping_capacity_ratio: null, reservoir_surge: false, fire_count: null, wind_kmh: null, provenance: "mixed" as const, flood_provenance: "scenario" as const };
function render(over: Partial<CnxTwinResponse["verdict"]> = {}) {
  const twin = { province_en: "Chiang Mai", verdict: { ...computeVerdict(inputs), ...over } } as CnxTwinResponse;
  return renderToStaticMarkup(React.createElement(VerdictStrip, { twin, onOpenEmergency: () => {} }));
}
describe("verdict action and evidence presentation", () => {
  it("gives evidence gaps an actionable verification step and shows the actual checklist", () => {
    const html = render();
    expect(html).toContain("Evidence gap");
    expect(html).toContain("Verify missing or old readings");
    expect(html).toContain("Planning checklist");
    expect(html).toContain("Confirm the duty officer");
    expect(html).not.toContain("open Story for the full list");
  });
  it("keeps urgent official instructions visible even when some evidence is missing", () => {
    expect(render({ level: "danger" })).toContain("Follow official instructions for the affected area now");
  });
  it("does not present the safe model state as an unconditional all-clear", () => {
    const html = render({ level: "safe", reasons: [] });
    expect(html).toContain("NO ELEVATED SIGNAL");
    expect(html).toContain("not an all-clear");
    expect(html).toContain("not an event probability");
  });
});
