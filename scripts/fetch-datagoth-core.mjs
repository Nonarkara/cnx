// The testable half of the data.go.th bake: how one page of results is
// fetched, and how a result set is enumerated.
//
// These live apart from fetch-datagoth-cnx.mjs so the two guarantees that
// actually broke can be tested without crawling 682 datasets:
//   1. a failed page is retried, not treated as the end of the results;
//   2. an incomplete enumeration is an error, never a quietly shorter list.
//
// (1) matters because the upstream gateway times out around 120 s and the
// response gets slower as `rows` grows — see the measurement table in the
// bake script. (2) matters because the published index is presented to
// readers as the result of a search: a partial enumeration published as a
// complete one is an omission error, which this board treats as fatal.

export const CKAN_BASE = "https://data.go.th/api/3/action";
export const USER_AGENT = "cnx-dashboard/1.0 (https://cnx.nonarkara.org; nonarkara)";

/**
 * The upstream gateway times out around 120 s and the response gets SLOWER
 * as rows grows, so the ceiling is a TIME limit, not a row cap. Measured on
 * the live instance, same query, two attempts each:
 *   rows=  50 -> 200, 0.63 MB,  ~13 s
 *   rows= 100 -> 200, 0.98 MB,  ~25 s
 *   rows= 200 -> 200, 2.02 MB,  ~56 s
 *   rows= 300 -> 200 once (105 s), 502 once (120 s)
 *   rows=1000 -> 502            <- the old default, so the bake could not run
 * 50 leaves ~9x headroom per request and, across 323 matches, costs the
 * same wall clock as 100 (7 x 13 s vs 4 x 25 s) with far more slack.
 */
export const PAGE_SIZE = 50;

/** Abort before the upstream's own ~120 s gateway gives up. */
export const REQUEST_TIMEOUT_MS = 90_000;
export const HTTP_ATTEMPTS = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A 4xx is the upstream's actual answer, not a hiccup — it must not be retried. */
class NotRetryableError extends Error {}

/**
 * One CKAN request, retried on the upstream's own "try later".
 *
 * 5xx and 429 are retried with backoff; a 4xx is a real answer and is NOT
 * retried into a different one. A network failure and a timeout are retried
 * for the same reason — the upstream drops the connection on a page that
 * takes too long, and the next attempt is usually a smaller, faster page.
 */
export async function http(
  path,
  {
    method = "GET",
    body,
    attempts = HTTP_ATTEMPTS,
    base = CKAN_BASE,
    fetchImpl = fetch,
    sleepImpl = sleep,
    timeoutMs = REQUEST_TIMEOUT_MS,
    onRetry = null,
  } = {},
) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          "Content-Type": body ? "application/json" : undefined,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 500 || res.status === 429) {
        throw new Error(`${method} ${path} → ${res.status}`);
      }
      if (!res.ok) throw new NotRetryableError(`${method} ${path} → ${res.status}`);
      return await res.json();
    } catch (err) {
      // A definitive answer stops here: retrying a 400 into a 200 would
      // replace the upstream's truth with a different one.
      if (err instanceof NotRetryableError) throw err;
      lastErr = err;
      if (attempt < attempts) {
        const wait = 1500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 750);
        if (onRetry) onRetry(err, attempt, attempts, wait);
        await sleepImpl(wait);
      }
    }
  }
  throw lastErr;
}

/**
 * Every package matching one query, enumerated.
 *
 * The count on the FIRST page is a floor on the population: every package
 * that matched when the crawl began appears in it. If the crawl ends with
 * fewer distinct ids than that, a page was lost — and a lost page must be
 * an error, not a shorter list, because the index this feeds is published
 * as a complete catalogue.
 */
export async function listAll(
  q,
  {
    pageSize = PAGE_SIZE,
    base = CKAN_BASE,
    fetchImpl = fetch,
    attempts = HTTP_ATTEMPTS,
    sleepImpl = sleep,
    onRetry = null,
  } = {},
) {
  const out = new Map();
  let start = 0;
  let expected = null;
  while (true) {
    const url = `/package_search?q=${encodeURIComponent(q)}&rows=${pageSize}&start=${start}`;
    let json;
    try {
      json = await http(url, { base, fetchImpl, attempts, sleepImpl, onRetry });
    } catch (err) {
      // A page that could not be read is a lost page. Say so, and say how
      // much of the population it took with it — a bare "fetch failed" hides
      // whether the crawl was whole.
      const seen = expected === null ? out.size : Math.max(out.size, 0);
      throw new Error(
        `enumeration failed for "${q}" after ${seen} of ${expected ?? "?"} packages: ${err.message}`,
      );
    }
    const result = json?.result;
    if (!result) break;
    const { results, count } = result;
    if (expected === null) expected = count;
    for (const r of results) {
      const key = r.id || r.name;
      if (!out.has(key)) out.set(key, r);
    }
    start += results.length;
    if (start >= count || results.length === 0) break;
  }
  if (expected !== null && out.size < expected) {
    throw new Error(`population incomplete for "${q}": enumerated ${out.size} of ${expected}`);
  }
  return [...out.values()];
}
