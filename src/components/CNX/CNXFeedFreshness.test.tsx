// @vitest-environment happy-dom
//
// The top bar's freshness strip: "ฟีดตรงเวลา n/m", per-feed age against its
// own stale limit, green / amber / grey — and grey (no observation) is
// never counted or coloured as on time. One language per mode.

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetLangForTests } from "../../hooks/useLang";
import { thaiCharCount, type Lang } from "../../lib/i18n";
import { buildManifest, type LiveReading } from "../../lib/cnx/twin-manifest";
import { FeedFreshnessStrip, formatDuration } from "./CNXFeedFreshness";

const NOW = Date.parse("2026-10-11T05:00:00Z");
const ago = (sec: number) => new Date(NOW - sec * 1000).toISOString();
const meta = { nowMs: NOW, version: "1.9.0", commit: "abc1234" };

// dustboy on time; firms stale; everything else has no observation.
const READINGS: Record<string, LiveReading> = {
  dustboy: { lastObservedAt: ago(20 * 60), provenance: "live" },
  firms: { lastObservedAt: ago(3 * 3600), provenance: "live" },
  rain: { lastObservedAt: ago(10 * 60), provenance: "relay" },
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  __resetLangForTests(null);
  vi.unstubAllGlobals();
});

async function render(lang: Lang, readings: Record<string, LiveReading>, now = NOW): Promise<string> {
  __resetLangForTests(lang);
  await act(async () => root.render(createElement(FeedFreshnessStrip, { manifest: buildManifest(readings, meta), now })));
  return container.textContent ?? "";
}

const rowState = (name: string) =>
  Array.from(container.querySelectorAll("li")).find((li) => li.textContent?.includes(name));

describe("feed freshness strip", () => {
  it("counts only feeds within their SLO, in Thai", async () => {
    const text = await render("th", READINGS);
    const total = buildManifest(READINGS, meta).slo.total;
    expect(text).toContain(`ฟีดตรงเวลา 2/${total}`);
    expect(text).not.toMatch(/Feeds on time|on time|stale|no observation/);
    expect(text).toContain("ไม่มีค่าสังเกต");
    expect(text).toContain("20 นาที / 3 ชม.");
  });

  it("speaks English only in English mode", async () => {
    const text = await render("en", READINGS);
    expect(text).toContain("Feeds on time 2/");
    expect(text).toContain("20 min / 3 h");
    expect(text).toContain("DustBoy sensors (CMU CCDC)");
    expect(thaiCharCount(text)).toBe(0);
    const labels = Array.from(container.querySelectorAll("[title]")).map((el) => el.getAttribute("title") ?? "").join(" ");
    expect(thaiCharCount(labels)).toBe(0);
  });

  it("colours on-time green, stale amber, and a missing observation grey — never green", async () => {
    await render("en", READINGS);
    const dust = rowState("DustBoy");
    const firms = rowState("NASA FIRMS");
    const aeronet = rowState("AERONET");
    expect(dust?.dataset.state).toBe("within");
    expect(dust?.querySelector(".sev-fill-good")).not.toBeNull();
    expect(firms?.dataset.state).toBe("stale");
    expect(firms?.querySelector(".sev-fill-watch")).not.toBeNull();
    expect(firms?.textContent).toContain("stale");
    expect(aeronet?.dataset.state).toBe("missing");
    expect(aeronet?.querySelector(".sev-fill-unknown")).not.toBeNull();
    expect(aeronet?.querySelector(".sev-fill-good")).toBeNull();
    expect(aeronet?.textContent).toContain("no observation");
  });

  it("lists problems first and leaves feeds without an SLO out", async () => {
    await render("en", READINGS);
    const states = Array.from(container.querySelectorAll("li")).map((li) => li.dataset.state);
    expect(states[0]).toBe("stale");
    expect(states.at(-1)).toBe("within");
    expect(container.textContent).not.toContain("Heritage sites");
  });

  it("says the relay is offline, and since when, past 45 minutes", async () => {
    const stale = { ...READINGS, rain: { lastObservedAt: ago(2 * 3600), provenance: "relay" } };
    const th = await render("th", stale);
    expect(th).toContain("เครื่องรีเลย์ออฟไลน์ตั้งแต่");
    const en = await render("en", stale);
    expect(en).toContain("Relay offline since 11 Oct, 10:00");
    expect(thaiCharCount(en)).toBe(0);
  });

  it("reports a live relay by its last push", async () => {
    const en = await render("en", READINGS);
    expect(en).toContain("Relay last pushed 10 min ago");
    expect(en).not.toContain("Relay offline");
  });

  it("keeps ageing between fetches: an on-time feed goes amber when the clock passes its limit", async () => {
    await render("en", READINGS, NOW + 3 * 3600 * 1000);
    expect(rowState("DustBoy")?.dataset.state).toBe("stale");
  });

  it("shows an unknown state, not a count, before the manifest arrives", async () => {
    __resetLangForTests("en");
    await act(async () => root.render(createElement(FeedFreshnessStrip, { manifest: null, now: NOW })));
    expect(container.textContent).toContain("Feeds on time — unknown");
    expect(container.textContent).not.toMatch(/\d+\/\d+/);
  });
});

describe("formatDuration", () => {
  it("rounds to the nearest unit in each language", () => {
    expect(formatDuration(20, "en")).toBe("<1 min");
    expect(formatDuration(45 * 60, "en")).toBe("45 min");
    expect(formatDuration(3 * 3600, "th")).toBe("3 ชม.");
    expect(formatDuration(3 * 86_400, "en")).toBe("3 d");
  });
});
