import { afterEach, beforeEach, expect, it, vi } from "vitest";
let social: typeof import("./social");
beforeEach(async () => {
  vi.resetModules();
  social = await import("./social");
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    if (input.includes("gdelt")) return Response.json({ articles: [] });
    const url = new URL(input);
    const title = url.searchParams.get("hl") ?? "unknown";
    return new Response(`<rss><item><title>${title}</title><link>https://news.test/${title}</link><pubDate>Fri, 02 Oct 2026 06:00:00 GMT</pubDate></item></rss>`);
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("keeps standard and selected multilingual feeds separate", async () => {
  const standard = await social.fetchCnxSocial();
  expect(standard.items.some((i) => i.title === "ja")).toBe(false);
  const japanese = await social.fetchCnxSocialMultilingual(["Japan"]);
  expect(japanese.items.some((i) => i.title === "ja")).toBe(true);
  const chinese = await social.fetchCnxSocialMultilingual(["China"]);
  expect(chinese.items.some((i) => i.title === "zh-CN")).toBe(true);
  expect(chinese.items.some((i) => i.title === "ja")).toBe(false);
});
it("canonicalizes country ordering, duplicates and unknown countries for bounded caching", async () => {
  const first = await social.fetchCnxSocialMultilingual(["Japan", "China"]);
  vi.mocked(fetch).mockClear();
  expect(await social.fetchCnxSocialMultilingual([" china ", "JAPAN", "Japan", "unconfigured"])).toBe(first);
  expect(fetch).not.toHaveBeenCalled();
});
