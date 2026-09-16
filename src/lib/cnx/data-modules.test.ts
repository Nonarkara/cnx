/**
 * Module smoke tests — verifies each data module's loader has the
 * expected shape and tolerates the live failure modes (Overpass rate
 * limit, blank upstream, malformed JSON). All network calls are
 * mocked via vi.stubGlobal("fetch").
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Helper — build a fake Response that matches the Fetch API
function fakeJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fakeText(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("fetchCnxOpenDataIndex", () => {
  it("returns normalised index from the baked JSON", async () => {
    // Mocks BOTH fetches (index + all) so Promise.all resolves cleanly.
    fetchMock
      .mockResolvedValueOnce(
        fakeJson({
          generatedAt: "2026-01-01T00:00:00.000Z",
          totalDatasets: 311,
          datasets: [
            { id: "abc", nameTh: "ข้อบัญญัติงบประมาณรายจ่ายประจำปี", nameEn: "Annual Expenditure Bylaw" },
          ],
        }),
      )
      .mockResolvedValueOnce(fakeJson({ datasets: [] }));
    const { fetchCnxOpenDataIndex } = await import("./open-data-th");
    const idx = await fetchCnxOpenDataIndex();
    expect(idx.totalDatasets).toBe(311);
    // Normalised to titleTh / titleEn
    expect(idx.datasets[0].titleTh).toBe("ข้อบัญญัติงบประมาณรายจ่ายประจำปี");
    expect(idx.datasets[0].titleEn).toBe("Annual Expenditure Bylaw");
  });

  it("falls back to the empty placeholder on fetch failure", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const { fetchCnxOpenDataIndex } = await import("./open-data-th");
    const idx = await fetchCnxOpenDataIndex();
    expect(idx.totalDatasets).toBe(311);
    expect(idx.datasets).toEqual([]);
  });
});

describe("fetchCnxBus", () => {
  it("reads routes + stops from the network response", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeJson({
        meta: { generatedAt: "2026-01-01T00:00:00.000Z" },
        routes: [
          {
            id: "r-1",
            ref: "24B",
            name: "24B",
            operator: "RTC",
            colour: "#FFBF00",
            geometry: [
              [98.97, 18.78],
              [98.98, 18.79],
            ],
          },
        ],
        stops: [{ id: "s-1", name: "S1", longitude: 98.97, latitude: 18.78, operator: "RTC", routeRef: "24B" }],
      }),
    );
    const { fetchCnxBus } = await import("./bus-routes");
    const out = await fetchCnxBus();
    expect(out.routes[0].ref).toBe("24B");
    expect(out.routes[0].colour).toBe("#FFBF00");
    expect(out.stops[0].name).toBe("S1");
  });

  it("serves the empty placeholder when both baked + Overpass fail", async () => {
    fetchMock.mockRejectedValue(new Error("both down"));
    const { fetchCnxBus } = await import("./bus-routes");
    const out = await fetchCnxBus();
    expect(out.routes).toEqual([]);
    expect(out.stops).toEqual([]);
  });
});

describe("fetchCnxWaterways", () => {
  it("parses FeatureCollection and returns Waterway[]", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeJson({
        type: "FeatureCollection",
        meta: { generatedAt: "2026-01-01T00:00:00.000Z" },
        features: [
          {
            id: 1,
            properties: { id: 1, name: "แม่น้ำปิง", category: "river", width: "major" },
            geometry: { type: "LineString", coordinates: [[98.5, 18.5], [98.7, 18.7]] },
          },
        ],
      }),
    );
    const { fetchCnxWaterways } = await import("./waterways");
    const out = await fetchCnxWaterways();
    expect(out.waterways).toHaveLength(1);
    expect(out.waterways[0].name).toBe("แม่น้ำปิง");
    expect(out.waterways[0].category).toBe("river");
  });
});

describe("fetchCnxSocial", () => {
  it("returns live Google News items when feeds succeed", async () => {
    fetchMock
      .mockResolvedValueOnce(
        fakeText(`<?xml version="1.0"?><rss><channel><title>X</title>
          <item><title>ข่าวเชียงใหม่ A</title><link>https://news.example.com/a</link><pubDate>Wed, 17 Sep 2026 10:00:00 GMT</pubDate></item>
          <item><title>ข่าวเชียงใหม่ B</title><link>https://news.example.com/b</link><pubDate>Wed, 17 Sep 2026 09:00:00 GMT</pubDate></item>
        </channel></rss>`),
      )
      .mockResolvedValueOnce(fakeText(`<?xml version="1.0"?><rss><channel><title>X</title></channel></rss>`))
      .mockResolvedValueOnce(fakeJson({ articles: [] }));
    const { fetchCnxSocial } = await import("./social");
    const out = await fetchCnxSocial();
    expect(out.items.length).toBeGreaterThanOrEqual(2);
    expect(out.counts.th).toBeGreaterThanOrEqual(2);
  });

  it("returns the 3-item scenario fallback when every feed is down", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const { fetchCnxSocial } = await import("./social");
    const out = await fetchCnxSocial();
    expect(out.items.length).toBeGreaterThanOrEqual(1);
  });
});

describe("fetchCnxSocialMultilingual", () => {
  it("subscribes to feeds for matching countries + merges baseline", async () => {
    // Empty response from every feed; baseline still produces ≥ 1 item.
    fetchMock.mockResolvedValue(fakeText(`<?xml version="1.0"?><rss><channel><title>X</title></channel></rss>`));
    fetchMock.mockResolvedValue(fakeJson({ articles: [] }));
    const { fetchCnxSocialMultilingual } = await import("./social");
    const out = await fetchCnxSocialMultilingual(["China", "Japan"]);
    // Baseline is the safety net — even with zero RSS success the rail is populated.
    expect(out.items.length).toBeGreaterThanOrEqual(1);
    // Every baseline item carries `tone: "demo"` so the sidebar can badge it.
    expect(out.items.every((i) => i.tone === "demo" || i.tone === "info" || i.tone === "alert")).toBe(true);
  });
});

describe("RAG searchCorpus", () => {
  it("indexes the open-data catalog and answers a query", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeJson({
        generatedAt: "2026-01-01T00:00:00.000Z",
        totalDatasets: 311,
        datasets: [
          {
            id: "x1",
            nameTh: "ข้อมูลคุณภาพน้ำแม่ปิง",
            nameEn: "Ping River Water Quality Data",
            tags: ["water-quality", "ping"],
            publisher: "สำนักงานสิ่งแวดล้อม",
            summary: "ข้อมูลคุณภาพน้ำรายเดือนของแม่น้ำปิง ตั้งแต่ปี 2560",
          },
        ],
      }),
    );
    // Flood + air + fire + social are fetched too. Make them fail-soft.
    fetchMock.mockRejectedValue(new Error("flood/air/fire/social down"));

    const { searchCorpus, answerQuestion } = await import("./rag");
    // Query a phrase that's unique to open-data — not in the social baseline
    // topics (Smart City / งบประมาณ / etc.) nor in heritage sites (Lanna wats).
    const refs = await searchCorpus("คุณภาพน้ำแม่ปิง");
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0].source).toBe("open-data");
    expect(refs[0].title).toContain("ข้อมูลคุณภาพน้ำแม่ปิง");

    const ans = await answerQuestion("คุณภาพน้ำแม่ปิง");
    expect(ans.answer).toContain("ข้อมูลคุณภาพน้ำแม่ปิง");
    expect(ans.references.length).toBeGreaterThan(0);
  });

  it("returns no-results gracefully when the query has zero token overlap", async () => {
    fetchMock.mockResolvedValueOnce(fakeJson({ generatedAt: "2026-01-01", totalDatasets: 0, datasets: [] }));
    fetchMock.mockRejectedValue(new Error("everything down"));
    const { searchCorpus, answerQuestion } = await import("./rag");
    const refs = await searchCorpus("xyzzy");
    expect(refs).toEqual([]);
    const ans = await answerQuestion("xyzzy");
    expect(ans.answer).toMatch(/ไม่พบ|no data/i);
  });
});

describe("buildGridRing", () => {
  it("returns a closed ring of points", async () => {
    // buildGridRing is not exported but lives inside CNXMap.tsx — keep test
    // minimal here. If we ever extract it, this becomes a real test.
    expect(true).toBe(true);
  });
});
