import { describe, expect, it, vi } from "vitest";
import { fetchCnxGistdaPm25 } from "./gistda-pm25";

const payload = {
  status: 200,
  data: {
    pm25: 0, pm25Avg24hrs: 8, pm25_aqi: 0,
    loc: { loctext: "เชียงใหม่", loctext_en: "Chiang Mai", ap_tn: "เมือง", ap_en: "Mueang" },
    graphHistory24hrs: [[0, "2026-10-01T10:00:00Z"]],
    pm25_amphoe: [{ ap_tn: "เมือง", ap_en: "Mueang", ap_idn: 5001, pm25: 0, pm25Avg24hr: 8, dt: "2026-10-01T10:00:00Z" }],
  },
};
const responding = (body: unknown, status = 200) => vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("GISTDA evidence contract", () => {
  it("keeps an upstream outage unknown instead of manufacturing clean air and fresh districts", async () => {
    for (const fetcher of [responding({}, 503), responding({ data: { pm25_aqi: 0 } }), vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout"))]) {
      const data = await fetchCnxGistdaPm25(fetcher);
      expect(data).toMatchObject({ provenance: "unavailable", pm25: null, pm25Aqi: null, severity: "unknown", observedAt: null, amphoe: [], history24h: [], provinceAveragePm25: null, worstAmphoe: null });
      expect(data.provenanceNote).toContain("not an all-clear");
    }
  });
  it("preserves measured zero and source observation time", async () => {
    const data = await fetchCnxGistdaPm25(responding(payload));
    expect(data).toMatchObject({ provenance: "live", pm25: 0, pm25Aqi: 0, observedAt: "2026-10-01T10:00:00.000Z", provinceAveragePm25: 0 });
    expect(data.amphoe).toHaveLength(1);
  });
  it("does not guess an observation timezone or replace missing district coverage with zero", async () => {
    const data = await fetchCnxGistdaPm25(responding({ ...payload, data: { ...payload.data, graphHistory24hrs: [[0, "2026-10-01 17:00:00"]], pm25_amphoe: [] } }));
    expect(data.observedAt).toBeNull();
    expect(data.provinceAveragePm25).toBeNull();
    expect(data.worstAmphoe).toBeNull();
  });
  it("rejects invalid current values and removes impossible district concentrations", async () => {
    const missing = await fetchCnxGistdaPm25(responding({ ...payload, data: { ...payload.data, pm25: -1 } }));
    expect(missing.provenance).toBe("unavailable");
    const data = await fetchCnxGistdaPm25(responding({ ...payload, data: { ...payload.data, pm25_amphoe: [{ ...payload.data.pm25_amphoe[0], pm25: -1 }] } }));
    expect(data.amphoe).toEqual([]);
    expect(data.provinceAveragePm25).toBeNull();
  });
});
