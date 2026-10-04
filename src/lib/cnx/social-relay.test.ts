import { describe, expect, it } from "vitest";
import { isSocialRssPayload } from "./social";
import { GOOGLE_NEWS_EN, GOOGLE_NEWS_TH, MAX_FEED_BYTES } from "./social-feeds";

const rss = '<?xml version="1.0"?><rss><channel><item><title>x</title></item></channel></rss>';

describe("isSocialRssPayload", () => {
  it("accepts raw RSS for the known feeds", () => {
    expect(isSocialRssPayload({ generatedAt: "2026-10-04T10:00:00Z", feeds: { [GOOGLE_NEWS_TH]: rss, [GOOGLE_NEWS_EN]: rss } })).toBe(true);
  });

  it("rejects unknown URLs, non-RSS bodies, oversized bodies and empty payloads", () => {
    const ok = { generatedAt: "2026-10-04T10:00:00Z" };
    expect(isSocialRssPayload({ ...ok, feeds: { "https://evil.example/rss": rss } })).toBe(false);
    expect(isSocialRssPayload({ ...ok, feeds: { [GOOGLE_NEWS_TH]: "<html>blocked</html>" } })).toBe(false);
    expect(isSocialRssPayload({ ...ok, feeds: { [GOOGLE_NEWS_TH]: rss + "x".repeat(MAX_FEED_BYTES) } })).toBe(false);
    expect(isSocialRssPayload({ ...ok, feeds: {} })).toBe(false);
    expect(isSocialRssPayload({ generatedAt: "not a date", feeds: { [GOOGLE_NEWS_TH]: rss } })).toBe(false);
  });
});

describe("trimRss", () => {
  const item = (i: number) => `<item><title>t${i}</title><link>https://e.org/${i}</link></item>`;
  const feed = (n: number) => `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>${Array.from({ length: n }, (_, i) => item(i)).join("")}</channel></rss>`;

  it("keeps the envelope and the newest N items", async () => {
    const { trimRss } = await import("./social-feeds");
    const out = trimRss(feed(100), 20);
    expect((out.match(/<item>/g) ?? []).length).toBe(20);
    expect(out.startsWith('<?xml version="1.0"?><rss version="2.0"><channel><title>x</title><item><title>t0</title>')).toBe(true);
    expect(out.endsWith("</channel></rss>")).toBe(true);
  });

  it("leaves a feed with no items alone", async () => {
    const { trimRss } = await import("./social-feeds");
    expect(trimRss("<rss><channel></channel></rss>")).toBe("<rss><channel></channel></rss>");
  });

  it("fits all ten relayed feeds under the 1 MB ingest limit at real sizes", async () => {
    const { trimRss, RELAYED_FEEDS } = await import("./social-feeds");
    const bigItem = (i: number) => `<item><title>${"ข่าวเชียงใหม่ ".repeat(8)}${i}</title><link>https://news.google.com/rss/articles/${"x".repeat(400)}</link><description>${"y".repeat(600)}</description></item>`;
    const big = `<rss><channel>${Array.from({ length: 100 }, (_, i) => bigItem(i)).join("")}</channel></rss>`;
    const payload = JSON.stringify({ generatedAt: new Date().toISOString(), feeds: Object.fromEntries(RELAYED_FEEDS.map((u) => [u, trimRss(big)])) });
    expect(RELAYED_FEEDS).toHaveLength(10);
    expect(payload.length).toBeLessThan(1_048_576);
  });
});

describe("parseGdelt", () => {
  it("reads an article list", async () => {
    const { parseGdelt } = await import("./social");
    const r = parseGdelt(JSON.stringify({ articles: [{ title: "a", url: "https://e.org" }, { title: 1 }] }));
    expect(r.outcome).toEqual({ state: "ok", itemCount: 1 });
  });

  it("names GDELT's plain-text rate-limit answer instead of calling it no news", async () => {
    const { parseGdelt } = await import("./social");
    expect(parseGdelt("Please limit requests to one every 5 seconds").outcome).toEqual({ state: "failed", detail: "rate-limited by GDELT" });
  });
});

describe("isSocialRssPayload — GDELT copy", () => {
  it("accepts an optional bounded GDELT string and rejects anything else", () => {
    const base = { generatedAt: "2026-10-04T10:00:00Z", feeds: { [GOOGLE_NEWS_TH]: rss } };
    expect(isSocialRssPayload({ ...base, gdelt: '{"articles":[]}' })).toBe(true);
    expect(isSocialRssPayload({ ...base, gdelt: 42 })).toBe(false);
    expect(isSocialRssPayload({ ...base, gdelt: "x".repeat(300_000) })).toBe(false);
  });
});
