#!/usr/bin/env node
/**
 * CNX spatial check — the board's layout gate.
 *
 * The board's map is the hero and its chrome must never eat the reader's
 * window. This gate measures the live board in a real browser (headless
 * Chrome over CDP, because the in-app browser times out on this page) and
 * fails on the spatial defects this board has actually suffered:
 *
 *   verdict-band-once        the verdict band appears exactly once, visible,
 *                             and above the board
 *   evidence-panel-onscreen  the "Evidence and limits" panel opens fully
 *                             inside the viewport (it used to open at
 *                             x = -180 at 390 px)
 *   evidence-panel-clears    the open panel covers none of the map's own
 *   map-controls             controls — the defect class this board paid for
 *                             once (docs/SHIP-AUDIT.md)
 *   news-list-window         the news list keeps a readable window; it used
 *                             to be 30 px at 1024 px and 7 px at 640 px tall
 *   no-clipped-text          no text that exists but cannot be read
 *
 * Usage:
 *   node scripts/cnx-spatial-check.mjs [--url https://cnx.nonarkara.org/cnx]
 *                                       [--sizes 390x844,768x1024,1024x900,1366x640,1440x900]
 *                                       [--theme dark|light] [--lang th|en]
 *                                       [--inject-fault d1|d2|none]
 *
 * --inject-fault re-creates a known defect in the live DOM so you can watch
 * this gate fail. A gate that has never been seen to fail proves nothing:
 *
 *   node scripts/cnx-spatial-check.mjs --inject-fault d1   # panel off-screen
 *   node scripts/cnx-spatial-check.mjs --inject-fault d2   # panel on the key
 *
 * Exit code 0 = every check passed. 1 = at least one failed.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const URL_ = arg("url", "https://cnx.nonarkara.org/cnx");
const THEME = arg("theme", "dark");
const LANG = arg("lang", "th");
const SIZES = arg("sizes", "390x844,768x1024,1024x900,1366x640,1440x900")
  .split(",").map((s) => s.split("x").map(Number)).filter(([w, h]) => w > 0 && h > 0);
const OUT = arg("out", "/tmp/cnx-spatial-check");
const INJECT = arg("inject-fault", "none");
const PORT = Number(arg("port", "9444"));
const MAXWAIT = Number(arg("maxwait", "150000"));

await mkdir(OUT, { recursive: true });
const PROFILE = `/tmp/cnx-spatial-profile-${PORT}`;
await rm(PROFILE, { recursive: true, force: true });

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--enable-unsafe-swiftshader",
  "--use-gl=angle", "--use-angle=swiftshader", "--hide-scrollbars", "--force-device-scale-factor=1",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on("exit", () => { try { chrome.kill(); } catch {} });

async function targetWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error("no chrome");
}
const ws = new WebSocket(await targetWs());
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
};
const send = (method, params = {}) => {
  const id = ++seq;
  return new Promise((res, rej) => {
    pending.set(id, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
};
await send("Page.enable");
await send("Runtime.enable");

/** Measured in the page. One probe answers every check. */
const PROBE = `(() => {
  const root = document.querySelector('main') || document.body;
  const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom), right: Math.round(b.right) }; };
  const txt = el => el ? (el.textContent || "").replace(/\\s+/g, " ").trim() : null;
  const visible = el => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };

  const bands = [...document.querySelectorAll('[data-surface="cnx-verdict-band"]')];
  const band = bands[0] || null;
  const railRoot = document.querySelector('[data-surface="cnx-news-rail"]');
  const mapSec = root.querySelector('section[aria-label*="แผนที่"], section[aria-label*="Operational map"]');
  const list = railRoot ? [...railRoot.children].find(c => String(c.className || "").includes("overflow-y-auto")) : null;
  const articles = list ? [...list.querySelectorAll("article")] : [];

  const details = band ? band.querySelector("details") : null;
  const summary = details ? details.querySelector("summary") : null;
  const panel = details ? [...details.children].find(c => c.tagName.toLowerCase() !== "summary") : null;
  const panelBox = panel ? box(panel) : null;

  // The map's own controls: absolutely positioned and above the map canvas.
  // MapLibre's canvas is absolute too, so a control is told apart by z-index.
  const controls = mapSec ? [...mapSec.querySelectorAll("*")].filter(el => {
    const cs = getComputedStyle(el);
    if (cs.position !== "absolute" && cs.position !== "fixed") return false;
    const z = parseInt(cs.zIndex, 10);
    if (Number.isNaN(z) || z < 10) return false;
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  }).map(el => ({ ...box(el), text: (txt(el) || "").slice(0, 36) })) : [];

  const overlaps = (a, b) => a && b && !(a.right <= b.x || a.x >= b.right || a.bottom <= b.y || a.y >= b.bottom);
  const panelHits = panelBox ? controls.filter(c => overlaps(panelBox, c)) : [];

  // Text that exists but cannot be read. Two classes are NOT defects and
  // must not be reported: screen-reader-only text (.sr-only), and an element
  // that is itself a horizontal scroller (its own overflow is the answer to
  // "is the rest reachable?").
  const clipped = [...document.querySelectorAll("body *")].filter(el => {
    if (el.closest(".sr-only") || el.classList.contains("sr-only")) return false;
    const own = getComputedStyle(el);
    if (["auto", "scroll"].includes(own.overflowX) || ["auto", "scroll"].includes(own.overflowY)) return false;
    if (el.scrollWidth <= el.clientWidth + 1) return false;
    if (el.clientWidth === 0 || el.clientHeight === 0) return false;
    if (!(el.textContent || "").trim()) return false;
    let p = el.parentElement, clipper = null;
    while (p) { const s = getComputedStyle(p); if (s.overflowX !== "visible" || s.overflowY !== "visible") { clipper = p; break; } p = p.parentElement; }
    if (!clipper) return false;
    const cs = getComputedStyle(clipper);
    if (["auto", "scroll"].includes(cs.overflowX) || ["auto", "scroll"].includes(cs.overflowY)) return false;
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0 && b.top < innerHeight && b.bottom > 0;
  }).slice(0, 8).map(el => ({ tag: el.tagName.toLowerCase(), cls: String(el.className || "").slice(0, 40), text: (txt(el) || "").slice(0, 44) }));

  return {
    viewport: [innerWidth, innerHeight],
    bandCount: bands.length,
    bandVisible: visible(band),
    bandBeforeMap: !!(band && mapSec && band.getBoundingClientRect().bottom <= mapSec.getBoundingClientRect().top + 1),
    bandBox: box(band),
    bandHeadline: band && band.querySelector("p") ? box(band.querySelector("p")) : null,
    disclosurePresent: !!details,
    panelBox,
    panelOnScreen: panelBox ? (panelBox.x >= 0 && panelBox.right <= innerWidth + 1 && panelBox.y >= 0 && panelBox.bottom <= innerHeight + 1) : null,
    panelHits,
    controls,
    mapBox: box(mapSec),
    listBox: list ? box(list) : null,
    listArticles: articles.length,
    listClientH: list ? list.clientHeight : null,
    listScrollH: list ? list.scrollHeight : null,
    railOverflowY: railRoot ? getComputedStyle(railRoot).overflowY : null,
    clipped,
  };
})()`;

/** Open the disclosure, and optionally re-create a known defect first. */
const OPEN = `(() => {
  const band = document.querySelector('[data-surface="cnx-verdict-band"]');
  const details = band ? band.querySelector("details") : null;
  const summary = details ? details.querySelector("summary") : null;
  if (!details || !summary) return "no-disclosure";
  const fault = ${JSON.stringify(INJECT)};
  if (fault === "d1") {
    // The original D1: the panel was anchored to the <details>, and at 390
    // that summary wraps to a second line inside a shrink-wrapped details
    // box, so the panel opened at x = -180 — half of every line off-screen.
    details.classList.add("relative");
    details.style.display = "inline-block";
    details.style.width = "max-content";
    const panel = [...details.children].find(c => c.tagName.toLowerCase() !== "summary");
    if (panel) {
      panel.style.position = "absolute";
      panel.style.right = "0";
      panel.style.top = "0";
      panel.style.marginTop = "0";
      panel.style.width = "358px";
    }
  }
  if (fault === "d2") {
    // Remove the clearance so the panel sits on top of the map's own
    // controls — the defect this board already paid for once.
    const panel = [...details.children].find(c => c.tagName.toLowerCase() !== "summary");
    if (panel) { panel.style.marginTop = "0"; }
  }
  if (!details.open) summary.click();
  return details.open ? "opened" : "click-failed";
})()`;

const results = [];
const failures = [];

await send("Emulation.setDeviceMetricsOverride", { width: SIZES[0][0], height: SIZES[0][1], deviceScaleFactor: 1, mobile: SIZES[0][0] < 600 });
await send("Page.addScriptToEvaluateOnNewDocument", { source: `try{localStorage.setItem("cnx.theme",${JSON.stringify(THEME)});localStorage.setItem("cnx-lang",${JSON.stringify(LANG)});}catch(e){}` });
await send("Page.navigate", { url: URL_ });

// The board is loaded ONCE and then resized, not reloaded per viewport.
// Two reasons, both learned the hard way:
//   1. A cold load waits on the twin feed, which aggregated every province
//      feed and took ~110 s under load. Five cold loads made the gate take
//      ten minutes and raced the band into being "missing".
//   2. The band only renders once the twin arrives, so a slow feed is a
//      reason to wait, not a reason to fail.
const loadStart = Date.now();
let twinReady = false;
while (Date.now() - loadStart < MAXWAIT) {
  await sleep(3000);
  const st = await send("Runtime.evaluate", {
    expression: `!!document.querySelector('[data-surface="cnx-verdict-band"]')`,
    returnByValue: true,
  });
  if (st.result?.value) { twinReady = true; break; }
}
if (!twinReady) {
  console.log(`FAIL — the verdict band never rendered within ${Math.round(MAXWAIT / 1000)}s at ${SIZES[0][0]}x${SIZES[0][1]}.`);
  console.log("       The band is conditional on the twin feed; this is a feed/load problem, not a layout one.");
  console.log(`evidence: ${OUT}`);
  process.exit(1);
}
console.log(`board ready in ${Math.round((Date.now() - loadStart) / 1000)}s — measuring ${SIZES.length} viewports\n`);

for (const [w, h] of SIZES) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await sleep(1500); // let React and the map settle after the resize
  await send("Runtime.evaluate", { expression: OPEN, returnByValue: true });
  await sleep(700);
  const res = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
  const g = res.result?.value || {};
  const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 86 });
  const name = `spatial-${w}x${h}-${THEME}-${LANG}${INJECT !== "none" ? `-${INJECT}` : ""}`;
  await writeFile(join(OUT, `${name}.jpg`), Buffer.from(shot.data, "base64"));
  await writeFile(join(OUT, `${name}.json`), JSON.stringify(g, null, 2));

  const checks = [];
  const add = (name, ok, detail) => { checks.push({ name, ok, detail }); if (!ok) failures.push(`${w}x${h} ${THEME}/${LANG}: ${name} — ${detail}`); };

  add("verdict-band-once", g.bandCount === 1, `found ${g.bandCount} bands (expected exactly 1)`);
  add("verdict-band-visible", g.bandVisible === true, "the band is not visible");
  add("verdict-band-above-board", g.bandBeforeMap === true, "the band is not above the map section");
  add("evidence-panel-onscreen", g.panelOnScreen === true, `panel ${JSON.stringify(g.panelBox)} is not fully inside ${JSON.stringify(g.viewport)}`);
  add("evidence-panel-clears-map-controls", (g.panelHits || []).length === 0, `panel covers ${JSON.stringify(g.panelHits)}`);
  if (g.listArticles > 0) {
    add("news-list-window", (g.listClientH || 0) >= 200, `list window ${g.listClientH}px (floor is 200px) for ${g.listArticles} items`);
  }
  add("no-clipped-text", (g.clipped || []).length === 0, `clipped: ${JSON.stringify(g.clipped)}`);

  console.log(`### ${name}`);
  console.log(`  band ${g.bandBox ? `${g.bandBox.w}x${g.bandBox.h}@${g.bandBox.x},${g.bandBox.y}` : "-"} headline ${g.bandHeadline ? `${g.bandHeadline.w}x${g.bandHeadline.h}` : "-"} count=${g.bandCount}`);
  console.log(`  panel ${g.panelBox ? `${g.panelBox.w}x${g.panelBox.h}@${g.panelBox.x},${g.panelBox.y}` : "-"} onScreen=${g.panelOnScreen} hits=${(g.panelHits || []).length}`);
  console.log(`  list ${g.listClientH}px (scroll ${g.listScrollH}) items=${g.listArticles} clipped=${(g.clipped || []).length}`);
  for (const c of checks) console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` — ${c.detail}`}`);
  results.push({ name, checks, geometry: g });
}
ws.close();
chrome.kill();
await writeFile(join(OUT, `spatial-${THEME}-${LANG}-summary.json`), JSON.stringify(results, null, 2));

if (failures.length) {
  console.log(`\nFAIL — ${failures.length} spatial failure(s):`);
  for (const f of failures) console.log(`  - ${f}`);
  console.log(`\nevidence: ${OUT}`);
  process.exit(1);
}
console.log(`\nPASS — ${results.length} viewports, ${SIZES.length * 7} checks`);
console.log(`evidence: ${OUT}`);
