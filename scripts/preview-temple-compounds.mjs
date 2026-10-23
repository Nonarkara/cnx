#!/usr/bin/env node
/**
 * preview-temple-compounds.mjs
 *
 * Draws the baked temple compounds in a north-up PLAN and an ISOMETRIC
 * view, so the compound grammar can be LOOKED AT without booting the
 * board and the browser.
 *
 * This exists because the unit tests passed and the geometry was still
 * wrong four separate times: a NaN latitude that made every shrine a
 * compound, rings that serialised with a last point of `{}`, a wall that
 * filled the courtyard it was meant to enclose, and the mapped interior
 * buildings silently dropped. None of those show up in an assertion about
 * a count. They show up the moment the thing is drawn.
 *
 * The isometric projection is the same one the map's fill-extrusion
 * approximates: the screen x runs along the compound's east–west, the
 * screen y along its north–south and the height, and the faces that face
 * the camera are drawn.
 *
 * Usage:
 *   node scripts/preview-temple-compounds.mjs "Chedi Luang" "Phra Singh"
 *   → writes /tmp/cnx-temple/preview.svg
 *
 * Then rasterise it (Chrome is already a dependency of the spatial gate):
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     --headless --disable-gpu --no-sandbox \
 *     --user-data-dir=/tmp/cnx-temple/prof \
 *     --screenshot=/tmp/cnx-temple/preview.png \
 *     --window-size=1840,620 file:///tmp/cnx-temple/preview.svg
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DATA = "/Volumes/Data/Projects/CNX/public/data/cnx/temple-compounds.geojson";
const M_LAT = 110574;
const M_LON = 111320 * Math.cos((18.7883 * Math.PI) / 180);

const COLORS = {
  court: ["#b9b09b", "#9d9482"],
  wall: ["#c4b096", "#9c8a6f"],
  gate: ["#d97706", "#9a5406"],
  hall: ["#f59e0b", "#8a3410"],
  side_hall: ["#cf7407", "#7d4410"],
  chedi: ["#faf0d2", "#b8912a"],
};

// Every ring must be expressed in ONE shared frame. Localising each
// ring to its own first vertex put every part in a different frame and
// scattered the compound across the panel.
let SHARED = null;
const toLocal = (r) => {
  if (!SHARED) SHARED = r[0];
  const o = SHARED;
  return r.map((p) => ({ x: (p[0] - o[0]) * M_LON, y: (p[1] - o[1]) * M_LAT }));
};
function ccw(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; }
  return a < 0 ? [...pts].reverse() : pts;
}

const data = JSON.parse(readFileSync(DATA, "utf8"));
const byCompound = new Map();
for (const f of data.features) {
  const id = f.properties.compound_id;
  if (!byCompound.has(id)) byCompound.set(id, { meta: f.properties, parts: [] });
  byCompound.get(id).parts.push(f);
}

const picks = [];
for (const w of process.argv.slice(2)) {
  for (const [id, c] of byCompound) {
    const nm = `${c.meta.name_en || ""} ${c.meta.name_th || ""}`;
    if (nm.toLowerCase().includes(w.toLowerCase())) { picks.push([id, c]); break; }
  }
}

const PANEL_W = 460, PANEL_H = 620;
const out = [];
let x0 = 0;

for (const [id, c] of picks) {
  SHARED = null;
  const parts = c.parts.map((f) => {
    const rings = f.geometry.coordinates.map((raw) => {
      const closed = raw[0][0] === raw[raw.length - 1][0] && raw[0][1] === raw[raw.length - 1][1] ? raw : [...raw, raw[0]];
      return ccw(toLocal(closed));
    });
    return { props: f.properties, pts: rings[0], holes: rings.slice(1) };
  });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of parts) for (const q of p.pts) {
    minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
    minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
  }
  const spanX = Math.max(maxX - minX, 1), spanY = Math.max(maxY - minY, 1);
  const iso = (x, y, z) => ({ sx: (x - y) * 0.7071, sy: (x + y) * 0.5 - z * 0.866 });

  const body = [];
  const bodyDepth = [];
  for (const p of parts) {
    const kind = p.props.part;
    const [fill, stroke] = COLORS[kind] || COLORS.wall;
    const z0 = p.props.base_height, z1 = p.props.base_height + p.props.height;
    const modelled = p.props.origin === "model";
    // visible side faces (outward normal toward the camera: n.x + n.y > 0)
    const faces = [];
    for (let i = 0; i < p.pts.length; i++) {
      const a = p.pts[i], b = p.pts[(i + 1) % p.pts.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dy - dx <= 0) continue;
      const A0 = iso(a.x, a.y, z0), B0 = iso(b.x, b.y, z0);
      const A1 = iso(a.x, a.y, z1), B1 = iso(b.x, b.y, z1);
      faces.push({ poly: `${A0.sx},${A0.sy} ${B0.sx},${B0.sy} ${B1.sx},${B1.sy} ${A1.sx},${A1.sy}`, d: a.x + a.y });
    }
    const top = [p.pts, ...p.holes].map((ring) => ring.map((q) => { const s = iso(q.x, q.y, z1); return `${s.sx},${s.sy}`; }).join(" ")).join(" ");
    const depth = p.pts.reduce((s, q) => s + q.x + q.y, 0) / p.pts.length;
    body.push({ kind, fill, stroke, faces, top, depth, modelled });
    bodyDepth.push(depth);
  }
  // The court is ground: it must be laid down before anything stands on
  // it, or it paints over the buildings standing in it.
  const rank = (b) => (b.kind === "court" ? -1e9 : b.kind === "wall" ? -1e8 : 0);
  body.sort((a, b) => rank(a) - rank(b) || a.depth - b.depth);

  // fit the isometric into the panel
  let iMinX = Infinity, iMaxX = -Infinity, iMinY = Infinity, iMaxY = -Infinity;
  for (const b of body) {
    for (const f of b.faces) for (const pair of f.poly.split(" ")) {
      const [px, py] = pair.split(",").map(Number);
      iMinX = Math.min(iMinX, px); iMaxX = Math.max(iMaxX, px);
      iMinY = Math.min(iMinY, py); iMaxY = Math.max(iMaxY, py);
    }
    for (const pair of b.top.split(" ")) {
      const [px, py] = pair.split(",").map(Number);
      iMinX = Math.min(iMinX, px); iMaxX = Math.max(iMaxX, px);
      iMinY = Math.min(iMinY, py); iMaxY = Math.max(iMaxY, py);
    }
  }
  const iW = Math.max(iMaxX - iMinX, 1), iH = Math.max(iMaxY - iMinY, 1);
  const isoScale = Math.min(400 / iW, 250 / iH);

  const { meta } = c;
  const isCompound = meta.part === "wall";
  out.push(`<g transform="translate(${x0},0)">`);
  out.push(`<rect x="0" y="0" width="${PANEL_W}" height="${PANEL_H}" fill="#0f1319" stroke="#2a3240"/>`);
  out.push(`<text x="16" y="28" fill="#e6edf3" font-family="monospace" font-size="16">${(meta.name_en || meta.name_th || id).slice(0, 32)}</text>`);
  out.push(`<text x="16" y="48" fill="#7d8b9c" font-family="monospace" font-size="12">${(meta.name_th || "").slice(0, 34)}</text>`);
  out.push(`<text x="16" y="68" fill="#7d8b9c" font-family="monospace" font-size="11">${isCompound ? "COMPOUND" : "single footprint"} · ${meta.evidence}</text>`);
  out.push(`<text x="16" y="84" fill="#7d8b9c" font-family="monospace" font-size="11">${meta.compound_area_m2} m² · ${Math.round(spanX)}×${Math.round(spanY)} m</text>`);

  // plan (north up)
  const planScale = Math.min(180 / spanX, 180 / spanY);
  out.push(`<g transform="translate(24,110)">`);
  for (const p of parts) {
    const kind = p.props.part;
    const [fill, stroke] = COLORS[kind] || COLORS.wall;
    const d = [p.pts, ...p.holes].map((ring) => ring.map((q) => `${((q.x - minX) * planScale).toFixed(1)},${((maxY - q.y) * planScale).toFixed(1)}`).join(" ")).join(" ");
    out.push(`<polygon points="${d}" fill-rule="evenodd" fill="${fill}" fill-opacity="${p.props.origin === "model" ? 0.5 : 0.95}" stroke="${stroke}" stroke-width="0.7"/>`);
  }
  out.push(`</g>`);
  out.push(`<text x="24" y="306" fill="#7d8b9c" font-family="monospace" font-size="10">PLAN (north up) · faded = modelled</text>`);
  // north arrow
  out.push(`<path d="M222,116 l7,26 l-7,-7 l-7,7 z" fill="#8b98a9"/><text x="214" y="158" fill="#8b98a9" font-family="monospace" font-size="10">N</text>`);

  // isometric
  out.push(`<g transform="translate(${30 - iMinX * isoScale},${560 - iMaxY * isoScale}) scale(${isoScale})">`);
  for (const b of body) {
    for (const f of b.faces) out.push(`<polygon points="${f.poly}" fill="${b.stroke}" fill-opacity="0.95"/>`);
    out.push(`<polygon points="${b.top}" fill-rule="evenodd" fill="${b.fill}" fill-opacity="${b.modelled ? 0.62 : 1}" stroke="${b.stroke}" stroke-width="${0.7 / isoScale}"/>`);
  }
  out.push(`</g>`);
  out.push(`<text x="24" y="600" fill="#7d8b9c" font-family="monospace" font-size="10">ISOMETRIC · faded top = modelled part</text>`);
  out.push(`</g>`);
  x0 += PANEL_W;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${x0}" height="${PANEL_H}" viewBox="0 0 ${x0} ${PANEL_H}"><rect width="100%" height="100%" fill="#0b0e13"/>${out.join("\n")}</svg>`;
const OUT = process.env.CNX_PREVIEW_OUT || "/tmp/cnx-temple/preview.svg";
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg);
console.log(`wrote ${OUT} (${x0}×${PANEL_H})`);
