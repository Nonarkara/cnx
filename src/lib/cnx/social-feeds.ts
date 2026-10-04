// The Google News feeds behind the social rail. Import-free so the relay
// (scripts/social-relay.mjs, Node type-stripping) and the Worker read the
// same list. Google throttles Cloudflare's network — from the Worker both
// feeds time out, from the relay Mac they answer in ~0.5 s — so the relay
// copies them into KV and the Worker reads that copy first.

export const GOOGLE_NEWS_TH =
  "https://news.google.com/rss/search?q=%E0%B9%80%E0%B8%8A%E0%B8%B5%E0%B8%A2%E0%B8%87%E0%B9%83%E0%B8%AB%E0%B8%A1%E0%B9%88&hl=th";
export const GOOGLE_NEWS_EN = "https://news.google.com/rss/search?q=Chiang+Mai+OR+%22Chiang+Mai%22&hl=en&gl=US";

export const RELAYED_FEEDS: readonly string[] = [GOOGLE_NEWS_TH, GOOGLE_NEWS_EN];

export const SOCIAL_RSS_KV_KEY = "social-rss-latest";
/** Largest single feed body accepted from the relay (the Thai feed is ~240 KB). */
export const MAX_FEED_BYTES = 450_000;
