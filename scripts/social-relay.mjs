// Copies the social rail's Google News feeds into KV every 10 min, run from
// scripts/relay-flights.mjs. Google throttles Cloudflare's network (the
// Worker's own fetch times out at 6 s); from here the feeds answer in
// ~0.5 s. The Worker still parses them — this only carries the bytes.

import { MAX_FEED_BYTES, RELAYED_FEEDS } from "../src/lib/cnx/social-feeds.ts";

const EVERY_MS = 10 * 60_000;
let lastRunAt = 0;

export async function runSocialRelay({ baseUrl, secret }) {
  if (Date.now() - lastRunAt < EVERY_MS) return;
  lastRunAt = Date.now();
  const feeds = {};
  for (const url of RELAYED_FEEDS) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/rss+xml", "User-Agent": "cnx-dashboard/1.0" }, signal: AbortSignal.timeout(20_000) });
      const body = res.ok ? await res.text() : "";
      if (body.includes("<rss") && body.length <= MAX_FEED_BYTES) feeds[url] = body;
      else console.warn(`[social] ${url.slice(0, 60)}…: HTTP ${res.status}, ${body.length} B — not relayed`);
    } catch (e) {
      console.warn(`[social] ${url.slice(0, 60)}…: ${e.message}`);
    }
  }
  if (Object.keys(feeds).length === 0) return;
  try {
    const res = await fetch(`${baseUrl}/api/cnx/social/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Secret": secret },
      body: JSON.stringify({ generatedAt: new Date().toISOString(), feeds }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`ingest ${res.status} ${(await res.text()).slice(0, 160)}`);
    console.log(`[social] relayed ${Object.keys(feeds).length} feeds`);
  } catch (e) {
    console.warn(`[social] push failed: ${e.message}`);
  }
}
