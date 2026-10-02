import { afterEach, beforeEach, expect, it, vi } from "vitest";
let social: typeof import("./social");
beforeEach(async () => { vi.resetModules(); social = await import("./social"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("returns no plausible invented headlines when every news source fails", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
  for (const out of [await social.fetchCnxSocial(), await social.fetchCnxSocialMultilingual(["Japan"])]) {
    expect(out.items).toEqual([]);
    expect(out.counts).toEqual({ th: 0, en: 0 });
  }
});
it("returns actual headlines only, without padding a successful feed with scenarios", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("gdelt")
    ? Response.json({ articles: [] })
    : new Response('<rss><item><title>Observed headline</title><link>https://news.test/report</link><pubDate>Fri, 02 Oct 2026 06:00:00 GMT</pubDate></item></rss>')));
  for (const out of [await social.fetchCnxSocial(), await social.fetchCnxSocialMultilingual(["China"])]) {
    expect(out.items.length).toBeGreaterThan(0);
    expect(out.items.every((item) => item.title === "Observed headline" && item.tone !== "demo")).toBe(true);
    expect(out.items.every((item) => item.publishedAt === "2026-10-02T06:00:00.000Z")).toBe(true);
  }
});
it("skips undated, invalid-date and future news without inventing an observation time", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("gdelt")
    ? Response.json({ articles: [
      { title: "Undated GDELT", url: "https://news.test/undated" },
      { title: "Bad date GDELT", url: "https://news.test/bad", seendate: "badbadbaTbadbadZ" },
      { title: "Impossible calendar date GDELT", url: "https://news.test/calendar", seendate: "20260230T060000Z" },
      null,
      { title: { malformed: true }, url: "https://news.test/object" },
      { title: "Future GDELT", url: "https://news.test/future", seendate: "20991002T060000Z" },
    ] })
    : new Response('<rss><item><title>Undated RSS</title><link>https://news.test/undated</link></item><item><title>Bad date RSS</title><link>https://news.test/bad</link><pubDate>not a date</pubDate></item><item><title>Future RSS</title><link>https://news.test/future</link><pubDate>Fri, 02 Oct 2099 06:00:00 GMT</pubDate></item><item><title>Actual</title><link>https://news.test/actual</link><pubDate>Fri, 02 Oct 2026 06:00:00 GMT</pubDate></item></rss>')));
  for (const out of [await social.fetchCnxSocial(), await social.fetchCnxSocialMultilingual(["Japan"])]) {
    expect(out.items.length).toBeGreaterThan(0);
    expect(out.items.every((item) => item.title === "Actual")).toBe(true);
  }
});
