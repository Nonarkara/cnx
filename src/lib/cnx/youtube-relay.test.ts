import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isYoutubePayload } from "./youtube";

const NOW = Date.parse("2026-11-03T06:00:00Z");
let relay: typeof import("../../../scripts/youtube-relay.mjs");
const id = (n: number) => String(n).padStart(11, "a");
const video = (n: number, views = "5", extra = {}) => ({ id: id(n), snippet: { title: `Chiang Mai ${n}`, channelId: `UC${"a".repeat(22)}`, channelTitle: "Channel", publishedAt: "2026-11-02T06:00:00Z", liveBroadcastContent: "none" }, status: { privacyStatus: "public", embeddable: true }, statistics: { viewCount: views }, ...extra });
beforeEach(async () => { vi.resetModules(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); relay = await import("../../../scripts/youtube-relay.mjs"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function mockApi(override?: (u: URL) => Response | null) {
  const calls: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (raw: string | URL) => {
    const u = new URL(raw); calls.push(u);
    const changed = override?.(u); if (changed) return changed;
    return Response.json(u.pathname.endsWith("/search") ? { items: [{ id: { videoId: id(1) } }, { id: { videoId: id(2) } }] } : { items: [video(1, "7"), video(2, "500", { status: { privacyStatus: "public", embeddable: true, madeForKids: true } })] });
  }));
  return calls;
}
describe("bounded official YouTube metadata relay", () => {
  it("does no search without a configured key and returns an explicit unavailable reason", async () => {
    const calls = mockApi();
    expect(await relay.collectYoutubeCatalogue({ apiKey: "" })).toEqual({ state: "not-configured", payload: null });
    expect(calls).toHaveLength(0);
  });
  it("uses a fixed multilingual 30-day window and ranks deduplicated results by actual views", async () => {
    const calls = mockApi(); const result = await relay.collectYoutubeCatalogue({ apiKey: "test" });
    expect(result.state).toBe("ok"); expect(isYoutubePayload(result.payload)).toBe(true);
    expect(result.payload!.videos.map(v => v.viewCount)).toEqual([500, 7]);
    expect(result.payload!.videos[0].madeForKids).toBe(true); expect(result.payload!.videos[1].madeForKids).toBeNull();
    const searches = calls.filter(u => u.pathname.endsWith("/search")); expect(searches).toHaveLength(6);
    for (const u of searches) {
      expect(u.origin).toBe("https://www.googleapis.com"); expect(u.searchParams.get("type")).toBe("video");
      expect(u.searchParams.get("publishedAfter")).toBe("2026-10-04T06:00:00.000Z");
      expect(u.searchParams.get("publishedBefore")).toBe("2026-11-03T06:00:00.000Z");
      expect(u.searchParams.get("order")).toBe("viewCount"); expect(u.searchParams.get("maxResults")).toBe("25");
      expect(u.searchParams.has("pageToken")).toBe(false);
    }
    expect(calls.at(-1)!.searchParams.get("part")).toBe("snippet,statistics,status");
    expect(calls).toHaveLength(7);
  });
  it("keeps unavailable search languages and malformed detail batches visible rather than calling them empty success", async () => {
    mockApi(u => u.pathname.endsWith("/search") && u.searchParams.get("relevanceLanguage") === "ja" ? new Response("blocked", { status: 403 }) : null);
    const r = await relay.collectYoutubeCatalogue({ apiKey: "test" });
    expect(r.state).toBe("partial"); expect(r.payload!.queries.find(q => q.language === "ja")!.status).toBe("failed");
    mockApi(u => u.pathname.endsWith("/videos") ? Response.json({ error: {} }) : null);
    expect((await relay.collectYoutubeCatalogue({ apiKey: "test" })).payload).toBeNull();
  });
  it("excludes private, disabled embeds, future/old videos, invalid counts and unsolicited IDs", async () => {
    mockApi(u => u.pathname.endsWith("/videos") ? Response.json({ items: [
      video(1, "0"), video(2, "42", { status: { privacyStatus: "public", embeddable: false } }),
      video(3, "999999"), video(2, "42", { status: { privacyStatus: "private", embeddable: true } }),
    ] }) : null);
    const r = await relay.collectYoutubeCatalogue({ apiKey: "test" });
    expect(r.payload!.videos.map(v => v.id)).toEqual([id(1)]); expect(r.payload!.videos[0].viewCount).toBe(0);
    for (const change of [{ statistics: {} }, { statistics: { viewCount: "-1" } }, { statistics: { viewCount: "Infinity" } }, { snippet: { ...video(1).snippet, publishedAt: "2026-11-04T00:00:00Z" } }, { snippet: { ...video(1).snippet, publishedAt: "2026-09-01T00:00:00Z" } }]) {
      mockApi(u => u.pathname.endsWith("/videos") ? Response.json({ items: [video(1, "5", change)] }) : null);
      expect((await relay.collectYoutubeCatalogue({ apiKey: "test" })).payload!.videos).toEqual([]);
    }
  });
  it("distinguishes a successful empty query sample from malformed search responses", async () => {
    mockApi(() => Response.json({ items: [] }));
    const empty = await relay.collectYoutubeCatalogue({ apiKey: "test" });
    expect(empty.state).toBe("ok"); expect(empty.payload!.videos).toEqual([]);
    mockApi(() => Response.json({ error: { message: "not a catalogue" } }));
    expect(await relay.collectYoutubeCatalogue({ apiKey: "test" })).toEqual({ state: "failed", payload: null });
  });
  it("bounds all search/detail requests and rejects oversized successful responses", async () => {
    const calls = mockApi(u => u.pathname.endsWith("/search") ? Response.json({ items: Array.from({ length: 25 }, (_, n) => ({ id: { videoId: id(n + ["th", "en", "zh-Hans", "ja", "ko", "ru"].indexOf(u.searchParams.get("relevanceLanguage")!) * 25) } })) }) : null);
    await relay.collectYoutubeCatalogue({ apiKey: "test" }); expect(calls).toHaveLength(9);
    mockApi(() => new Response("x".repeat(1_048_577)));
    expect(await relay.collectYoutubeCatalogue({ apiKey: "test" })).toEqual({ state: "failed", payload: null });
  });
  it("pushes only bounded validated metadata through the existing authenticated ingest", async () => {
    let pushed: Record<string, unknown> | null = null;
    const api = mockApi();
    const fetchApi = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (raw: string | URL, init?: RequestInit) => {
      if (String(raw).startsWith("https://cnx.test/")) {
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({ "X-Relay-Secret": "test-secret" });
        pushed = JSON.parse(init!.body as string);
        return Response.json({ ok: true });
      }
      return fetchApi(raw, init);
    }));
    expect((await relay.runYoutubeRelay({ baseUrl: "https://cnx.test", secret: "test-secret", apiKey: "test" })).state).toBe("ok");
    expect(isYoutubePayload(pushed)).toBe(true); expect(api).toHaveLength(7);
    expect((await relay.runYoutubeRelay({ baseUrl: "https://cnx.test", secret: "test-secret", apiKey: "test" })).state).toBe("skipped");
  });
  it("does not overwrite last good KV on failures and waits a day between attempts", async () => {
    const calls = mockApi(() => new Response("quota exceeded", { status: 403 }));
    const options = { baseUrl: "https://cnx.test", secret: "relay-secret", apiKey: "test" };
    expect((await relay.runYoutubeRelay(options)).state).toBe("failed");
    expect((await relay.runYoutubeRelay(options)).state).toBe("skipped");
    expect(calls.every(u => u.hostname === "www.googleapis.com")).toBe(true);
    expect(calls).toHaveLength(6);
  });
});
