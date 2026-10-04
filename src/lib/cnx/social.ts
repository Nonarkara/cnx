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

import type { SocialItem, SocialListeningResponse, FeedOutcome } from "../../types/cnx";
import { GDELT_URL, GOOGLE_NEWS_EN, GOOGLE_NEWS_TH, MAX_FEED_BYTES, MAX_GDELT_BYTES, MULTILINGUAL_FEEDS, RELAYED_FEEDS, SOCIAL_RSS_KV_KEY } from "./social-feeds";
import { isIsoDate, isObj, readRelayJson } from "./relay-kv";

/** What scripts/social-relay.mjs pushes: raw RSS bodies keyed by feed URL. */
export interface SocialRssPayload {
  generatedAt: string;
  feeds: Record<string, string>;
  /** Raw GDELT ArtList JSON text, when the relay got one. */
  gdelt?: string;
}

/** Only the known feeds, each a bounded RSS document. */
export function isSocialRssPayload(v: unknown): v is SocialRssPayload {
  if (!isObj(v) || !isIsoDate(v.generatedAt) || !isObj(v.feeds)) return false;
  const entries = Object.entries(v.feeds);
  if (v.gdelt !== undefined && (typeof v.gdelt !== "string" || v.gdelt.length > MAX_GDELT_BYTES)) return false;
  return (
    entries.length > 0 &&
    entries.every(
      ([url, body]) => RELAYED_FEEDS.includes(url) && typeof body === "string" && body.length <= MAX_FEED_BYTES && body.includes("<rss"),
    )
  );
}

/**
 * How old the relay's copy may be. The relay refreshes every 10 min; on top
 * of this age the response can sit in the in-process cache (TTL_MS, 3 min)
 * and at the edge (s-maxage 120 + stale-while-revalidate 180 = 5 min), so
 * 20 + 3 + 5 budgets the relay copy's collection age below 30 min.
 * Headline publication times are separate and can be older.
 */
const RELAY_MAX_AGE_MS = 20 * 60_000;


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

/** Parse a GDELT ArtList body. Anything without an article list is a
 *  failure, not "ok, 0 articles" — GDELT answers its rate limit with a
 *  plain-text 200. */
export function parseGdelt(text: string): { articles: GdeltArticle[]; outcome: FeedOutcome } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    const hint = /limit requests/i.test(text)
      ? "rate-limited by GDELT"
      : /OR'd terms/i.test(text)
        ? "GDELT rejected the query syntax"
        : "Invalid article response from GDELT";
    return { articles: [], outcome: { state: "failed", detail: hint } };
  }
  if (!isObj(json) || !Array.isArray(json.articles)) {
    return { articles: [], outcome: { state: "failed", detail: "Invalid article response from GDELT" } };
  }
  const articles: GdeltArticle[] = json.articles.filter(
    (article) => isObj(article) && typeof article.title === "string" && typeof article.url === "string",
  );
  return { articles, outcome: { state: "ok", itemCount: articles.length } };
}

/** The relay's copy first (GDELT rate-limits and times out from Workers),
 *  then a direct request. */
async function fetchGdelt(relayed: SocialRssPayload | null = null): Promise<{ articles: GdeltArticle[]; outcome: FeedOutcome }> {
  if (relayed?.gdelt) {
    const fromRelay = parseGdelt(relayed.gdelt);
    if (fromRelay.outcome.state === "ok") return fromRelay;
  }
  try {
    const res = await fetch(GDELT_URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { articles: [], outcome: { state: "failed", detail: `HTTP ${res.status} from GDELT` } };
    return parseGdelt(await res.text());
  } catch (e) {
    const name = e instanceof Error ? e.name : "Error";
    return { articles: [], outcome: { state: "failed", detail: name === "TimeoutError" || name === "AbortError" ? "timed out after 4000 ms" : String(e) } };
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

/** Origin-country names as other modules write them (airports.ts says
 *  "South Korea", adsb-lol.ts "Republic of Korea", OpenSky "Russian
 *  Federation") → the feed list's names. Without this, Korean and Russian
 *  visitors never selected their feed. */
const COUNTRY_ALIASES: Record<string, string> = {
  "south korea": "korea",
  "republic of korea": "korea",
  "korea, republic of": "korea",
  "russian federation": "russia",
  "people's republic of china": "china",
  "china, people's republic of": "china",
};

export function normaliseCountry(name: string): string {
  const n = name.trim().toLowerCase();
  return COUNTRY_ALIASES[n] ?? n;
}

/** Multilingual social: subscribes to per-language Google News feeds
 *  for the given top-N countries. Used when the flight desk's top
 *  origin countries include CN / JP / KR / RU / DE / FR / IN / AU. */
export async function fetchCnxSocialMultilingual(countries: string[] = []): Promise<SocialListeningResponse> {
  const wanted = new Set(countries.map(normaliseCountry));
  const selected = MULTILINGUAL_FEEDS.filter((f) => countries.length === 0 || wanted.has(normaliseCountry(f.country)));
  const key = selected.map((f) => f.country).sort().join(",");
  const cached = multilingualCache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;
  const now = new Date().toISOString();

  try {
    const feeds: { url: string; lang: SocialItem["lang"]; country: string | null }[] = [
      { url: GOOGLE_NEWS_TH, lang: "th", country: null },
      { url: GOOGLE_NEWS_EN, lang: "en", country: null },
      ...selected.map((f) => ({ url: f.url, lang: f.lang, country: f.country })),
    ];

    const relayed = await readRelayJson(SOCIAL_RSS_KV_KEY, RELAY_MAX_AGE_MS, isSocialRssPayload);
    const [rssResults, gdeltResult] = await Promise.all([
      Promise.allSettled(
        feeds.map((f) =>
          fetchRssFeed(f.url, 6_000, relayed).then((r) => {
            if (r.text === null) throw new Error(r.outcome.state === "failed" ? r.outcome.detail : "empty");
            return r.text;
          }),
        )
      ),
      fetchGdelt(relayed),
    ]);

    const items: SocialItem[] = [];
    // Start optimistic, then let each feed write its own outcome. A feed
    // that is blocked or times out overwrites its entry with the reason;
    // a feed that answers records how many items it actually had, so a
    // feed that returns 200 with nothing is distinguishable from one that
    // was never reached.
    const gdelt = gdeltResult.articles;
    const multilingual: Record<string, FeedOutcome> = {};
    const sources: SocialListeningResponse["sources"] = {
      googleNewsTh: { state: "ok", itemCount: 0 },
      googleNewsEn: { state: "ok", itemCount: 0 },
      gdelt: gdeltResult.outcome,
      multilingual,
    };
    // Each outcome goes to its own slot: the Indian and Australian feeds are
    // also English, and used to overwrite the main English feed's status.
    const record = (meta: (typeof feeds)[number], outcome: FeedOutcome) => {
      if (meta.country) multilingual[meta.country] = outcome;
      else if (meta.url === GOOGLE_NEWS_TH) sources.googleNewsTh = outcome;
      else sources.googleNewsEn = outcome;
    };
    for (let i = 0; i < feeds.length; i++) {
      const settled = rssResults[i];
      const meta = feeds[i];
      if (!settled || settled.status !== "fulfilled") {
        // Name the refusal. Three different things can happen here and
        // the rail must not render all of them as "no news".
        const why = settled && settled.status === "rejected" ? String(settled.reason?.message ?? settled.reason) : "no response";
        record(meta, { state: "failed", detail: why });
        continue;
      }
      try {
        const parsed = parseRss(settled.value).slice(0, 8);
        record(meta, { state: "ok", itemCount: parsed.length });
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

    for (const a of gdelt.filter((x) => x.title && x.url && /^https?:\/\//i.test(x.url) && isoFromGdelt(x.seendate)).filter((a, i, rows) => rows.findIndex((row) => row.url === a.url) === i)) {
      items.push({
        id: `gdelt-${a.url}`,
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
    const unavailableReason = socialUnavailableReason(sources);
    const response: SocialListeningResponse = {
      generatedAt: now,
      items: items.slice(0, 80),
      counts: {
        th: items.filter((i) => i.lang === "th").length,
        en: items.filter((i) => i.lang !== "th").length,
      },
      provenance: items.length === 0 && unavailableReason ? "unavailable" : "live",
      unavailableReason,
      sources,
    };
    multilingualCache.set(key, { at: Date.now(), data: response });
    return response;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    const failed: FeedOutcome = { state: "failed", detail };
    const response: SocialListeningResponse = {
      generatedAt: now,
      items: [],
      counts: { th: 0, en: 0 },
      provenance: "unavailable",
      unavailableReason: `Could not read the news feeds — ${detail}. This is a read failure, not an absence of news.`,
      sources: { googleNewsTh: failed, googleNewsEn: failed, gdelt: failed },
    };
    multilingualCache.set(key, { at: Date.now(), data: response });
    return response;
  }
}

/**
 * Fetch one Google News feed, and REPORT why it failed.
 *
 * The previous version collapsed every outcome to a string: a 503 became
 * `""`, a timeout became `""`, and a genuinely empty feed also became
 * `""`. Those three facts are different and the caller could not tell
 * them apart, which is how a total upstream block rendered on the board
 * as an ordinary empty rail.
 */
async function fetchRssFeed(
  url: string,
  timeoutMs = 6_000,
  relayed: SocialRssPayload | null = null,
): Promise<{ text: string | null; outcome: FeedOutcome }> {
  const copy = relayed?.feeds[url];
  if (copy) return { text: copy, outcome: { state: "ok", itemCount: (copy.match(/<item>/g) ?? []).length } };
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/rss+xml", "User-Agent": "cnx-dashboard/1.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      // Google answers Cloudflare's egress with its bot-block page: a
      // 503 carrying text/html "Sorry...". Naming the status is the
      // difference between "the feed is quiet" and "we were refused".
      return {
        text: null,
        outcome: { state: "failed", detail: `HTTP ${res.status} from Google News` },
      };
    }
    const text = await res.text();
    return { text, outcome: { state: "ok", itemCount: (text.match(/<item>/g) ?? []).length } };
  } catch (e) {
    const name = e instanceof Error ? e.name : "Error";
    return {
      text: null,
      outcome: {
        state: "failed",
        detail: name === "TimeoutError" || name === "AbortError" ? `timed out after ${timeoutMs} ms` : String(e),
      },
    };
  }
}

/** Turn per-source outcomes into the operator-facing reason. */
function socialUnavailableReason(sources: SocialListeningResponse["sources"]): string | null {
  const { multilingual = {}, ...core } = sources;
  const failed = [...Object.entries(core), ...Object.entries(multilingual)].filter(([, o]) => o.state === "failed");
  if (failed.length === 0) return null;
  const names: Record<string, string> = {
    googleNewsTh: "Google News (Thai)",
    googleNewsEn: "Google News (English)",
    gdelt: "GDELT",
  };
  const detail = failed
    .map(([k, o]) => `${names[k] ?? `Google News (${k})`}: ${o.state === "failed" ? o.detail : "?"}`)
    .join("; ");
  return `Could not read the news feeds — ${detail}. This is a read failure, not an absence of news.`;
}

export async function fetchCnxSocial(): Promise<SocialListeningResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const now = new Date().toISOString();

  try {
    const relayed = await readRelayJson(SOCIAL_RSS_KV_KEY, RELAY_MAX_AGE_MS, isSocialRssPayload);
    const [thFeed, enFeed, gdeltResult] = await Promise.all([
      fetchRssFeed(GOOGLE_NEWS_TH, 6_000, relayed),
      fetchRssFeed(GOOGLE_NEWS_EN, 6_000, relayed),
      fetchGdelt(relayed),
    ]);

    const th = thFeed.text ? parseRss(thFeed.text).slice(0, 12) : [];
    const en = enFeed.text ? parseRss(enFeed.text).slice(0, 12) : [];
    const gdeltItems: SocialItem[] = gdeltResult.articles
      .filter((a) => a.title && a.url && /^https?:\/\//i.test(a.url) && isoFromGdelt(a.seendate))
      .filter((a, i, rows) => rows.findIndex((row) => row.url === a.url) === i)
      .map((a) => ({
        id: `gdelt-${a.url}`,
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
    const sources: SocialListeningResponse["sources"] = {
      googleNewsTh: thFeed.outcome,
      googleNewsEn: enFeed.outcome,
      gdelt: gdeltResult.outcome,
    };
    const unavailableReason = socialUnavailableReason(sources);
    const response: SocialListeningResponse = {
      generatedAt: now,
      items: items.slice(0, 60),
      counts: {
        th: items.filter((i) => i.lang === "th").length,
        en: items.filter((i) => i.lang !== "th").length,
      },
      // A total failure is "unavailable", not a live read that found
      // nothing. Every source down and zero items is exactly the case
      // that used to render as a quiet news day.
      provenance: items.length === 0 && unavailableReason ? "unavailable" : "live",
      unavailableReason,
      sources,
    };
    cache = { at: Date.now(), data: response };
    return response;
  } catch (e) {
    // The outer catch is a last resort — `fetchRssFeed` no longer throws,
    // so reaching here means something unexpected, not an upstream
    // refusal. Say which, rather than reporting an empty news day.
    const detail = e instanceof Error ? e.message : String(e);
    const failed: FeedOutcome = { state: "failed", detail };
    const response: SocialListeningResponse = {
      generatedAt: now,
      items: [],
      counts: { th: 0, en: 0 },
      provenance: "unavailable",
      unavailableReason: `Could not read the news feeds — ${detail}. This is a read failure, not an absence of news.`,
      sources: { googleNewsTh: failed, googleNewsEn: failed, gdelt: failed },
    };
    cache = { at: Date.now(), data: response };
    return response;
  }
}
