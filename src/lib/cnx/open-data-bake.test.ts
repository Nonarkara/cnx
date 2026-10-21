// The bake's two guarantees, tested without crawling 682 datasets.
//
// Both of these failed for real. The upstream gateway times out around 120 s
// and the response gets slower as `rows` grows, so the old page size of 1000
// made the bake impossible to run at all. And when a search DID fail, the
// error was swallowed and the bake published whatever it had — 316 of 682
// datasets — as though it were the whole result. The index this feeds is
// quoted to readers as the outcome of a search, so a partial enumeration
// published as a complete one is an omission error, which this board treats
// as fatal.

import { describe, expect, it } from "vitest";
import { HTTP_ATTEMPTS, PAGE_SIZE, http, listAll } from "../../../scripts/fetch-datagoth-core.mjs";

/** A fetch that serves a scripted sequence of responses, in order. */
function scriptedFetch(responses: Array<{ status: number; body?: unknown }>) {
  const calls: string[] = [];
  const impl = async (url: string) => {
    calls.push(String(url));
    const next = responses.shift();
    if (!next) throw new Error(`fetch called more often than scripted: ${url}`);
    if (next.status >= 400) {
      return { ok: false, status: next.status, json: async () => ({}) } as unknown as Response;
    }
    return { ok: true, status: next.status, json: async () => next.body } as unknown as Response;
  };
  return { impl, calls };
}

const page = (ids: string[], count: number) => ({
  status: 200,
  body: { result: { count, results: ids.map((id) => ({ id, name: id })) } },
});

const noSleep = async () => {};

describe("the CKAN page size the upstream tolerates", () => {
  it("asks for small pages, not 1000", () => {
    // Measured live 21 Oct 2026: rows=1000 answers 502, rows=300 is 200 once
    // and 502 once, rows=50 is 200 every time. The limit is TIME, not rows.
    expect(PAGE_SIZE).toBeLessThanOrEqual(50);
  });
});

describe("a failing page is retried, not mistaken for the end", () => {
  it("retries a 502 and then succeeds", async () => {
    const { impl, calls } = scriptedFetch([{ status: 502 }, page(["a"], 1)]);
    const json = await http("/package_search?q=x", {
      fetchImpl: impl as unknown as typeof fetch,
      sleepImpl: noSleep,
    });
    expect((json as { result: { count: number } }).result.count).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it("gives up after the attempt budget rather than looping", async () => {
    const { impl, calls } = scriptedFetch(Array.from({ length: HTTP_ATTEMPTS + 3 }, () => ({ status: 502 })));
    await expect(
      http("/package_search?q=x", { fetchImpl: impl as unknown as typeof fetch, sleepImpl: noSleep }),
    ).rejects.toThrow(/502/);
    expect(calls).toHaveLength(HTTP_ATTEMPTS);
  });

  it("does NOT retry a 4xx — that is a real answer, not a hiccup", async () => {
    const { impl, calls } = scriptedFetch([{ status: 400 }]);
    await expect(
      http("/package_search?q=x", { fetchImpl: impl as unknown as typeof fetch, sleepImpl: noSleep }),
    ).rejects.toThrow(/400/);
    expect(calls).toHaveLength(1);
  });
});

describe("the enumeration is a population, not a sample", () => {
  it("walks every page until the advertised count is reached", async () => {
    const { impl, calls } = scriptedFetch([page(["a", "b"], 3), page(["c"], 3)]);
    const out = await listAll("เชียงใหม่", {
      fetchImpl: impl as unknown as typeof fetch,
      sleepImpl: noSleep,
      pageSize: 2,
    });
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("rows=2");
    expect(calls[1]).toContain("start=2");
  });

  it("refuses to return a short list when a page went missing", async () => {
    // The count says 3, the upstream hands back 2 and then nothing. The
    // crawl must FAIL rather than hand back a list that looks complete.
    const { impl } = scriptedFetch([page(["a", "b"], 3), { status: 200, body: { result: { count: 3, results: [] } } }]);
    await expect(
      listAll("เชียงใหม่", {
        fetchImpl: impl as unknown as typeof fetch,
        sleepImpl: noSleep,
        pageSize: 2,
      }),
    ).rejects.toThrow(/population incomplete/);
  });

  it("says how much of the population was lost when a page cannot be read", async () => {
    // A page that fails outright is a lost page: the error must name the
    // shortfall, not just "fetch failed", so the operator knows whether the
    // crawl was whole.
    const { impl } = scriptedFetch([page(["a", "b"], 3), { status: 502 }, { status: 502 }, { status: 502 }, { status: 502 }]);
    await expect(
      listAll("เชียงใหม่", {
        fetchImpl: impl as unknown as typeof fetch,
        sleepImpl: noSleep,
        pageSize: 2,
      }),
    ).rejects.toThrow(/enumeration failed .* after 2 of 3 packages/);
  });

  it("deduplicates by id so a repeated package is not counted twice", async () => {
    // The first page advertises 3 packages; the second repeats "b".
    const { impl } = scriptedFetch([page(["a", "b"], 3), page(["b", "c"], 3)]);
    const out = await listAll("เชียงใหม่", {
      fetchImpl: impl as unknown as typeof fetch,
      sleepImpl: noSleep,
      pageSize: 2,
    });
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});
