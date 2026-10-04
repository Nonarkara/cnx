// Copies every news source behind the social rail into KV every 10 min,
// run from scripts/relay-flights.mjs: the Thai and English Google News
// feeds, the eight tourist-language feeds, and GDELT. Google throttles
// Cloudflare's network and GDELT rate-limits and times out there; from here
// they answer in ~0.5 s. Each feed is trimmed to its newest
// RELAY_ITEMS_PER_FEED items so ten feeds fit under the 1 MB ingest limit.
// The Worker still parses everything — this only carries the bytes.

import { GDELT_URL, MAX_FEED_BYTES, MAX_GDELT_BYTES, RELAYED_FEEDS, trimRss } from "../src/lib/cnx/social-feeds.ts";

const EVERY_MS = 10 * 60_000;
/** Spacing between Google requests — ten back-to-back hits look like a bot. */
const GAP_MS = 1_000;
const UA = "cnx-dashboard/1.0 (+https://cnx.nonarkara.org)";
let lastRunAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchFeed(url) {
  const res = await fetch(url, { headers: { Accept: "application/rss+xml", "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  const body = res.ok ? await res.text() : "";
  if (!body.includes("<rss")) throw new Error(`HTTP ${res.status}, not RSS`);
  const trimmed = trimRss(body);
  if (trimmed.length > MAX_FEED_BYTES) throw new Error(`${trimmed.length} B after trimming`);
  return trimmed;
}

async function fetchGdelt() {
  const res = await fetch(GDELT_URL, { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  const text = res.ok ? await res.text() : "";
  // GDELT answers its rate limit with a plain-text 200; only relay real JSON.
  if (!text.trimStart().startsWith("{") || text.length > MAX_GDELT_BYTES) throw new Error(`HTTP ${res.status}: ${text.slice(0, 60)}`);
  return text;
}

export async function runSocialRelay({ baseUrl, secret }) {
  if (Date.now() - lastRunAt < EVERY_MS) return;
  lastRunAt = Date.now();
  const feeds = {};
  const failed = [];
  for (const url of RELAYED_FEEDS) {
    try {
      feeds[url] = await fetchFeed(url);
    } catch (e) {
      failed.push(`${new URL(url).searchParams.get("hl") ?? url}: ${e.message}`);
    }
    await sleep(GAP_MS);
  }
  let gdelt;
  try {
    gdelt = await fetchGdelt();
  } catch (e) {
    failed.push(`gdelt: ${e.message}`);
  }
  if (failed.length) console.warn(`[social] not relayed — ${failed.join("; ")}`);
  if (Object.keys(feeds).length === 0) return;
  try {
    const body = JSON.stringify({ generatedAt: new Date().toISOString(), feeds, ...(gdelt ? { gdelt } : {}) });
    const res = await fetch(`${baseUrl}/api/cnx/social/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Secret": secret },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`ingest ${res.status} ${(await res.text()).slice(0, 160)}`);
    console.log(`[social] relayed ${Object.keys(feeds).length} feeds${gdelt ? " + GDELT" : ""} (${Math.round(body.length / 1024)} KB)`);
  } catch (e) {
    console.warn(`[social] push failed: ${e.message}`);
  }
}
