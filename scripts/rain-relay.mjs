// Pushes measured 24-hour rainfall for Chiang Mai (ThaiWater rain_24h,
// province 50, ~340 gauges) into KV every 15 min, run from
// scripts/relay-flights.mjs. ThaiWater rate-limits Cloudflare's shared
// egress, so the Worker reads this copy. Rows are compacted here with the
// same pure function the tests cover; banding happens at the edge.

import { compactRainRow } from "../src/lib/cnx/rain-core.ts";

const EVERY_MS = 15 * 60_000;
const URL_RAIN = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h?province_code=50";
const UA = "cnx-dashboard/1.0 (+https://cnx.nonarkara.org)";
let lastRunAt = 0;

export async function runRainRelay({ baseUrl, secret }) {
  if (Date.now() - lastRunAt < EVERY_MS) return;
  lastRunAt = Date.now();
  try {
    const res = await fetch(URL_RAIN, { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`thaiwater ${res.status}`);
    const json = await res.json();
    const rows = (Array.isArray(json?.data) ? json.data : []).map(compactRainRow).filter(Boolean);
    if (rows.length === 0) throw new Error("no Chiang Mai rows");
    const push = await fetch(`${baseUrl}/api/cnx/rain/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Secret": secret },
      body: JSON.stringify({ generatedAt: new Date().toISOString(), rows }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!push.ok) throw new Error(`ingest ${push.status} ${(await push.text()).slice(0, 160)}`);
    const wettest = rows.reduce((w, r) => (r.rain24h > w.rain24h ? r : w), rows[0]);
    console.log(`[rain] ${rows.length} gauges; wettest ${wettest.rain24h} mm at ${wettest.amphoeEn}`);
  } catch (e) {
    console.warn(`[rain] push failed: ${e.message}`);
  }
}
