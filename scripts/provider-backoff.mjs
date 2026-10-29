// Per-provider attempt clock for the flights relay: a provider that answers
// 429 (or keeps failing) is left alone until its cooldown ends, instead of
// being retried every 30 s tick. Import-free so Node loads it as-is.
// Cooldowns are process-local; a relay restart does not retain them.

const BASE_MS = 60_000;
const MAX_MS = 15 * 60_000;

/** Retry-After accepts integer delay-seconds or an HTTP-date. */
/** @param {string | null} value @param {number} [now] */
export function parseRetryAfter(value, now = Date.now()) {
  const text = value?.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const seconds = Number(text);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }
  // Do not reinterpret malformed numeric delays as calendar dates.
  const at = /[a-z]/i.test(text) ? Date.parse(text) : NaN;
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : null;
}

export function createBackoff(now = () => Date.now()) {
  const state = new Map(); // name -> { until, failures }
  return {
    /** True while the provider is cooling down. */
    blocked(name) {
      return (state.get(name)?.until ?? 0) > now();
    },
    /** Seconds left, for log lines. */
    remainingSec(name) {
      return Math.max(0, Math.ceil(((state.get(name)?.until ?? 0) - now()) / 1000));
    },
    /** Record a failure; honours Retry-After (seconds) when the provider sent one. */
    /** @param {string} name @param {number | null} [retryAfterSec] */
    failure(name, retryAfterSec = null) {
      const failures = (state.get(name)?.failures ?? 0) + 1;
      const exp = Math.min(MAX_MS, BASE_MS * 2 ** (failures - 1));
      const asked = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 0;
      // The cap bounds our own exponential retries, never a longer rest
      // explicitly required by the provider.
      state.set(name, { failures, until: now() + Math.max(exp, asked) });
    },
    success(name) {
      state.delete(name);
    },
  };
}
