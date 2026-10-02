// Shared client request helpers — fetchJsonOrNull, scenario URL
// builder, AbortError detection. Mirrors Lopburi's pattern verbatim
// so both dashboards stay operationally identical.

export function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if ((err as { name?: string }).name === "AbortError") return true;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return false;
}

export function buildScenarioUrl(base: string, scenarioId: string | null): string {
  if (!scenarioId) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}scenario=${encodeURIComponent(scenarioId)}`;
}

/**
 * Fetches a JSON document; returns null on abort / network error so
 * the polling effect can keep ticking. The server is allowed to be
 * sick — we never want one slow tick to jam the next one.
 */
export async function fetchJsonOrNull<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T | null> {
  const { timeoutMs = 12_000, ...rest } = init;
  const controller = new AbortController();
  const abort = () => controller.abort(rest.signal?.reason);
  if (rest.signal?.aborted) abort();
  else rest.signal?.addEventListener("abort", abort, { once: true });
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(rest.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  try {
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    if (isAbortError(err)) return null;
    return null;
  } finally {
    window.clearTimeout(timeoutId);
    rest.signal?.removeEventListener("abort", abort);
  }
}