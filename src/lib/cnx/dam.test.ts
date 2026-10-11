import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./dam-fixture.json";
import { fetchCnxDam, isDamPayload } from "./dam";
import { selectDamRows } from "./dam-core";
import { readRelayJson } from "./relay-kv";

vi.mock("./relay-kv", async (importOriginal) => ({ ...(await importOriginal<typeof import("./relay-kv")>()), readRelayJson: vi.fn() }));

const NOW = Date.parse("2026-10-11T05:00:00Z");
const rows = selectDamRows(fixture);
const payload = { generatedAt: new Date(NOW).toISOString(), rows };

beforeEach(() => vi.mocked(readRelayJson).mockReset());
afterEach(() => vi.restoreAllMocks());

describe("dam ingest validation", () => {
  it("accepts the relay's own output and rejects tampered rows", () => {
    expect(isDamPayload(payload)).toBe(true);
    expect(isDamPayload({ ...payload, rows: [{ ...rows[0], date: "2026-02-30" }] })).toBe(false);
    expect(isDamPayload({ ...payload, rows: [{ ...rows[0], storageMcm: -1 }] })).toBe(false);
    expect(isDamPayload({ ...payload, rows: [{ ...rows[0], kind: "small" }] })).toBe(false);
    expect(isDamPayload({ ...payload, rows: [{ ...rows[0], upstreamPct: 0 }] })).toBe(false);
    expect(isDamPayload({ generatedAt: "not a date", rows })).toBe(false);
  });
});

describe("fetchCnxDam — live vs unavailable", () => {
  it("is live with collection time and report day kept separate", async () => {
    vi.mocked(readRelayJson).mockResolvedValue(payload);
    const res = await fetchCnxDam(NOW);
    expect(res).toMatchObject({ provenance: "live", collectedAt: payload.generatedAt, newestDate: "2026-10-11", unavailableReason: null });
    expect(res.large).toHaveLength(3);
  });
  it("says unavailable, with a reason, when the relay is silent", async () => {
    vi.mocked(readRelayJson).mockResolvedValue(null);
    const res = await fetchCnxDam(NOW);
    expect(res.provenance).toBe("unavailable");
    expect(res.large).toEqual([]);
    expect(res.unavailableReason).toMatch(/not the same as normal/);
  });
  it("does not present a fresh relay carrying old reports as live", async () => {
    vi.mocked(readRelayJson).mockResolvedValue(payload);
    const res = await fetchCnxDam(Date.parse("2026-10-15T05:00:00Z"));
    expect(res.provenance).toBe("unavailable");
    expect(res.unavailableReason).toMatch(/unknown, not normal/);
  });
});
