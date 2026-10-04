import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_NEWS_EN, GOOGLE_NEWS_TH, SOCIAL_RSS_KV_KEY } from "./social-feeds";

const store = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: { CNX_FLIGHTS_KV: store } }) }));

const NOW = Date.parse("2026-10-04T12:00:00Z");
let social: typeof import("./social");
const rss = (title: string) => `<rss><channel><item><title>${title}</title><link>https://news.test/${encodeURIComponent(title)}</link><pubDate>${new Date(NOW - 60_000).toUTCString()}</pubDate></item></channel></rss>`;
function feeds(handler?: (url: string) => Response | undefined) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const override = handler?.(url);
    if (override) return override;
    return url.includes("gdelt") ? Response.json({ articles: [] }) : new Response(rss(`Direct ${new URL(url).searchParams.get("hl")}`));
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(async () => {
  vi.resetModules();
  store.get.mockReset().mockResolvedValue(null);
  store.put.mockReset();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  social = await import("./social");
  // The first cold import after resetModules pulls in next/server; on a
  // loaded machine that alone passed vitest's 10 s hook default.
}, 30_000);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("GDELT response validation", () => {
  it.each([{}, { articles: null }, { articles: "not an array" }])("does not count malformed successful GDELT JSON as zero news: %j", async (body) => {
    feeds((url) => url.includes("gdelt") ? Response.json(body) : undefined);
    const result = await social.fetchCnxSocial();
    expect(result.sources.gdelt.state).toBe("failed");
    expect(result.unavailableReason).toMatch(/GDELT/);
    expect(result.provenance).toBe("live");
  });
});

describe("social relay freshness through the actual KV reader", () => {
  function copy(ageMs: number) {
    store.get.mockResolvedValue(JSON.stringify({ generatedAt: new Date(NOW - ageMs).toISOString(), feeds: { [GOOGLE_NEWS_TH]: rss("Relayed Thai"), [GOOGLE_NEWS_EN]: rss("Relayed English") } }));
  }

  it("uses a fresh KV copy without attempting either Google RSS request", async () => {
    copy(10 * 60_000);
    const fetchMock = feeds();
    const result = await social.fetchCnxSocial();
    expect(store.get).toHaveBeenCalledWith(SOCIAL_RSS_KV_KEY);
    expect(result.items.map((item) => item.title)).toEqual(expect.arrayContaining(["Relayed Thai", "Relayed English"]));
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes("gdelt"))).toBe(true);
  });

  it("discards an expired KV copy and requests the direct feeds", async () => {
    copy(20 * 60_000 + 1_000);
    const fetchMock = feeds();
    const result = await social.fetchCnxSocial();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(expect.arrayContaining([GOOGLE_NEWS_TH, GOOGLE_NEWS_EN]));
    expect(result.items.every((item) => item.title.startsWith("Direct "))).toBe(true);
    expect(result.items.some((item) => item.title.startsWith("Relayed "))).toBe(false);
  });

  it("reports unavailable when stale KV cannot be refreshed rather than republishing its headlines as live", async () => {
    copy(21 * 60_000);
    feeds(() => new Response("blocked", { status: 503 }));
    const result = await social.fetchCnxSocial();
    expect(result.items).toEqual([]);
    expect(result.provenance).toBe("unavailable");
    expect(result.sources.googleNewsTh.state).toBe("failed");
    expect(result.sources.googleNewsEn.state).toBe("failed");
  });
});
