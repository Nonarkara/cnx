import { describe, expect, it, vi } from "vitest";
import { backupNeeded, runStandby } from "../../../scripts/relay-standby-core.mjs";
const NOW = Date.parse("2026-10-15T15:00:00Z");
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const manifest = (stamp: string | null) => ({ schema: "cnx-twin-manifest/1", generatedAt: new Date(NOW).toISOString(), relay: { feeds: ["rain", "river-level"].map(id => ({ id, generatedAt: stamp })) } });
const rain = { id: "1", rain_24h: 12, rainfall_datetime: "2026-10-15 22:00", geocode: { province_code: "50" }, station: { tele_station_lat: 18.8, tele_station_long: 98.9 } };
const upstream = async (input: RequestInfo | URL) => { const url = String(input); return response(url.includes("rain_24h") ? { data: [rain] } : url.includes("tele_canal") ? { data: { tele_waterlevel: [1, 2] } } : { result: "OK", data: [{ id: 1 }] }); };
describe("off-Mac standby", () => {
  it("uses each feed's stamp, not the newest flight heartbeat", () => {
    const m = manifest(new Date(NOW - 21 * 60_000).toISOString());
    m.relay.feeds.push({ id: "flights", generatedAt: new Date(NOW).toISOString() });
    expect(backupNeeded(m, "rain", NOW)).toBe(true);
    expect(backupNeeded(manifest(new Date(NOW - 20 * 60_000).toISOString()), "rain", NOW)).toBe(false);
    expect(backupNeeded(manifest(null), "rain", NOW)).toBe(true);
    expect(backupNeeded(manifest("invalid"), "rain", NOW)).toBe(true);
    expect(backupNeeded(manifest(new Date(NOW + 6 * 60_000).toISOString()), "rain", NOW)).toBe(true);
  });
  it("rejects an old or malformed health manifest", () => {
    expect(() => backupNeeded({}, "rain", NOW)).toThrow();
    expect(() => backupNeeded({ ...manifest(null), generatedAt: new Date(NOW - 11 * 60_000).toISOString() }, "rain", NOW)).toThrow();
  });
  it("does no upstream work or writes while the Mac feeds are fresh", async () => {
    const fetcher = vi.fn(async () => response(manifest(new Date(NOW).toISOString())));
    await runStandby({ mode: "standby", fetchImpl: fetcher, now: () => NOW, log: vi.fn() });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("probes from an independent runner without credentials or writes", async () => {
    const fetcher = vi.fn(upstream);
    await runStandby({ mode: "probe", fetchImpl: fetcher, now: () => NOW, log: vi.fn() });
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes("nonarkara.org"))).toBe(true);
  });
  it("requires the secret before fetching upstream for a takeover", async () => {
    const fetcher = vi.fn(async () => response(manifest(null)));
    await expect(runStandby({ mode: "standby", fetchImpl: fetcher, now: () => NOW, log: vi.fn() })).rejects.toThrow("secret");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("writes only real source data to fixed, redirect-proof ingest destinations", async () => {
    const posts: { url: string; init: RequestInit }[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("manifest.json")) return response(manifest(null));
      if (init?.method === "POST") { posts.push({ url, init }); return response({ ok: true }); }
      return upstream(url);
    });
    await runStandby({ mode: "standby", secret: "test-secret", fetchImpl: fetcher, now: () => NOW, log: vi.fn() });
    expect(posts.map(p => p.url)).toEqual(["https://cnx.nonarkara.org/api/cnx/rain/ingest", "https://cnx.nonarkara.org/api/cnx/river-level/ingest"]);
    for (const post of posts) {
      expect(post.init.redirect).toBe("error");
      expect(JSON.parse(String(post.init.body)).generatedAt).toBe(new Date(NOW).toISOString());
    }
    expect(JSON.parse(String(posts[0].init.body)).rows[0].rain24h).toBe(12);
    expect(JSON.parse(String(posts[1].init.body)).catalogueCount).toBe(2);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method !== "POST").every(([, init]) => !(init?.headers as Record<string, string>)?.["X-Relay-Secret"])).toBe(true);
  });
  it.each([429, 500])("fails visibly without retrying source HTTP %s or publishing empty data", async status => {
    const fetcher = vi.fn(async () => response({}, status));
    await expect(runStandby({ mode: "drill", secret: "test-secret", fetchImpl: fetcher, now: () => NOW, log: vi.fn() })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("treats primary recovery during collection as a harmless race without retry", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? response({}, 409) : upstream(url));
    await runStandby({ mode: "drill", secret: "test-secret", fetchImpl: fetcher, now: () => NOW, log: vi.fn() });
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
  });
  it("does not publish an empty successful upstream response", async () => {
    const fetcher = vi.fn(async () => response({ data: [] }));
    await expect(runStandby({ mode: "drill", secret: "test-secret", fetchImpl: fetcher, now: () => NOW, log: vi.fn() })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("enforces the byte limit even without Content-Length", async () => {
    const fetcher = vi.fn(async () => new Response(" ".repeat(2_000_001)));
    await expect(runStandby({ mode: "probe", fetchImpl: fetcher, now: () => NOW, log: vi.fn() })).rejects.toThrow();
  });
  it("rejects oversized responses before parsing or publishing", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { headers: { "content-length": "3000000" } }));
    await expect(runStandby({ mode: "probe", fetchImpl: fetcher, now: () => NOW, log: vi.fn() })).rejects.toThrow();
  });
});
