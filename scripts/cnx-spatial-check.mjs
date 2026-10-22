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
 *   node scripts/cnx-spatial-check.mjs --inject-fault f1   # panel over the
 *                                                          # open Layers select
 *
 * Exit codes:
 *   0 = every check passed
 *   1 = measured, and at least one spatial check failed
 *   2 = could not measure (the board did not load, or the page refused to
 *       resize). This is NOT a layout verdict and must not be reported as
 *       one — an unmeasured gate is unverified, not passing.
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
const MAXWAIT = Number(arg("maxwait", "300000"));

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

  // Is the panel actually PAINTED?
  //
  // A closed <details> hides its content through ::details-content with
  // content-visibility: hidden, which implies paint containment: the panel
  // still has a layout box, and while the disclosure is closed that box is
  // laid out against the disclosure's own content box (x = -180 at 390 px),
  // not against the band. None of it is painted.
  //
  // getBoundingClientRect() reports layout, not painting, so a box that
  // nothing can see was being compared against a <select> that a reader can
  // see, and the gate called that an overlap. Ask the compositor instead:
  // hit-test the panel's own centre.
  const disclosureOpen = details ? details.open : false;
  const panelPainted = (() => {
    if (!panel || !disclosureOpen) return false;
    const b = panel.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0) return false;
    const x = b.x + b.width / 2;
    const y = b.y + Math.min(24, b.height / 2);
    if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) return false;
    const hit = document.elementFromPoint(x, y);
    return !!(hit && (hit === panel || panel.contains(hit)));
  })();

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
  const panelHits = (panelBox && panelPainted) ? controls.filter(c => overlaps(panelBox, c)) : [];

  // The map's Layers control is the one that opens over the map's left
  // column, and the basemap <select> inside it is what a reader actually
  // needs. They are found by content, not by position.
  const layersDetails = [...document.querySelectorAll("details")].find(d => d.querySelector("#cnx-basemap"));
  const layersDetailsOpen = layersDetails ? layersDetails.open : false;
  const layersSelect = document.querySelector("#cnx-basemap");
  const layersBox = layersDetails ? box(layersDetails) : null;
  const selectBox = layersSelect ? box(layersSelect) : null;
  const panelHitsLayers = (panelBox && panelPainted && layersBox) ? overlaps(panelBox, layersBox) : false;
  const selectCovered = (panelBox && panelPainted && selectBox) ? overlaps(panelBox, selectBox) : false;

  // What the rail says it has, and what it actually holds.
  const footer = railRoot ? railRoot.querySelector("footer") : null;
  const statedCount = footer ? (txt(footer).match(/\d+/) || [null])[0] : null;
  const pressedChip = railRoot ? [...railRoot.querySelectorAll('button[aria-pressed="true"]')].find(b => b.querySelector("span")) : null;
  const pressedCount = pressedChip && pressedChip.querySelector("span") ? Number(txt(pressedChip.querySelector("span"))) : null;
  const pressedLabel = pressedChip ? txt(pressedChip).slice(0, 12) : null;

  // The headline's line count: the defect it guards against was a ribbon
  // of seven wrapped lines squeezed into 75 px.
  const headlineEl = band ? band.querySelector("p") : null;
  const headlineLines = headlineEl ? Math.round(headlineEl.getBoundingClientRect().height / parseFloat(getComputedStyle(headlineEl).lineHeight)) : null;

  // Text that exists but cannot be read.
  //
  // Three things are NOT clipping, and each has to be judged on its own:
  //   1. screen-reader-only text (.sr-only) — hidden on purpose.
  //   2. a scroll container (overflow auto/scroll) — content outside it is
  //      REACHABLE by scrolling. The feed-freshness list is one of these,
  //      and treating it as a clipper reported 25 healthy rows as lost.
  //   3. deliberate ellipsis truncation with a title attribute — the full
  //      text is one hover away.
  //
  // So the question is asked per text node: what is the nearest ancestor
  // that actually hides overflow, and does the INK escape it?
  const textRects = (el) => {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!(node.textContent || "").trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) out.push({ r, node });
    }
    return out;
  };
  const nearestHider = (node) => {
    let p = node.parentElement;
    while (p) {
      const s = getComputedStyle(p);
      if (s.overflowX !== "visible" || s.overflowY !== "visible") return { el: p, cs: s };
      p = p.parentElement;
    }
    return null;
  };
  const truncated = [];
  const clipped = [...document.querySelectorAll("body *")].filter(el => {
    if (el.closest(".sr-only") || el.classList.contains("sr-only")) return false;
    const own = getComputedStyle(el);
    if (["auto", "scroll"].includes(own.overflowX) || ["auto", "scroll"].includes(own.overflowY)) return false;
    if (el.clientWidth === 0 || el.clientHeight === 0) return false;
    if (!(el.textContent || "").trim()) return false;
    let lost = false;
    for (const { r, node } of textRects(el)) {
      // Screen-reader-only text lives in a 1 px clip box of its own, so its
      // ink always "escapes" that box. It is hidden on purpose, and its
      // parent must not be reported as clipping because of it.
      if (node.parentElement && node.parentElement.closest(".sr-only")) continue;
      const hider = nearestHider(node);
      if (!hider) continue;
      const { cs } = hider;
      const scrollsX = ["auto", "scroll"].includes(cs.overflowX);
      const scrollsY = ["auto", "scroll"].includes(cs.overflowY);
      const cr = hider.el.getBoundingClientRect();
      const escapeX = !scrollsX && cs.overflowX !== "visible" && (r.right > cr.right + 1 || r.left < cr.left - 1);
      const escapeY = !scrollsY && cs.overflowY !== "visible" && (r.bottom > cr.bottom + 1 || r.top < cr.top - 1);
      if (!escapeX && !escapeY) continue;
      const hiderStyle = getComputedStyle(hider.el);
      if (hiderStyle.textOverflow === "ellipsis") {
        // A deliberate ellipsis truncation: the markup asked for it, and the
        // full string is still in the DOM. Counted and reported, but a
        // designed truncate is not a layout accident.
        truncated.push({
          tag: hider.el.tagName.toLowerCase(),
          text: (node.textContent || "").trim().slice(0, 44),
          hasTitle: !!hider.el.getAttribute("title"),
        });
        continue;
      }
      lost = true;
      break;
    }
    return lost;
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
    disclosureOpen,
    panelPainted,
    panelOnScreen: (panelBox && panelPainted) ? (panelBox.x >= 0 && panelBox.right <= innerWidth + 1 && panelBox.y >= 0 && panelBox.bottom <= innerHeight + 1) : null,
    panelHits,
    controls,
    mapBox: box(mapSec),
    listBox: list ? box(list) : null,
    listArticles: articles.length,
    statedCount,
    pressedCount,
    pressedLabel,
    headlineLines,
    layersBox,
    layersDetailsOpen,
    selectBox,
    panelHitsLayers,
    selectCovered,
    listClientH: list ? list.clientHeight : null,
    listScrollH: list ? list.scrollHeight : null,
    railOverflowY: railRoot ? getComputedStyle(railRoot).overflowY : null,
    clipped,
    truncated: truncated.slice(0, 6),
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
  if (fault === "f1") {
    // Disable the agreement between the panel and the map's Layers control,
    // which is the state the defect was found in: both open, and the panel
    // (right-anchored) sits on top of the basemap <select> (left column).
    const orig = document.dispatchEvent.bind(document);
    document.dispatchEvent = (ev) => (ev && ev.type === "cnx:exclusive-overlay") ? true : orig(ev);
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
  process.exit(2);
}
console.log(`board ready in ${Math.round((Date.now() - loadStart) / 1000)}s — measuring ${SIZES.length} viewports\n`);

for (const [w, h] of SIZES) {
  // Set the viewport, then PROVE the page agrees with it. A resize that
  // silently does not take leaves the page rendering at the previous width,
  // and the probe then measures that width and reports it as the new one —
  // a green check for a viewport that was never rendered. The gate must not
  // be able to flatter itself that way.
  let applied = false;
  for (let attempt = 0; attempt < 5 && !applied; attempt++) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
    await sleep(600);
    const chk = await send("Runtime.evaluate", { expression: `[innerWidth, innerHeight]`, returnByValue: true });
    const got = chk.result?.value || [];
    if (got[0] === w && got[1] === h) applied = true;
  }
  if (!applied) {
    const chk = await send("Runtime.evaluate", { expression: `[innerWidth, innerHeight]`, returnByValue: true });
    console.log(`FAIL — the page would not resize to ${w}x${h} (it is at ${JSON.stringify(chk.result?.value)}).`);
    console.log("       This is a harness failure, not a layout verdict: nothing was measured.");
    await writeFile(join(OUT, `spatial-${w}x${h}-${THEME}-${LANG}-unmeasurable.json`), JSON.stringify({ requested: [w, h], actual: chk.result?.value }, null, 2));
    process.exit(2);
  }
  await sleep(900); // let React and the map settle after the resize

  // Where the news rail exists, wait for the feed: the list-window check
  // only means something once there are items in it. The feed can be
  // legitimately empty, so this wait is bounded and says so out loud.
  let feedItems = 0;
  if (w >= 1024) {
    const feedStart = Date.now();
    for (;;) {
      const st = await send("Runtime.evaluate", {
        expression: `document.querySelectorAll('[data-surface="cnx-news-rail"] article').length`,
        returnByValue: true,
      });
      feedItems = st.result?.value || 0;
      if (feedItems > 0) break;
      if (Date.now() - feedStart > 60000) break;
      await sleep(2000);
    }
  }

  // ---- CLOSED: the resting board. The band must not sit on the map. ----
  const closedRes = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
  const closed = closedRes.result?.value || {};

  // ---- OPEN: the evidence disclosure expanded. ----
  await send("Runtime.evaluate", { expression: OPEN, returnByValue: true });
  await sleep(700);
  const res = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
  const g = res.result?.value || {};

  // ---- THE MAP'S LAYERS CONTROL, IN BOTH ORDERS. ----
  // The panel and the Layers control are exclusive overlays, so the reader
  // must be able to reach the basemap <select> whichever one they open
  // first. A gate that only ever opens the panel cannot see this defect:
  // that is exactly how the panel came to cover 95% of the <select>.
  const LAYERS = `(() => { const d = [...document.querySelectorAll("details")].find(x => x.querySelector("#cnx-basemap")); if (!d) return "no-layers"; if (!d.open) d.querySelector("summary").click(); return d.open ? "opened" : "click-failed"; })()`;
  const LAYERS_CLOSE = `(() => { const d = [...document.querySelectorAll("details")].find(x => x.querySelector("#cnx-basemap")); if (d) d.open = false; return true; })()`;

  // Order A: the panel is open, then the reader opens Layers.
  await send("Runtime.evaluate", { expression: LAYERS, returnByValue: true });
  await sleep(700);
  const layersRes = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
  const l = layersRes.result?.value || {};
  const panelClosedUnderLayers = l.disclosureOpen === false;

  // Order B: Layers is open, then the reader opens the panel.
  await send("Runtime.evaluate", { expression: LAYERS_CLOSE, returnByValue: true });
  await sleep(400);
  await send("Runtime.evaluate", { expression: LAYERS, returnByValue: true });
  await sleep(400);
  await send("Runtime.evaluate", { expression: OPEN, returnByValue: true });
  await sleep(700);
  const layersRes2 = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
  const l2 = layersRes2.result?.value || {};
  const layersClosedUnderPanel = l2.layersDetailsOpen === false;

  await send("Runtime.evaluate", { expression: LAYERS_CLOSE, returnByValue: true });
  await sleep(400);
  const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 86 });
  const name = `spatial-${w}x${h}-${THEME}-${LANG}${INJECT !== "none" ? `-${INJECT}` : ""}`;
  await writeFile(join(OUT, `${name}.jpg`), Buffer.from(shot.data, "base64"));
  await writeFile(join(OUT, `${name}.json`), JSON.stringify({ closed, open: g }, null, 2));

  const checks = [];
  const add = (name, ok, detail) => { checks.push({ name, ok, detail }); if (!ok) failures.push(`${w}x${h} ${THEME}/${LANG}: ${name} — ${detail}`); };
  const skip = (name, why) => { checks.push({ name, ok: null, skipped: why }); };

  add("verdict-band-once", g.bandCount === 1, `found ${g.bandCount} bands (expected exactly 1)`);
  add("verdict-band-visible", g.bandVisible === true, "the band is not visible");
  add("verdict-band-above-board", g.bandBeforeMap === true, "the band is not above the map section");
  add("verdict-band-clears-map", closed.bandBeforeMap === true, "the band overlaps the map section");
  add("evidence-panel-onscreen", g.panelOnScreen === true, `panel ${JSON.stringify(g.panelBox)} is not fully inside ${JSON.stringify(g.viewport)}`);
  add("evidence-panel-clears-map-controls", (g.panelHits || []).length === 0, `panel covers ${JSON.stringify(g.panelHits)}`);
  // A control list of zero would make the check above pass for the wrong
  // reason. Say so instead of reporting a green that proves nothing.
  add("map-controls-were-found", (g.controls || []).length > 0, "no map controls were found — the clearance check would pass vacuously");
  // The panel and the map's Layers control are exclusive overlays: with the
  // Layers control open, the basemap <select> must still be reachable —
  // whichever one the reader opened first.
  add("layers-control-reachable", !l.selectCovered && !l.panelHitsLayers, `with Layers open the panel covers the control (${l.panelHitsLayers}) and the basemap select (${l.selectCovered})`);
  add("layers-stand-down-for-the-panel", layersClosedUnderPanel || !l2.selectCovered, `the Layers control stayed open under the panel and the basemap select is covered (${l2.selectCovered})`);
  add("panel-stands-down-for-layers", panelClosedUnderLayers || !l.selectCovered, `the panel stayed open over the Layers control and the basemap select is covered (${l.selectCovered})`);
  if (g.listArticles > 0) {
    add("news-list-window", (g.listClientH || 0) >= 200, `list window ${g.listClientH}px (floor is 200px) for ${g.listArticles} items`);
    // What the rail claims and what it holds must agree. The footer said
    // "24 items" while the list showed one of them; the list scrolls, so
    // the count is honest only if the items are really there.
    if (g.statedCount !== null && g.pressedCount !== null) {
      add("news-count-matches", Number(g.statedCount) === Number(g.pressedCount), `the footer claims ${g.statedCount} items but the filter chip counts ${g.pressedCount}`);
    }
    if (g.statedCount !== null && g.pressedLabel !== null && /^(all|ทั้งหมด|TH|EN|issues|ประเด็น)/i.test(g.pressedLabel.trim())) {
      add("news-items-present", Number(g.statedCount) === g.listArticles, `the footer claims ${g.statedCount} items and the list holds ${g.listArticles}`);
    }
  } else if (w < 1024) {
    skip("news-list-window", "the news rail is not mounted below 1024 px");
  } else {
    skip("news-list-window", `no news items arrived (feed empty after 60 s) — ${g.listClientH}px window measured on an empty list`);
  }
  add("no-clipped-text", (g.clipped || []).length === 0, `clipped: ${JSON.stringify(g.clipped)}`);
  // The headline must have real width: it was once squeezed into a 75 px
  // ribbon at 390 px, which made the verdict unreadable in a phone.
  if (g.bandHeadline && g.bandBox) {
    // A ribbon: the headline was once squeezed into 75 px and wrapped to
    // seven lines. Line count is the honest measure of that, not width.
    add("verdict-headline-lines", (g.headlineLines || 0) <= 3, `the headline wraps to ${g.headlineLines} lines (floor is 3)`);
  }
  // The map is the hero. It must keep a real share of the window.
  if (g.mapBox && g.viewport) {
    const share = g.mapBox.h / g.viewport[1];
    add("map-keeps-its-window", share >= 0.4, `the map is ${g.mapBox.h}px of a ${g.viewport[1]}px viewport (${Math.round(share * 100)}%, floor is 40%)`);
  }

  console.log(`### ${name}`);
  console.log(`  band ${g.bandBox ? `${g.bandBox.w}x${g.bandBox.h}@${g.bandBox.x},${g.bandBox.y}` : "-"} headline ${g.bandHeadline ? `${g.bandHeadline.w}x${g.bandHeadline.h}` : "-"} count=${g.bandCount}`);
  console.log(`  panel ${g.panelBox ? `${g.panelBox.w}x${g.panelBox.h}@${g.panelBox.x},${g.panelBox.y}` : "-"} onScreen=${g.panelOnScreen} hits=${(g.panelHits || []).length}`);
  console.log(`  list ${g.listClientH}px (scroll ${g.listScrollH}) items=${g.listArticles} clipped=${(g.clipped || []).length} truncated=${(g.truncated || []).length}`);
  for (const c of checks) console.log(c.ok === null ? `  skip ${c.name} — ${c.skipped}` : `  ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` — ${c.detail}`}`);
  results.push({ name, checks, geometry: { closed, open: g } });
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
