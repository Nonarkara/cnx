#!/usr/bin/env node
// Bakes the RTC Chiang Mai City Bus airport lines (24A/24B/24C, both
// directions) into ordered, continuous polylines for the moving-bus
// simulation. Reads the OSM route relations in member order from the
// main OSM API (Overpass is not needed for six relations), orients each
// way to join the previous one, and projects stop members onto the path.
//
//   node scripts/fetch-rtc-bus-lines.mjs

import { writeFile } from "node:fs/promises";

const RELATIONS = [17328605, 17328606, 17329260, 17329261, 17329816, 17329817];
const OUT = new URL("../public/data/cnx/rtc-bus-lines.json", import.meta.url);
const UA = "cnx-dashboard/0.1 (https://cnx.nonarkara.org)";

function haversineKm([lon1, lat1], [lon2, lat2]) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function fetchFull(id) {
  const res = await fetch(`https://api.openstreetmap.org/api/0.6/relation/${id}/full.json`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`relation ${id}: ${res.status}`);
  return res.json();
}

function stitch(wayCoords) {
  const path = [];
  let gaps = 0;
  for (const coords of wayCoords) {
    if (coords.length < 2) continue;
    if (path.length === 0) {
      // Orient the first way toward the second so the start is correct.
      const next = wayCoords[wayCoords.indexOf(coords) + 1];
      if (next) {
        const end = coords[coords.length - 1];
        const start = coords[0];
        const dEnd = Math.min(haversineKm(end, next[0]), haversineKm(end, next[next.length - 1]));
        const dStart = Math.min(haversineKm(start, next[0]), haversineKm(start, next[next.length - 1]));
        path.push(...(dStart < dEnd ? [...coords].reverse() : coords));
      } else {
        path.push(...coords);
      }
      continue;
    }
    const tail = path[path.length - 1];
    const forward = haversineKm(tail, coords[0]) <= haversineKm(tail, coords[coords.length - 1]);
    const oriented = forward ? coords : [...coords].reverse();
    if (haversineKm(tail, oriented[0]) > 0.05) gaps += 1;
    path.push(...(haversineKm(tail, oriented[0]) < 1e-6 ? oriented.slice(1) : oriented));
  }
  return { path, gaps };
}

function gapKm(path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = haversineKm(path[i - 1], path[i]);
    if (d > 0.3) total += d;
  }
  return total;
}

// OSM member order is sometimes wrong (24B return jumps 6 km). Fallback:
// start at the way nearest the first stop, then repeatedly append the
// unused way whose nearer endpoint is closest to the current tail.
function stitchGreedy(wayCoords, anchor) {
  const pool = wayCoords.filter((c) => c.length >= 2);
  const path = [];
  let tail = anchor ?? pool[0][0];
  while (pool.length) {
    let bestI = 0;
    let bestD = Infinity;
    let bestRev = false;
    pool.forEach((c, i) => {
      const dS = haversineKm(tail, c[0]);
      const dE = haversineKm(tail, c[c.length - 1]);
      if (Math.min(dS, dE) < bestD) {
        bestD = Math.min(dS, dE);
        bestI = i;
        bestRev = dE < dS;
      }
    });
    const [c] = pool.splice(bestI, 1);
    const oriented = bestRev ? [...c].reverse() : c;
    path.push(...(path.length && haversineKm(tail, oriented[0]) < 1e-6 ? oriented.slice(1) : oriented));
    tail = path[path.length - 1];
  }
  return path;
}

const lines = [];
for (const id of RELATIONS) {
  const full = await fetchFull(id);
  const nodes = new Map();
  const ways = new Map();
  let relation;
  for (const el of full.elements) {
    if (el.type === "node") nodes.set(el.id, el);
    else if (el.type === "way") ways.set(el.id, el);
    else if (el.type === "relation" && el.id === id) relation = el;
  }
  const wayCoords = relation.members
    .filter((m) => m.type === "way" && !/platform|stop/.test(m.role))
    .map((m) => ways.get(m.ref)?.nodes.map((n) => [nodes.get(n).lon, nodes.get(n).lat]) ?? []);
  const firstStop = relation.members.find((m) => /stop|platform/.test(m.role) && m.type === "node");
  const anchorNode = firstStop && nodes.get(firstStop.ref);
  const ordered = stitch(wayCoords).path;
  const greedy = stitchGreedy(wayCoords, anchorNode && [anchorNode.lon, anchorNode.lat]);
  const path = gapKm(greedy) < gapKm(ordered) ? greedy : ordered;
  const gaps = Math.round(gapKm(path) * 100) / 100;

  const cumKm = [0];
  for (let i = 1; i < path.length; i++) cumKm.push(cumKm[i - 1] + haversineKm(path[i - 1], path[i]));

  const stops = [];
  const seen = new Set();
  for (const m of relation.members) {
    if (!/stop|platform/.test(m.role)) continue;
    let pt;
    if (m.type === "node") {
      const n = nodes.get(m.ref);
      pt = n && [n.lon, n.lat];
    } else if (m.type === "way") {
      const w = ways.get(m.ref);
      const n = w && nodes.get(w.nodes[0]);
      pt = n && [n.lon, n.lat];
    }
    if (!pt) continue;
    const tags = (m.type === "node" ? nodes.get(m.ref)?.tags : ways.get(m.ref)?.tags) ?? {};
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = haversineKm(pt, path[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (bestD > 0.15) continue;
    const km = Math.round(cumKm[best] * 1000) / 1000;
    const key = Math.round(km * 20);
    if (seen.has(key)) continue;
    seen.add(key);
    stops.push({ name: tags["name:en"] ?? tags.name ?? "", km });
  }
  stops.sort((a, b) => a.km - b.km);

  const t = relation.tags;
  lines.push({
    id: `rtc-${id}`,
    ref: t.ref,
    name: t.name,
    from: t.from ?? "",
    to: t.to ?? "",
    colour: t.colour ?? "#ffffff",
    gapKm: gaps,
    pathSource: "osm-relation",
    lengthKm: Math.round(cumKm[cumKm.length - 1] * 100) / 100,
    path: path.map(([lon, lat]) => [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]),
    cumKm: cumKm.map((k) => Math.round(k * 1000) / 1000),
    stops,
  });
  console.log(`${t.ref} ${t.from ?? ""} -> ${t.to ?? ""}: ${lines.at(-1).lengthKm} km, ${path.length} pts, ${stops.length} stops, ${gaps} km of gaps`);
}

// A direction whose OSM relation is missing road segments would draw buses
// cutting across blocks — drive the opposite direction's path in reverse.
for (const line of lines) {
  if (line.gapKm <= 1) continue;
  const twin = lines.find((l) => l.ref === line.ref && l !== line && l.gapKm <= 1);
  if (!twin) continue;
  const total = twin.lengthKm;
  line.path = [...twin.path].reverse();
  line.cumKm = [...twin.cumKm].reverse().map((k) => Math.round((total - k) * 1000) / 1000);
  line.stops = twin.stops.map((st) => ({ ...st, km: Math.round((total - st.km) * 1000) / 1000 })).reverse();
  line.lengthKm = total;
  line.gapKm = twin.gapKm;
  line.pathSource = `reversed:${twin.id}`;
  console.log(`${line.ref} ${line.from} -> ${line.to}: OSM relation incomplete, using reversed ${twin.id}`);
}

await writeFile(
  OUT,
  JSON.stringify({
    meta: { source: "OpenStreetMap (ODbL)", generatedAt: new Date().toISOString(), relations: RELATIONS },
    lines,
  }),
);
console.log(`wrote ${OUT.pathname}`);
