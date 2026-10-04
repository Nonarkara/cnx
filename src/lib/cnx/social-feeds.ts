// Every news source behind the social rail, in one import-free file so the
// relay (scripts/social-relay.mjs, Node type-stripping) and the Worker read
// the same list. Google throttles Cloudflare's network — from the Worker
// these feeds time out, from the relay Mac they answer in ~0.5 s — and
// GDELT both rate-limits (one request per 5 s) and times out from Workers.
// So the relay copies all of them into KV and the Worker reads that copy
// first, falling back to a direct fetch.

export type FeedLang = "th" | "en" | "zh" | "ja" | "ko" | "ru" | "de" | "fr";

export const GOOGLE_NEWS_TH =
  "https://news.google.com/rss/search?q=%E0%B9%80%E0%B8%8A%E0%B8%B5%E0%B8%A2%E0%B8%87%E0%B9%83%E0%B8%AB%E0%B8%A1%E0%B9%88&hl=th";
export const GOOGLE_NEWS_EN = "https://news.google.com/rss/search?q=Chiang+Mai+OR+%22Chiang+Mai%22&hl=en&gl=US";

/** Per-language Google News feeds, keyed by tourist-origin country. The
 *  flight desk decides which are shown — see fetchCnxSocialMultilingual().
 *  Search terms are the names each press actually uses (checked against
 *  Google News 2026-10-04, relevant stories in the top 20): 清迈 (was 清迪,
 *  1/20 — "迪" matched Rolex Daytona and Fendi), チェンマイ (was チアンマイ),
 *  치앙마이 (was 천이마이, 0/20), Чиангмай (was Чианг-Маи, 4/20). */
export const MULTILINGUAL_FEEDS: readonly { lang: FeedLang; country: string; url: string }[] = [
  { lang: "zh", country: "China", url: "https://news.google.com/rss/search?q=%E6%B8%85%E8%BF%88&hl=zh-CN&gl=CN" },
  { lang: "ja", country: "Japan", url: "https://news.google.com/rss/search?q=%E3%83%81%E3%82%A7%E3%83%B3%E3%83%9E%E3%82%A4&hl=ja&gl=JP" },
  { lang: "ko", country: "Korea", url: "https://news.google.com/rss/search?q=%EC%B9%98%EC%95%99%EB%A7%88%EC%9D%B4&hl=ko&gl=KR" },
  { lang: "ru", country: "Russia", url: "https://news.google.com/rss/search?q=%D0%A7%D0%B8%D0%B0%D0%BD%D0%B3%D0%BC%D0%B0%D0%B9&hl=ru&gl=RU" },
  { lang: "de", country: "Germany", url: "https://news.google.com/rss/search?q=Chiang+Mai&hl=de&gl=DE" },
  { lang: "fr", country: "France", url: "https://news.google.com/rss/search?q=Chiang+Mai&hl=fr&gl=FR" },
  { lang: "en", country: "India", url: "https://news.google.com/rss/search?q=Chiang+Mai&hl=en-IN&gl=IN" },
  { lang: "en", country: "Australia", url: "https://news.google.com/rss/search?q=Chiang+Mai&hl=en-AU&gl=AU" },
];

export const RELAYED_FEEDS: readonly string[] = [GOOGLE_NEWS_TH, GOOGLE_NEWS_EN, ...MULTILINGUAL_FEEDS.map((f) => f.url)];

/**
 * GDELT DOC 2.0 query. OR'd terms must be wrapped in parentheses — without
 * them GDELT answers HTTP 200 with the plain-text error "Queries containing
 * OR'd terms must be surrounded by ()", which the old query got on every
 * request (seen 2026-10-04, once the rate limit let a request through). With
 * them it returns 25 articles; timespan + datedesc keep them recent instead
 * of the most "relevant" from the last three months.
 */
export const GDELT_URL =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=" +
  encodeURIComponent('("Chiang Mai" OR "เชียงใหม่") sourcelang:english') +
  "&mode=ArtList&maxrecords=25&timespan=7d&sort=datedesc&format=json";

export const SOCIAL_RSS_KV_KEY = "social-rss-latest";
/** Largest single feed body accepted from the relay. Feeds are trimmed to
 *  RELAY_ITEMS_PER_FEED items first (~25 KB), so this is a generous ceiling. */
export const MAX_FEED_BYTES = 450_000;
/** The rail shows at most 12 items per feed; 20 leaves room for filtering. */
export const RELAY_ITEMS_PER_FEED = 20;
/** GDELT's 25-article JSON is ~15 KB. */
export const MAX_GDELT_BYTES = 200_000;

/**
 * Keeps the RSS envelope and the first `max` <item>s. Ten untrimmed feeds
 * run to ~1.2 MB — over the relay's 1 MB ingest limit — while the rail only
 * reads the newest dozen of each.
 */
export function trimRss(xml: string, max: number = RELAY_ITEMS_PER_FEED): string {
  const first = xml.indexOf("<item>");
  if (first < 0) return xml;
  const items: string[] = [];
  let at = first;
  while (items.length < max) {
    const start = xml.indexOf("<item>", at);
    if (start < 0) break;
    const end = xml.indexOf("</item>", start);
    if (end < 0) break;
    items.push(xml.slice(start, end + "</item>".length));
    at = end + "</item>".length;
  }
  return `${xml.slice(0, first)}${items.join("")}</channel></rss>`;
}
