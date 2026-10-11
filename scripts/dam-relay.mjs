// Pushes reservoir storage for the Ping basin (ThaiWater analyst/dam: large
// dams in basin 6 — แม่งัด, แม่กวง, ภูมิพล — and Chiang Mai's medium
// reservoirs) into KV every hour, run from scripts/relay-flights.mjs. Dams
// report once a day; hourly only keeps the copy inside the edge's 3 h
// staleness window. ThaiWater rate-limits Cloudflare's shared egress, so the
// Worker reads this copy. Rows are compacted here with the same pure function
// the tests cover; grading happens at the edge.
//
// Dry run (fetch + parse, no push, no secret needed):
//   node --experimental-strip-types scripts/dam-relay.mjs --dry

import { fileURLToPath } from "node:url";
import { selectDamRows, summariseDams, DAM_SOURCE_URL } from "../src/lib/cnx/dam-core.ts";

const EVERY_MS = 60 * 60_000;
const UA = "cnx-dashboard/1.0 (+https://cnx.nonarkara.org)";
let lastRunAt = 0;

export async function fetchDamRows() {
  const res = await fetch(DAM_SOURCE_URL, { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`thaiwater ${res.status}`);
  const rows = selectDamRows(await res.json());
  if (rows.length === 0) throw new Error("no Ping-basin dam rows");
  return rows;
}

export async function runDamRelay({ baseUrl, secret }) {
  if (Date.now() - lastRunAt < EVERY_MS) return;
  lastRunAt = Date.now(); // set first: a failure retries next hour, not every 30 s
  try {
    const rows = await fetchDamRows();
    const push = await fetch(`${baseUrl}/api/cnx/dam/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Secret": secret },
      body: JSON.stringify({ generatedAt: new Date().toISOString(), rows }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!push.ok) throw new Error(`ingest ${push.status} ${(await push.text()).slice(0, 160)}`);
    const large = rows.filter((r) => r.kind === "large").map((r) => `${r.nameEn || r.nameTh} ${r.date}`);
    console.log(`[dam] ${rows.length} reservoirs pushed; large: ${large.join(", ")}`);
  } catch (e) {
    console.warn(`[dam] push failed: ${e.message}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--dry")) {
  const rows = await fetchDamRows();
  const s = summariseDams(rows);
  console.log(`[dam] dry run: ${rows.length} rows parsed, ${s.large.length} large + ${s.medium.length} medium current, ${s.dropped} stale dropped`);
  for (const d of [...s.large, ...s.medium]) {
    console.log(`  ${d.kind.padEnd(6)} ${d.nameTh} (${d.amphoeTh || d.provinceTh}) ${d.date} · ${d.storageMcm} MCM · ${d.pctNormal ?? "?"}% normal${d.pctMax !== null ? ` · ${d.pctMax}% max` : ""} · in ${d.inflowMcm ?? "—"} / out ${d.releaseMcm ?? "—"} MCM/d · ${d.band}${d.spilling ? " · SPILLING" : ""} · ${d.agency}`);
  }
}
