// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { __resetLangForTests } from "../../hooks/useLang";
import { fetchJsonOrNull } from "../../lib/client-requests";
import type { YoutubeResponse, YoutubeVideo } from "../../lib/cnx/youtube";
import CnxYouTubeCoverage from "./CNXYouTubeCoverage";
vi.mock("../../lib/client-requests", () => ({ fetchJsonOrNull: vi.fn() }));
const NOW = Date.parse("2026-11-03T08:00:00Z");
const ago = (hours: number) => new Date(NOW - hours * 3600_000).toISOString();
const video = (number: number): YoutubeVideo => ({ id: `sample0000${number}`, title: `Chiang Mai coverage ${number}`, channelId: `UC${"a".repeat(22)}`, channelTitle: "Source channel", publishedAt: ago(36), viewCount: 12000 - number, embeddable: true, madeForKids: false, language: "en" });
const feed = (): YoutubeResponse => ({ provenance: "cached", state: "current", source: "YouTube Data API v3", generatedAt: ago(1), capturedAt: ago(1), windowStart: ago(24 * 30 + 1), windowEnd: ago(1), videos: [1, 2, 3, 4].map(video), queries: [{ language: "en", query: "Chiang Mai", status: "ok", resultCount: 4 }], detailsFailed: 0, note: "Snapshot, not verified reporting" });
let observers: Observer[];
class Observer {
  callback: IntersectionObserverCallback;
  disconnect = vi.fn();
  observe = vi.fn();
  constructor(callback: IntersectionObserverCallback) { this.callback = callback; observers.push(this); }
  visible(value: boolean) { this.callback([{ isIntersecting: value, intersectionRatio: value ? 1 : 0 } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
}
let container: HTMLDivElement;
let root: Root;
let visibility: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers(); vi.setSystemTime(NOW); __resetLangForTests("en");
  observers = []; vi.stubGlobal("IntersectionObserver", Observer);
  visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: true, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true }));
  vi.mocked(fetchJsonOrNull).mockReset().mockResolvedValue(feed());
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const render = (props: { active?: boolean; office?: boolean } = {}) => act(async () => root.render(<CnxYouTubeCoverage {...props} />));
const click = async (label: string) => act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === label)!.click());
const seeAll = () => act(async () => observers.forEach(observer => observer.visible(true)));
it("does not contact YouTube before explicit loading, preserves source dates/views and native controls", async () => {
  await render(); await seeAll();
  expect(container.querySelector("iframe")).toBeNull(); expect(container.querySelector("img")).toBeNull();
  expect(fetchJsonOrNull).toHaveBeenCalledWith("/api/cnx/youtube", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(container.textContent).toContain("cumulative views at capture"); expect(container.textContent).toContain("Not views gained in 30 days");
  expect([...container.querySelectorAll("time")].some(time => time.dateTime === feed().capturedAt)).toBe(true);
  await click("Load muted YouTube players");
  const frames = [...container.querySelectorAll("iframe")]; expect(frames).toHaveLength(2);
  const url = new URL(frames[0].src); expect(url.origin).toBe("https://www.youtube-nocookie.com"); expect(url.searchParams.get("controls")).toBe("1"); expect(url.searchParams.get("mute")).toBe("1"); expect(url.searchParams.get("autoplay")).toBe("0");
  await click("Stop players"); expect(container.querySelector("iframe")).toBeNull();
});
it("rejects injected IDs and unconfirmed audience settings before constructing any player URL", async () => {
  const data = feed(); data.videos = [{ ...video(1), id: 'x?origin=evil' }, { ...video(2), madeForKids: null }, { ...video(3), madeForKids: true }, video(4)];
  vi.mocked(fetchJsonOrNull).mockResolvedValue(data);
  await render(); await seeAll(); await click("Load muted YouTube players");
  expect(container.querySelectorAll("iframe")).toHaveLength(1);
  expect(container.querySelector("iframe")?.src).toContain(`/embed/${video(4).id}?`);
  expect(container.querySelector('a[href*="evil"]')).toBeNull();
});
it("splits office rotations without duplicate videos and removes hidden/offscreen players", async () => {
  await render({ office: true }); await seeAll(); await click("Start muted office screen");
  const frames = [...container.querySelectorAll("iframe")]; expect(frames).toHaveLength(2);
  const ids = frames.flatMap(frame => { const url = new URL(frame.src); expect(url.searchParams.get("loop")).toBe("1"); expect(url.searchParams.get("autoplay")).toBe("1"); return [url.pathname.split("/").at(-1), ...url.searchParams.get("playlist")!.split(",")]; });
  expect(new Set(ids).size).toBe(4); expect(ids).toHaveLength(4);
  await act(async () => observers[0].visible(false)); expect(container.querySelectorAll("iframe")).toHaveLength(1);
  await act(async () => { visibility.mockReturnValue("hidden"); document.dispatchEvent(new Event("visibilitychange")); });
  expect(container.querySelector("iframe")).toBeNull();
});
it("shows one player on phone and resets consent/aborts polling when the parent closes", async () => {
  vi.mocked(window.matchMedia).mockImplementation(query => ({ matches: false, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true }));
  await render({ office: true }); await seeAll(); await click("Start muted office screen");
  expect(container.querySelectorAll("iframe")).toHaveLength(1);
  const signal = vi.mocked(fetchJsonOrNull).mock.calls[0][1]?.signal;
  await render({ active: false, office: true }); expect(container.querySelector("iframe")).toBeNull(); expect(signal?.aborted).toBe(true);
  const calls = vi.mocked(fetchJsonOrNull).mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000)); expect(fetchJsonOrNull).toHaveBeenCalledTimes(calls);
  await render({ office: true }); await seeAll(); expect(container.querySelector("iframe")).toBeNull();
});
it("labels retained data stale on refresh failure and ages it out without a new response", async () => {
  await render(); vi.mocked(fetchJsonOrNull).mockResolvedValue(null);
  await act(async () => vi.advanceTimersByTimeAsync(5 * 60_000));
  expect(container.textContent).toContain("Stale · retry"); expect(container.textContent).not.toContain("Daily snapshot");
  expect(container.textContent).toContain("Chiang Mai coverage 1");
  vi.setSystemTime(NOW + 49 * 3600_000);
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(container.textContent).toContain("Unavailable"); expect(container.textContent).not.toContain("Chiang Mai coverage 1");
});
it("ends an initial failed load with an honest retry state", async () => {
  vi.mocked(fetchJsonOrNull).mockResolvedValue(null); await render();
  expect(container.textContent).toContain("Unavailable"); expect(container.textContent).not.toContain("Loading…");
  vi.mocked(fetchJsonOrNull).mockResolvedValue(feed()); await click("Refresh catalogue");
  expect(container.textContent).toContain("Daily snapshot");
});

it("re-ages a retained current response across the daily freshness boundary", async () => {
  const data = feed(); data.capturedAt = ago(23.99); data.generatedAt = data.capturedAt;
  vi.mocked(fetchJsonOrNull).mockResolvedValue(data); await render();
  expect(container.textContent).toContain("Daily snapshot");
  await act(async () => vi.advanceTimersByTimeAsync(2 * 60_000));
  expect(container.textContent).toContain("Stale · retry");
  expect(container.textContent).not.toContain("Daily snapshot");
});

it("does not briefly relabel expired retained data current while a reopened parent waits for refresh", async () => {
  await render(); await render({ active: false }); vi.setSystemTime(NOW + 49 * 3600_000);
  let finish!: (value: null) => void;
  vi.mocked(fetchJsonOrNull).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render();
  expect(container.textContent).toContain("Unavailable");
  expect(container.textContent).not.toContain("Daily snapshot");
  expect(container.textContent).not.toContain("Chiang Mai coverage 1");
  await act(async () => finish(null));
});
