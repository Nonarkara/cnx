// CNX social listening module.
//
// Aggregates:
//   - Google News RSS in Thai (q=เชียงใหม่) and English (q=Chiang Mai)
//   - GDELT 2.0 doc API for English-language articles mentioning
//     "Chiang Mai" or "เชียงใหม่" with a tone flag
//
// Refresh: every 3 min (server side). On Cloudflare Workers we cache
// the response at the edge; the client polls /api/cnx/social every
// 3 min. GDELT allows 250 req/min on its public API — well within
// budget for 3-min polling from a single wall display.

import type { SocialItem, SocialListeningResponse } from "../../types/cnx";

const GOOGLE_NEWS_TH = "https://news.google.com/rss/search?q=%E0%B9%80%E0%B8%8A%E0%B8%B5%E0%B8%A2%E0%B8%87%E0%B9%83%E0%B8%AB%E0%B8%A1%E0%B9%88&hl=th";
const GOOGLE_NEWS_EN = "https://news.google.com/rss/search?q=Chiang+Mai+OR+%22Chiang+Mai%22&hl=en&gl=US";
const GDELT = "https://api.gdeltproject.org/api/v2/doc/doc?query=%22Chiang+Mai%22%20OR%20%22เชียงใหม่%22%20sourcelang:english&mode=ArtList&maxrecords=25&format=json";

interface ParsedRss {
  title: string;
  link: string;
  pubDate: string;
}

function parseRss(xml: string): ParsedRss[] {
  const items: ParsedRss[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() ?? "";
    const link = block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/)?.[1]?.trim() ?? "";
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";
    const published = Date.parse(pubDate);
    if (title && /^https?:\/\//i.test(link) && Number.isFinite(published) && published <= Date.now() + 5 * 60_000) {
      items.push({ title, link, pubDate: new Date(published).toISOString() });
    }
  }
  return items;
}

interface GdeltArticle {
  title?: string;
  url?: string;
  seendate?: string; // YYYYMMDDTHHMMSSZ
  language?: string;
  tone?: number;
  domain?: string;
  socialimage?: string;
}

async function fetchGdelt(): Promise<GdeltArticle[]> {
  try {
    const res = await fetch(GDELT, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { articles?: GdeltArticle[] };
    return Array.isArray(json.articles)
      ? json.articles.filter((article) => article && typeof article.title === "string" && typeof article.url === "string")
      : [];
  } catch {
    return [];
  }
}

function gdeltSentiment(tone?: number): SocialItem["sentiment"] {
  if (tone === undefined) return "neutral";
  if (tone < -3) return "negative";
  if (tone > 3) return "positive";
  return "neutral";
}

function isoFromGdelt(s: string | undefined): string | null {
  if (typeof s !== "string" || !/^\d{8}T\d{6}Z$/.test(s)) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
  const time = Date.parse(iso);
  if (!Number.isFinite(time) || time > Date.now() + 5 * 60_000) return null;
  const normalized = new Date(time).toISOString();
  return normalized === iso.replace("Z", ".000Z") ? normalized : null;
}

let cache: { at: number; data: SocialListeningResponse } | null = null;
// Only the eight configured countries participate in keys: at most 256 subsets.
const multilingualCache = new Map<string, { at: number; data: SocialListeningResponse }>();
const TTL_MS = 3 * 60_000;

/** Per-language Google News feeds, keyed by tourist-origin country. The
 *  flight desk drives which of these are subscribed at any moment —
 *  see fetchCnxSocialMultilingual(). */
const MULTILINGUAL_FEEDS: { lang: SocialItem["lang"]; country: string; url: string }[] = [
  { lang: "zh", country: "China", url: "https://news.google.com/rss/search?q=%E6%B8%85%E8%BF%AA&hl=zh-CN&gl=CN" },
  { lang: "ja", country: "Japan", url: "https://news.google.com/rss/search?q=%E3%83%81%E3%82%A2%E3%83%B3%E3%83%9E%E3%82%A4&hl=ja&gl=JP" },
  { lang: "ko", country: "Korea", url: "https://news.google.com/rss/search?q=%EC%B2%9C%EC%9D%B4%EB%A7%88%EC%9D%B4&hl=ko&gl=KR" },
  { lang: "ru", country: "Russia", url: "https://news.google.com/rss/search?q=%D0%A7%D0%B8%D0%B0%D0%BD%D0%B3-%D0%9C%D0%B0%D0%B8&hl=ru&gl=RU" },
  { lang: "de", country: "Germany", url: "https://news.google.com/rss/search?q=Chiang+Mai&hl=de&gl=DE" },
  { lang: "fr", country: "France", url: "https://news.google.com/rss/search?q=Chiang+Mai&hl=fr&gl=FR" },
  { lang: "en", country: "India", url: "https://news.google.com/rss/search?q=Chiang+Mai&hl=en-IN&gl=IN" },
  { lang: "en", country: "Australia", url: "https://news.google.com/rss/search?q=Chiang+Mai&hl=en-AU&gl=AU" },
];

/** Multilingual social: subscribes to per-language Google News feeds
 *  for the given top-N countries. Used when the flight desk's top
 *  origin countries include CN / JP / KR / RU / DE / FR / IN / AU. */
export async function fetchCnxSocialMultilingual(countries: string[] = []): Promise<SocialListeningResponse> {
  const wanted = new Set(countries.map((c) => c.trim().toLowerCase()));
  const selected = MULTILINGUAL_FEEDS.filter((f) => countries.length === 0 || wanted.has(f.country.toLowerCase()));
  const key = selected.map((f) => f.country).sort().join(",");
  const cached = multilingualCache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;
  const now = new Date().toISOString();

  try {
    const feeds: { url: string; lang: SocialItem["lang"] }[] = [
      { url: GOOGLE_NEWS_TH, lang: "th" },
      { url: GOOGLE_NEWS_EN, lang: "en" },
    ];
    for (const f of selected) feeds.push({ url: f.url, lang: f.lang });

    const [rssResults, gdelt] = await Promise.all([
      Promise.allSettled(
        feeds.map((f) =>
          fetch(f.url, {
            headers: { Accept: "application/rss+xml", "User-Agent": "cnx-dashboard/1.0" },
            signal: AbortSignal.timeout(4000),
          })
        )
      ),
      fetchGdelt(),
    ]);

    const items: SocialItem[] = [];
    for (let i = 0; i < feeds.length; i++) {
      const settled = rssResults[i];
      const meta = feeds[i];
      if (!settled || settled.status !== "fulfilled" || !settled.value.ok) continue;
      try {
        const text = await settled.value.text();
        const parsed = parseRss(text).slice(0, 8);
        for (const r of parsed) {
          items.push({
            id: `gn-${meta.lang}-${i}-${r.link.slice(-12)}`,
            source: "google-news",
            lang: meta.lang,
            title: r.title,
            url: r.link,
            publishedAt: r.pubDate,
            tone: "info",
          });
        }
      } catch {
        // skip malformed feed
      }
    }

    for (const a of gdelt.filter((x) => x.title && x.url && /^https?:\/\//i.test(x.url) && isoFromGdelt(x.seendate))) {
      items.push({
        id: `gdelt-${a.url?.slice(-12)}`,
        source: "gdelt",
        lang: "en",
        title: a.title!,
        url: a.url!,
        publishedAt: isoFromGdelt(a.seendate)!,
        sentiment: gdeltSentiment(a.tone),
        tone: Math.abs(a.tone ?? 0) > 3 ? "alert" : "info",
      });
    }

    items.sort((a, b) => (b.publishedAt > a.publishedAt ? 1 : -1));
    const response: SocialListeningResponse = {
      generatedAt: now,
      items: items.slice(0, 80),
      counts: {
        th: items.filter((i) => i.lang === "th").length,
        en: items.filter((i) => i.lang !== "th").length,
      },
    };
    multilingualCache.set(key, { at: Date.now(), data: response });
    return response;
  } catch {
    const response: SocialListeningResponse = {
      generatedAt: now,
      items: [],
      counts: { th: 0, en: 0 },
    };
    return response;
  }
}

export async function fetchCnxSocial(): Promise<SocialListeningResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const now = new Date().toISOString();

  try {
    const [thSettled, enSettled, gdelt] = await Promise.all([
      fetch(GOOGLE_NEWS_TH, { headers: { Accept: "application/rss+xml", "User-Agent": "cnx-dashboard/1.0" }, signal: AbortSignal.timeout(4000) })
        .then((r) => (r.ok ? r.text() : ""))
        .catch(() => ""),
      fetch(GOOGLE_NEWS_EN, { headers: { Accept: "application/rss+xml", "User-Agent": "cnx-dashboard/1.0" }, signal: AbortSignal.timeout(4000) })
        .then((r) => (r.ok ? r.text() : ""))
        .catch(() => ""),
      fetchGdelt(),
    ]);

    const th = thSettled ? parseRss(thSettled).slice(0, 12) : [];
    const en = enSettled ? parseRss(enSettled).slice(0, 12) : [];
    const gdeltItems: SocialItem[] = gdelt
      .filter((a) => a.title && a.url && /^https?:\/\//i.test(a.url) && isoFromGdelt(a.seendate))
      .map((a, i) => ({
        id: `gdelt-${a.url?.slice(-12)}-${i}`,
        source: "gdelt",
        lang: "en",
        title: a.title!,
        url: a.url!,
        publishedAt: isoFromGdelt(a.seendate)!,
        sentiment: gdeltSentiment(a.tone),
        tone: Math.abs(a.tone ?? 0) > 3 ? "alert" : "info",
        topics: [a.domain ?? ""],
      }));

    const items: SocialItem[] = [
      ...th.map((r, i): SocialItem => ({
        id: `gn-th-${i}-${r.link.slice(-12)}`,
        source: "google-news",
        lang: "th",
        title: r.title,
        url: r.link,
        publishedAt: r.pubDate,
        tone: "info",
      })),
      ...en.map((r, i): SocialItem => ({
        id: `gn-en-${i}-${r.link.slice(-12)}`,
        source: "google-news",
        lang: "en",
        title: r.title,
        url: r.link,
        publishedAt: r.pubDate,
        tone: "info",
      })),
      ...gdeltItems,
    ];

    items.sort((a, b) => (b.publishedAt > a.publishedAt ? 1 : -1));
    const response: SocialListeningResponse = {
      generatedAt: now,
      items: items.slice(0, 60),
      counts: {
        th: items.filter((i) => i.lang === "th").length,
        en: items.filter((i) => i.lang !== "th").length,
      },
    };
    cache = { at: Date.now(), data: response };
    return response;
  } catch {
    const response: SocialListeningResponse = {
      generatedAt: now,
      items: [],
      counts: { th: 0, en: 0 },
    };
    return response;
  }
}