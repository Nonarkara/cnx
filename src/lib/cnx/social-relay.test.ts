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
