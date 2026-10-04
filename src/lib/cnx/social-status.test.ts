import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rss = (title: string) =>
  `<?xml version="1.0"?><rss><channel><item><title>${title}</title><link>https://example.org/${encodeURIComponent(title)}</link><pubDate>${new Date(Date.now() - 3_600_000).toUTCString()}</pubDate></item></channel></rss>`;

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("normaliseCountry", () => {
  it("maps the names other modules use onto the feed list", async () => {
    const { normaliseCountry } = await import("./social");
    expect(normaliseCountry("South Korea")).toBe("korea");
    expect(normaliseCountry("Republic of Korea")).toBe("korea");
    expect(normaliseCountry("Russian Federation")).toBe("russia");
    expect(normaliseCountry(" Japan ")).toBe("japan");
  });
});

describe("fetchCnxSocialMultilingual — every feed reports its own outcome", () => {
  it("selects the Korean feed for 'South Korea' and reports its failure by country", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      urls.push(u);
      if (u.includes("hl=ko")) throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
      if (u.includes("gdeltproject")) return new Response("busy", { status: 503 });
      return new Response(rss(u.includes("hl=th") ? "ข่าวไทย" : "English news"), { status: 200 });
    }));
    const { fetchCnxSocialMultilingual } = await import("./social");
    const res = await fetchCnxSocialMultilingual(["South Korea"]);
    expect(urls.some((u) => u.includes("hl=ko"))).toBe(true);
    expect(res.sources.multilingual?.Korea).toMatchObject({ state: "failed" });
    // The Korean failure must not be reported as the main English feed failing.
    expect(res.sources.googleNewsEn).toMatchObject({ state: "ok", itemCount: 1 });
    expect(res.unavailableReason).toContain("Google News (Korea)");
    // A GDELT 503 is a failure, not "ok, 0 articles".
    expect(res.sources.gdelt).toEqual({ state: "failed", detail: "HTTP 503 from GDELT" });
  });

  it("does not let the Indian English feed overwrite the main English status", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("gl=IN")) return new Response("blocked", { status: 503 });
      if (u.includes("gdeltproject")) return new Response(JSON.stringify({ articles: [] }), { status: 200 });
      return new Response(rss("news"), { status: 200 });
    }));
    const { fetchCnxSocialMultilingual } = await import("./social");
    const res = await fetchCnxSocialMultilingual(["India"]);
    expect(res.sources.googleNewsEn.state).toBe("ok");
    expect(res.sources.multilingual?.India.state).toBe("failed");
  });
});
