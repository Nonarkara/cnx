// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJsonOrNull } from './client-requests';
afterEach(() => vi.unstubAllGlobals());
describe('client request cancellation', () => {
  it('forwards caller abort to an in-flight fetch', async () => {
    let actualSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      actualSignal = init.signal!;
      actualSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const controller = new AbortController();
    const request = fetchJsonOrNull('/api/cnx/flood', { signal: controller.signal });
    controller.abort();
    expect(actualSignal?.aborted).toBe(true);
    await expect(request).resolves.toBeNull();
  });
  it('keeps an already-aborted caller signal aborted and preserves Headers instances', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      expect(init.signal?.aborted).toBe(true);
      expect(new Headers(init.headers).get('X-Test')).toBe('present');
      expect(new Headers(init.headers).get('Accept')).toBe('application/json');
      throw new DOMException('Aborted', 'AbortError');
    }));
    await expect(fetchJsonOrNull('/api/cnx/flood', { signal: controller.signal, headers: new Headers({ 'X-Test': 'present' }) })).resolves.toBeNull();
  });
});
