import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCnxYoutube, isYoutubePayload, YOUTUBE_KV_KEY, type YoutubePayload } from "./youtube";
import { POST } from "../../app/api/cnx/youtube/ingest/route";
import { GET } from "../../app/api/cnx/youtube/route";

const store = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: { CNX_FLIGHTS_KV: store } }) }));
const now = new Date("2026-11-03T06:00:00.000Z");
const queries = [
  ["th", "เชียงใหม่"], ["en", "Chiang Mai"], ["zh-Hans", "清迈"],
  ["ja", "チェンマイ"], ["ko", "치앙마이"], ["ru", "Чиангмай"],
];
function payload(): YoutubePayload {
  return {
    generatedAt: now.toISOString(), capturedAt: now.toISOString(),
    windowStart: "2026-10-04T06:00:00.000Z", windowEnd: now.toISOString(), detailsFailed: 0,
    queries: queries.map(([language, query]) => ({ language, query, status: "ok", resultCount: 1 })),
    videos: [{ id: "abcdefghijk", title: "Chiang Mai", channelId: `UC${"a".repeat(22)}`, channelTitle: "Local channel",
      publishedAt: "2026-11-02T06:00:00.000Z", viewCount: 123, embeddable: true, madeForKids: null, language: null }],
  };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); store.get.mockReset(); store.put.mockReset(); });

it("accepts a bounded metadata sample, preserving unknown kids/language flags", () => {
  expect(isYoutubePayload(payload())).toBe(true);
  const partial = payload(); partial.queries[1].status = "failed"; partial.queries[1].resultCount = 0; partial.detailsFailed = 1;
  expect(isYoutubePayload(partial)).toBe(true);
});
it("rejects malformed IDs, strings, counts, dates, duplicates and non-embeddable rows", () => {
  for (const changes of [
    { id: "https://evil.test" }, { channelId: "bad" }, { title: "x".repeat(301) }, { channelTitle: "" },
    { publishedAt: "2026-10-03T06:00:00Z" }, { publishedAt: "2026-11-03T06:00:01Z" }, { publishedAt: "2026-02-30T00:00:00Z" },
    { viewCount: -1 }, { viewCount: 1.5 }, { embeddable: false }, { madeForKids: "false" }, { language: "x".repeat(60) },
  ]) {
    const p = payload(); Object.assign(p.videos[0], changes); expect(isYoutubePayload(p), JSON.stringify(changes)).toBe(false);
  }
  const p = payload(); p.videos.push(p.videos[0]); expect(isYoutubePayload(p)).toBe(false);
  expect(isYoutubePayload({ ...payload(), capturedAt: "2026-11-01T06:00:00Z" })).toBe(false);
  expect(isYoutubePayload({ ...payload(), queries: [] })).toBe(false);
  expect(isYoutubePayload({ ...payload(), windowStart: "2026-09-04T06:00:00Z" })).toBe(false);
});

describe("KV-only daily catalogue", () => {
  it("serves fresh and stale capture dates but rejects >48h and future copies without any upstream fetch", async () => {
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    store.get.mockResolvedValue(JSON.stringify(payload()));
    for (const [age, state] of [[0, "current"], [24 * 3_600_000 + 1, "stale"], [48 * 3_600_000, "stale"], [48 * 3_600_000 + 1, "unavailable"], [-301_000, "unavailable"]] as const) {
      vi.useFakeTimers(); vi.setSystemTime(now.getTime() + age);
      const result = await fetchCnxYoutube(); expect(result.state).toBe(state);
      if (state !== "unavailable") expect(result.capturedAt).toBe(now.toISOString());
      else expect(result.videos).toEqual([]);
    }
    expect(store.get).toHaveBeenCalledWith(YOUTUBE_KV_KEY); expect(upstream).not.toHaveBeenCalled();
  });
  it("does not mistake missing/invalid KV for a successful zero-result search", async () => {
    for (const raw of [null, "{", JSON.stringify({ generatedAt: now.toISOString(), videos: [] })]) {
      store.get.mockResolvedValue(raw); expect((await fetchCnxYoutube()).provenance).toBe("unavailable");
    }
  });
  it("uses the shared authenticated, validated and monotonic ingest", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv("CNX_FLIGHTS_RELAY_SECRET", "test-secret");
    const req = (p: unknown, auth = "test-secret") => new Request("https://cnx.test/api/cnx/youtube/ingest", { method: "POST", headers: { "x-relay-secret": auth }, body: JSON.stringify(p) });
    expect((await POST(req(payload(), "wrong"))).status).toBe(401);
    expect((await POST(req({ ...payload(), videos: [{ id: "bad" }] }))).status).toBe(422);
    expect((await POST(req(payload()))).status).toBe(200);
    expect(store.put).toHaveBeenCalledWith(YOUTUBE_KV_KEY, JSON.stringify(payload()), { expirationTtl: 172800 });
    store.get.mockResolvedValue(JSON.stringify(payload()));
    expect((await POST(req(payload()))).status).toBe(409);
  });
  it("the public GET ignores arbitrary query strings and performs no searches", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now); store.get.mockResolvedValue(JSON.stringify(payload()));
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    const response = await GET(new Request("https://cnx.test/api/cnx/youtube?q=anything&refresh=1"));
    const body = await response.json(); expect(body.videos[0].viewCount).toBe(123);
    expect(body.note).toMatch(/sample|retrieved/); expect(upstream).not.toHaveBeenCalled();
  });
});
