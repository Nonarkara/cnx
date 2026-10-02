// The social rail must never let "we could not fetch" look like "there is
// no news".
//
// This regression is not hypothetical. On 2026-10-03 Google News began
// answering Cloudflare's egress with an HTTP 503 bot-block page, while the
// same URL returned 302→200 with 100 items from a laptop. The board showed
// an empty rail, because both the success path and the `catch` returned
// `items: []`, `counts: {th: 0, en: 0}` and nothing else — an upstream
// total failure and a quiet news day were byte-identical.

import { describe, it, expect, beforeEach, vi } from "vitest";

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>Real headline</title><link>https://example.com/a</link><pubDate>Wed, 01 Oct 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

function stubFeed(handler: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => handler(String(input))) as unknown as typeof fetch;
}

/** A Google 503 — what the edge actually received. */
const blocked = () => new Response("<html>Sorry...</html>", { status: 503, headers: { "content-type": "text/html" } });
const notFound = () => new Response("nope", { status: 404 });

async function load() {
  vi.resetModules();
  const mod = await import("./social");
  return mod.fetchCnxSocial();
}

describe("social feed provenance", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("reports a live read when the feeds answer", async () => {
    stubFeed((url) => (url.includes("api.gdeltproject.org") ? new Response(JSON.stringify({ articles: [] })) : new Response(RSS)));
    const r = await load();
    expect(r.provenance).toBe("live");
    expect(r.unavailableReason).toBeNull();
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.sources.googleNewsTh.state).toBe("ok");
  });

  it("is unavailable — not live and empty — when every feed is refused", async () => {
    // This is the exact production condition. It must never render as a
    // quiet news day.
    stubFeed(() => blocked());
    const r = await load();
    expect(r.items).toHaveLength(0);
    expect(r.provenance).toBe("unavailable");
    expect(r.unavailableReason).toMatch(/read failure, not an absence of news/i);
    expect(r.unavailableReason).toMatch(/503/);
  });

  it("names which sources failed, so a partial outage is visible", async () => {
    stubFeed((url) => (url.includes("google.com") ? blocked() : new Response(JSON.stringify({ articles: [] }))));
    const r = await load();
    expect(r.sources.googleNewsTh.state).toBe("failed");
    expect(r.sources.googleNewsEn.state).toBe("failed");
    expect(r.unavailableReason).toMatch(/Google News/);
  });

  it("distinguishes a 404 from a 503 in the stated reason", async () => {
    stubFeed((url) => (url.includes("api.gdeltproject.org") ? new Response(JSON.stringify({ articles: [] })) : notFound()));
    const r = await load();
    expect(r.unavailableReason).toMatch(/404/);
    expect(r.unavailableReason).not.toMatch(/503/);
  });

  it("calls a timeout a timeout rather than an empty feed", async () => {
    stubFeed(() => {
      const e = new Error("The operation was aborted due to timeout");
      e.name = "TimeoutError";
      throw e;
    });
    const r = await load();
    expect(r.provenance).toBe("unavailable");
    expect(r.unavailableReason).toMatch(/timed out/i);
  });

  it("stays live when feeds answer but genuinely report nothing", async () => {
    // The distinction that matters: 200-with-zero-items is a real
    // observation of an empty news day, not a failure.
    stubFeed((url) => (url.includes("api.gdeltproject.org") ? new Response(JSON.stringify({ articles: [] })) : new Response("<rss><channel></channel></rss>")));
    const r = await load();
    expect(r.items).toHaveLength(0);
    expect(r.provenance).toBe("live");
    expect(r.unavailableReason).toBeNull();
    expect(r.sources.googleNewsEn).toEqual({ state: "ok", itemCount: 0 });
  });

  it("survives a total throw in the outer path", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("kaboom");
    }) as unknown as typeof fetch;
    vi.resetModules();
    const { fetchCnxSocial } = await import("./social");
    const r = await fetchCnxSocial();
    expect(r.provenance).toBe("unavailable");
    expect(r.unavailableReason).toMatch(/kaboom/);
  });
});

describe("multilingual social provenance", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("is unavailable when the base feeds are refused", async () => {
    // The rail calls this path, not the plain one, so it is the one that
    // actually decided what an operator saw.
    stubFeed(() => blocked());
    vi.resetModules();
    const { fetchCnxSocialMultilingual } = await import("./social");
    const r = await fetchCnxSocialMultilingual(["CN", "JP"]);
    expect(r.provenance).toBe("unavailable");
    expect(r.unavailableReason).toMatch(/not an absence of news/i);
  });

  it("never returns an empty payload without a reason", async () => {
    stubFeed(() => blocked());
    vi.resetModules();
    const { fetchCnxSocialMultilingual } = await import("./social");
    const r = await fetchCnxSocialMultilingual([]);
    if (r.items.length === 0) {
      // The invariant, stated once so it cannot be broken quietly.
      expect(r.unavailableReason).toBeTruthy();
      expect(r.provenance).not.toBe("live");
    }
  });
});
