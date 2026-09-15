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
    if (title && link) items.push({ title, link, pubDate });
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
    const res = await fetch(GDELT, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const json = (await res.json()) as { articles?: GdeltArticle[] };
    return json.articles ?? [];
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

function isoFromGdelt(s: string | undefined): string {
  if (!s || s.length < 15) return new Date().toISOString();
  // YYYYMMDDTHHMMSSZ
  const y = +s.slice(0, 4),
    mo = +s.slice(4, 6) - 1,
    d = +s.slice(6, 8),
    h = +s.slice(9, 11),
    mi = +s.slice(11, 13),
    se = +s.slice(13, 15);
  return new Date(Date.UTC(y, mo, d, h, mi, se)).toISOString();
}

let cache: { at: number; data: SocialListeningResponse } | null = null;
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
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const now = new Date().toISOString();
  try {
    const wanted = new Set(countries.map((c) => c.toLowerCase()));
    const feeds: { url: string; lang: SocialItem["lang"] }[] = [
      { url: GOOGLE_NEWS_TH, lang: "th" },
      { url: GOOGLE_NEWS_EN, lang: "en" },
    ];
    for (const f of MULTILINGUAL_FEEDS) {
      if (wanted.size === 0 || wanted.has(f.country.toLowerCase())) {
        feeds.push({ url: f.url, lang: f.lang });
      }
    }
    const rss = await Promise.all(feeds.map((f) => fetch(f.url, { headers: { Accept: "application/rss+xml" } })));
    const gdelt = await fetchGdelt();
    const items: SocialItem[] = [];
    for (let i = 0; i < feeds.length; i++) {
      const res = rss[i];
      const meta = feeds[i];
      if (!res.ok) continue;
      const parsed = parseRss(await res.text()).slice(0, 8);
      for (const r of parsed) {
        items.push({
          id: `gn-${meta.lang}-${i}-${r.link.slice(-12)}`,
          source: "google-news",
          lang: meta.lang,
          title: r.title,
          url: r.link,
          publishedAt: r.pubDate ? new Date(r.pubDate).toISOString() : now,
          tone: "info",
        });
      }
    }
    for (const a of gdelt.filter((x) => x.title && x.url)) {
      items.push({
        id: `gdelt-${a.url?.slice(-12)}`,
        source: "gdelt",
        lang: "en",
        title: a.title!,
        url: a.url!,
        publishedAt: isoFromGdelt(a.seendate),
        sentiment: gdeltSentiment(a.tone),
        tone: Math.abs(a.tone ?? 0) > 3 ? "alert" : "info",
      });
    }
    items.sort((a, b) => (b.publishedAt > a.publishedAt ? 1 : -1));
    const response: SocialListeningResponse = {
      generatedAt: now,
      items: items.slice(0, 80),
      counts: { th: items.filter((i) => i.lang === "th").length, en: items.filter((i) => i.lang === "en").length },
    };
    cache = { at: Date.now(), data: response };
    return response;
  } catch {
    return {
      generatedAt: now,
      items: [],
      counts: { th: 0, en: 0 },
    };
  }
}

export async function fetchCnxSocial(): Promise<SocialListeningResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const now = new Date().toISOString();
  try {
    const [thRes, enRes, gdelt] = await Promise.all([
      fetch(GOOGLE_NEWS_TH, { headers: { Accept: "application/rss+xml" } }),
      fetch(GOOGLE_NEWS_EN, { headers: { Accept: "application/rss+xml" } }),
      fetchGdelt(),
    ]);
    const th = thRes.ok ? parseRss(await thRes.text()).slice(0, 12) : [];
    const en = enRes.ok ? parseRss(await enRes.text()).slice(0, 12) : [];
    const gdeltItems: SocialItem[] = gdelt
      .filter((a) => a.title && a.url)
      .map((a, i) => ({
        id: `gdelt-${a.url?.slice(-12)}-${i}`,
        source: "gdelt",
        lang: "en",
        title: a.title!,
        url: a.url!,
        publishedAt: isoFromGdelt(a.seendate),
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
        publishedAt: r.pubDate ? new Date(r.pubDate).toISOString() : now,
        tone: "info",
      })),
      ...en.map((r, i): SocialItem => ({
        id: `gn-en-${i}-${r.link.slice(-12)}`,
        source: "google-news",
        lang: "en",
        title: r.title,
        url: r.link,
        publishedAt: r.pubDate ? new Date(r.pubDate).toISOString() : now,
        tone: "info",
      })),
      ...gdeltItems,
    ].sort((a, b) => (b.publishedAt > a.publishedAt ? 1 : -1));

    const response: SocialListeningResponse = {
      generatedAt: now,
      items: items.slice(0, 60),
      counts: { th: th.length, en: en.length + gdeltItems.length },
    };
    cache = { at: Date.now(), data: response };
    return response;
  } catch {
    // Scenario fallback
    const scenario: SocialListeningResponse = {
      generatedAt: now,
      items: [
        { id: "sc-1", source: "google-news", lang: "th", title: "เชียงใหม่เตรียมเปิดงานยี่เป็ง 2569 พร้อมพุ่งตัวเลขนักท่องเที่ยว", url: "#", publishedAt: now, tone: "info" },
        { id: "sc-2", source: "google-news", lang: "en", title: "Chiang Mai's burning season haze eases after northern rains", url: "#", publishedAt: now, tone: "info" },
        { id: "sc-3", source: "gdelt", lang: "en", title: "Lanna Cultural Centre unveils 700-year-old stucco restoration", url: "#", publishedAt: now, sentiment: "positive", tone: "info" },
      ],
      counts: { th: 1, en: 2 },
    };
    return scenario;
  }
}