import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, { value: string; ttl?: number }>();
const kv = {
  get: vi.fn(async (k: string) => store.get(k)?.value ?? null),
  put: vi.fn(async (k: string, value: string, o?: { expirationTtl?: number }) => {
    store.set(k, { value, ttl: o?.expirationTtl });
  }),
};
const waitUntil = vi.fn();
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: { CNX_FLIGHTS_KV: kv }, ctx: { waitUntil } }) }));

const { inBackground, recordWarnings } = await import("./warning-log");
const { SNAPSHOT_KEY, WARNING_LOG_TTL_S } = await import("./warning-log-core");

const NOW = Date.parse("2026-10-11T05:00:00Z");
const verdict = (level: string) => ({ level, score: 50, reasonEn: "x", provenance: "live" });

describe("recordWarnings (KV)", () => {
  beforeEach(() => {
    store.clear();
    kv.put.mockClear();
  });

  it("appends to warning-log:{YYYY-MM} and stores the snapshot, both with a 400-day TTL", async () => {
    await recordWarnings({ verdict: verdict("watch") }, NOW);
    const month = store.get("warning-log:2026-10");
    expect(JSON.parse(month?.value ?? "[]")).toHaveLength(1);
    expect(month?.ttl).toBe(WARNING_LOG_TTL_S);
    expect(store.get(SNAPSHOT_KEY)?.ttl).toBe(WARNING_LOG_TTL_S);
  });

  it("writes nothing to KV when nothing changed", async () => {
    await recordWarnings({ verdict: verdict("watch") }, NOW);
    kv.put.mockClear();
    expect(await recordWarnings({ verdict: verdict("watch") }, NOW + 60_000)).toEqual([]);
    expect(kv.put).not.toHaveBeenCalled();
    await recordWarnings({ verdict: verdict("prepare") }, NOW + 120_000);
    expect(JSON.parse(store.get("warning-log:2026-10")?.value ?? "[]").map((r: { to: string }) => r.to)).toEqual(["watch", "prepare"]);
  });

  it("hands the write to ctx.waitUntil instead of waiting for it", async () => {
    let finish: () => void = () => {};
    const slow = new Promise<void>((resolve) => { finish = resolve; });
    await inBackground(slow);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    finish();
  });
});
