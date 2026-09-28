// Haze reports from public posts and local news, run from
// scripts/relay-flights.mjs every 15 min. Reddit blocks Cloudflare's
// network, so collection runs on the relay Mac. Posts are filtered and
// place-matched by src/lib/cnx/citizen-core.ts against the OSM gazetteer,
// kept for 7 days, and pushed to /api/cnx/citizen/ingest.
//
// Sources are limited to ones that allow anonymous access: Reddit
// r/chiangmai RSS and Google News RSS. Facebook, X, LINE and TikTok need a
// login and forbid scraping, so they are deliberately not collected.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { toCitizenReport } from "../src/lib/cnx/citizen-core.ts";

const EVERY_MS = 15 * 60_000;
const KEEP_DAYS = 7;
const MAX_REPORTS = 400;
const UA = "Mozilla/5.0 (cnx-dashboard haze research; +https://cnx.nonarkara.org)";
const CACHE_DIR = "/Volumes/Data/CNX/relay-cache";
const STORE_FILE = `${CACHE_DIR}/citizen-reports.json`;
const GAZETTEER = new URL("../public/data/cnx/gazetteer.json", import.meta.url);

const gnews = (q, lang) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${lang}${lang === "th" ? "&gl=TH&ceid=TH:th" : "&gl=US&ceid=US:en"}`;

const SOURCES = [
  { id: "reddit-search", label: "Reddit r/chiangmai (haze search)", kind: "reddit", url: "https://www.reddit.com/r/chiangmai/search.rss?q=smoke+OR+haze+OR+aqi+OR+pm2.5+OR+burning&restrict_sr=1&sort=new" },
  { id: "news-th-dust", label: "Google News TH — ฝุ่น เชียงใหม่", kind: "news", url: gnews("ฝุ่น เชียงใหม่ when:7d", "th") },
  { id: "news-th-smoke", label: "Google News TH — หมอกควัน/ไฟป่า เชียงใหม่", kind: "news", url: gnews("(หมอกควัน OR ไฟป่า) เชียงใหม่ when:7d", "th") },
  { id: "news-en", label: "Google News EN — Chiang Mai haze", kind: "news", url: gnews("Chiang Mai (haze OR smoke OR PM2.5 OR wildfire) when:7d", "en") },
];

let lastRunAt = 0;

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
const stripTags = (s) => decode(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tag = (block, name) => block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "";

/** Atom (Reddit) and RSS 2.0 (Google News) → RawPost[]. */
function parseFeed(xml, source) {
  const posts = [];
  for (const m of xml.matchAll(/<(entry|item)>([\s\S]*?)<\/\1>/g)) {
    const b = m[2];
    const url = decode(b.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? tag(b, "link")).trim();
    const published = tag(b, "updated") || tag(b, "published") || tag(b, "pubDate");
    const t = Date.parse(published);
    if (!url.startsWith("https://") || !Number.isFinite(t)) continue;
    posts.push({
      id: `${source.kind}:${tag(b, "id") || url}`.slice(0, 200),
      source: source.kind,
      title: stripTags(tag(b, "title")),
      body: stripTags(tag(b, "content") || tag(b, "description")).slice(0, 4_000),
      url,
      publishedAt: new Date(t).toISOString(),
    });
  }
  return posts;
}

function loadStore() {
  try {
    return JSON.parse(readFileSync(STORE_FILE, "utf8"));
  } catch {
    return {};
  }
}

export async function runCitizenReports({ baseUrl, secret }) {
  if (Date.now() - lastRunAt < EVERY_MS) return;
  lastRunAt = Date.now();
  try {
    const gazetteer = JSON.parse(readFileSync(GAZETTEER, "utf8")).entries;
    const store = loadStore();
    const sources = [];
    for (const src of SOURCES) {
      try {
        const res = await fetch(src.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`${res.status}`);
        const posts = parseFeed(await res.text(), src);
        let kept = 0;
        const since = Date.now() - KEEP_DAYS * 86_400_000;
        for (const p of posts.filter((x) => Date.parse(x.publishedAt) >= since)) {
          const report = toCitizenReport(p, gazetteer);
          if (report) {
            store[report.id] = report;
            kept++;
          }
        }
        sources.push({ id: src.id, label: src.label, ok: true, items: kept });
      } catch (e) {
        console.warn(`[citizen] ${src.id}: ${e.message}`);
        sources.push({ id: src.id, label: src.label, ok: false, items: 0 });
      }
    }
    const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
    const reports = Object.values(store)
      .filter((r) => Date.parse(r.publishedAt) >= cutoff)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, MAX_REPORTS);
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(STORE_FILE, JSON.stringify(Object.fromEntries(reports.map((r) => [r.id, r]))));

    const res = await fetch(`${baseUrl}/api/cnx/citizen/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Secret": secret },
      body: JSON.stringify({ generatedAt: new Date().toISOString(), reports, sources }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`ingest ${res.status} ${(await res.text()).slice(0, 160)}`);
    console.log(`[citizen] ${reports.length} haze reports (${reports.filter((r) => r.place).length} pinned)`);
  } catch (e) {
    console.warn(`[citizen] run failed: ${e.message}`);
  }
}
