import { describe, expect, it, vi } from "vitest";
import type { DistrictOutlook } from "./wind-field-core";

const PEAK = Date.parse("2026-10-11T14:00:00Z") / 1000;
const district = (nameTh: string, nameEn: string, over: Partial<DistrictOutlook>): DistrictOutlook => ({
  nameTh, nameEn, rain6h: 0, rain24h: 0, rain48h: 0, peakRainMmH: 0, peakRainAt: null, pm25Peak: 10, pm25PeakAt: PEAK, ...over,
});

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => { throw new Error("not in a Worker"); } }));
vi.mock("./wind-field", () => ({
  fetchForecastField: async () => ({
    generatedAt: "", fetchedAt: "2026-10-11T04:40:00Z", provenance: "model", source: "", note: "",
    field: { grid: { lon0: 98, lat0: 18, d: 1, nx: 2, ny: 2 }, times: [1], u10: [], v10: [], u850: [], v850: [], precip: [], pm25: null },
    outlook: [district("แม่แจ่ม", "Mae Chaem", { rain24h: 50, peakRainAt: PEAK })],
  }),
}));
vi.mock("./rain", () => ({ fetchCnxRain: async () => ({ provenance: "unavailable", generatedAt: "", stations: [] }) }));
vi.mock("./twin", () => ({
  fetchCnxTwin: async () => ({
    verdict: { level: "watch", band: "watch", score: 30, head_th: "", head_en: "", reasons: [], checklist: [], data_provenance: "live", computedAt: "" },
  }),
}));

const { buildCapFeed } = await import("./cap-feed");

describe("buildCapFeed", () => {
  it("reads the bundled official shelter list on the server and names the district's shelter", async () => {
    const feed = await buildCapFeed(Date.parse("2026-10-11T05:20:00Z"));
    expect(feed.messages.map((m) => m.warning.key)).toEqual(["cnx-rain-mae-chaem"]);
    expect(feed.messages[0].warning.instructionTh).toContain("ศูนย์พักพิงใกล้: หอประชุม");
    expect(feed.messages[0].warning.instructionTh).not.toContain("ไม่มีศูนย์พักพิง");
  });

  it("logs the verdict and the rain entry the first time it sees them", async () => {
    const feed = await buildCapFeed(Date.parse("2026-10-11T05:20:00Z"));
    expect(feed.logRows.map((r) => [r.domain, r.from, r.to])).toEqual([["verdict", null, "watch"], ["rain", "none", "watch"]]);
  });
});
