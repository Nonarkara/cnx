import { describe, expect, it, vi } from "vitest";
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => { throw new Error("not in a Worker"); } }));
vi.mock("./wind-field", () => ({
  fetchForecastField: async () => ({
    generatedAt: "", fetchedAt: "2026-10-11T04:40:00Z", provenance: "model", source: "", note: "",
    field: { grid: { lon0: 97, lat0: 17, d: 4, nx: 2, ny: 2 }, times: Array.from({ length: 49 }, (_, i) => Date.parse("2026-10-11T05:00:00Z") / 1000 + i * 3600), u10: [], v10: [], u850: [], v850: [], precip: Array.from({ length: 49 }, () => [2.1, 2.1, 2.1, 2.1]), pm25: null },
    outlook: [],
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
    const maeChaem = feed.messages.find(m => m.warning.key === "cnx-rain-mae-chaem")!;
    expect(maeChaem).toBeDefined();
    expect(maeChaem.warning.instructionTh).toContain("ศูนย์พักพิงในรายชื่อ: หอประชุม");
    expect(maeChaem.warning.instructionTh).not.toContain("ไม่มีศูนย์พักพิง");
  });

  it("does not publish expired model warnings", async () => {
    const feed = await buildCapFeed(Date.parse("2026-10-15T05:20:00Z"));
    expect(feed.messages).toEqual([]);
    expect(feed.logRows.some(r => r.domain === "rain")).toBe(false);
  });

  it("logs the verdict and the rain entry the first time it sees them", async () => {
    const feed = await buildCapFeed(Date.parse("2026-10-11T05:20:00Z"));
    expect(feed.logRows.map((r) => [r.domain, r.from, r.to])).toEqual(expect.arrayContaining([["verdict", null, "watch"], ["rain", "none", "watch"]]));
  });
});
