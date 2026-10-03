#!/usr/bin/env node
// Builds public/data/cnx/burn-season.json — Chiang Mai's burning season in
// numbers, from HII's "Tamroypao" (ตามรอยเผา) open CSVs: burned area per
// month (farmland by crop, and forest), MODIS hotspots, and PM2.5 days over
// the Thai standard, for the latest season and the one before, plus a
// district breakdown of the latest season.
//
// Monthly files are used (not HII's seasonal sums) because their dates are
// unambiguous; the cost is that a field burned in two months counts in
// both, which the dashboard states. Seasons run November → April.
//
// Run after HII publishes a new month: node scripts/build-cnx-burn-season.mjs

import { writeFileSync } from "node:fs";

const BASE = "https://tamroypao.hii.or.th";
const CSV = `${BASE}/tamroypao/data/csv`;
const OUT = new URL("../public/data/cnx/burn-season.json", import.meta.url);
const PROVINCE = "TH50";
const CROPS = ["Paddy", "Sugarcane", "Mixed", "Corn"];

/** Season labelled by its Buddhist-era end year (2569 = Nov 2025 – Apr 2026). */
function seasonMonths(endYear) {
  return [
    ...[11, 12].map((m) => `${endYear - 1}${String(m).padStart(2, "0")}`),
    ...[1, 2, 3, 4].map((m) => `${endYear}${String(m).padStart(2, "0")}`),
  ];
}

function parseCsv(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
}

async function getCsv(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return null;
  const text = await res.text();
  return text.trimStart().startsWith("<") ? null : parseCsv(text);
}

const num = (v) => (v === undefined || v === "" ? 0 : Number(v) || 0);
const round = (v) => Math.round(v);

async function month(ym) {
  const y = ym.slice(0, 4);
  const [agri, forest, hotspot, pm25] = await Promise.all([
    getCsv(`${CSV}/province/${y}/burn_area_province_${ym}.csv`),
    getCsv(`${CSV}/tamroypao_province_forest/${y}/burn_area_province_forest_${ym}.csv`),
    getCsv(`${BASE}/data/hotspot/csv/hotspot_province_${ym}.csv`),
    getCsv(`${BASE}/data/pm25/csv/pm25_province_${ym}.csv`),
  ]);
  const row = (rows) => rows?.find((r) => r.province_code === PROVINCE) ?? null;
  const a = row(agri);
  const f = row(forest);
  const h = row(hotspot);
  const p = row(pm25);
  return {
    month: ym,
    farmRai: a ? Object.fromEntries(CROPS.map((c) => [c.toLowerCase(), round(num(a[c]))])) : null,
    forestRai: f ? round(num(f.Forest)) : null,
    hotspots: h ? num(h.total) : null,
    pm25Avg: p ? num(p.avg) : null,
    pm25DaysOver: p ? num(p.days_over) : null,
  };
}

function totals(months) {
  const farm = months.reduce((s, m) => s + (m.farmRai ? Object.values(m.farmRai).reduce((a, b) => a + b, 0) : 0), 0);
  const forest = months.reduce((s, m) => s + (m.forestRai ?? 0), 0);
  const hotspots = months.reduce((s, m) => s + (m.hotspots ?? 0), 0);
  return { farmRai: farm, forestRai: forest, totalRai: farm + forest, hotspots, monthsWithData: months.filter((m) => m.farmRai || m.forestRai !== null).length };
}

async function districts(months) {
  const byCode = new Map();
  for (const ym of months) {
    const y = ym.slice(0, 4);
    const [agri, forest] = await Promise.all([
      getCsv(`${CSV}/district/${y}/burn_area_district_${ym}.csv`),
      getCsv(`${CSV}/tamroypao_district_forest/${y}/burn_area_district_forest_${ym}.csv`),
    ]);
    for (const r of agri ?? []) {
      if (r.province_code !== PROVINCE) continue;
      const d = byCode.get(r.district_code) ?? { code: r.district_code, th: r.district_th, en: r.district_en, farmRai: 0, forestRai: 0 };
      d.farmRai += CROPS.reduce((s, c) => s + num(r[c]), 0);
      byCode.set(r.district_code, d);
    }
    for (const r of forest ?? []) {
      if (r.province_code !== PROVINCE) continue;
      const d = byCode.get(r.district_code) ?? { code: r.district_code, th: r.district_th, en: r.district_en, farmRai: 0, forestRai: 0 };
      d.forestRai += num(r.Forest);
      byCode.set(r.district_code, d);
    }
  }
  return [...byCode.values()]
    .map((d) => ({ ...d, farmRai: round(d.farmRai), forestRai: round(d.forestRai), totalRai: round(d.farmRai + d.forestRai) }))
    .sort((a, b) => b.totalRai - a.totalRai);
}

async function main() {
  const latest = 2026; // CE end year of the latest finished season (BE 2569)
  const seasons = [];
  for (const endYear of [latest, latest - 1]) {
    const months = [];
    for (const ym of seasonMonths(endYear)) months.push(await month(ym));
    seasons.push({ labelBE: endYear + 543, from: months[0].month, to: months.at(-1).month, months, totals: totals(months) });
  }
  const doc = {
    generatedAt: new Date().toISOString(),
    source: "Hydro-Informatics Institute (HII / สสน.) — ตามรอยเผา, tamroypao.hii.or.th, open CSV",
    province: { code: PROVINCE, th: "เชียงใหม่", en: "Chiang Mai" },
    unit: "rai (1 rai = 1,600 m²)",
    caveat:
      "Monthly burned area summed over the season: a field burned in two different months is counted in both, so season totals overstate unique area. Hotspots are MODIS counts from HII; PM2.5 is HII's provincial monthly average and days above the Thai 24-h standard.",
    seasons,
    districtsLatest: await districts(seasonMonths(latest)),
  };
  writeFileSync(OUT, `${JSON.stringify(doc, null, 1)}\n`);
  const [a, b] = seasons;
  console.log(`[burn-season] ${a.labelBE}: ${a.totals.totalRai} rai (${a.totals.monthsWithData} months) vs ${b.labelBE}: ${b.totals.totalRai} rai; ${doc.districtsLatest.length} districts`);
}

main().catch((e) => {
  console.error(`[burn-season] failed: ${e.message}`);
  process.exit(1);
});
