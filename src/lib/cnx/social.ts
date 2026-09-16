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

const BASELINE_CNX_SOCIAL: Omit<SocialItem, "publishedAt">[] = [
  { id: "cm-th-1", source: "google-news", lang: "th", title: "เชียงใหม่เตรียมพร้อมรับมือหมอกควันไฟป่า 2569 ตั้งจุดสกัด 25 อำเภอเข้มงวด", url: "https://chiangmai.go.th", tone: "alert", sentiment: "neutral", topics: ["ไฟป่า", "PM2.5"] },
  { id: "cm-th-2", source: "google-news", lang: "th", title: "ชลประทานเชียงใหม่เฝ้าระวังระดับน้ำแม่น้ำปิง สถานี P.1 สะพานนวรัฐ อยู่ในเกณฑ์ปกติ", url: "https://hydro-1.net", tone: "info", sentiment: "positive", topics: ["แม่น้ำปิง", "น้ำท่วม"] },
  { id: "cm-th-3", source: "google-news", lang: "th", title: "อบจ. เชียงใหม่ อนุมัติงบประมาณ 120 ล้านบาท พัฒนาระบบ Smart City และกล้อง CCTV ทั่วเมือง", url: "https://chiangmaipao.go.th", tone: "info", sentiment: "positive", topics: ["Smart City", "งบประมาณ"] },
  { id: "cm-th-4", source: "google-news", lang: "th", title: "เทศบาลนครเชียงใหม่จัดระเบียบการจราจรรอบคูเมืองและถนนนิมมานเหมินท์ รับนักท่องเที่ยว", url: "https://cm-city.go.th", tone: "info", sentiment: "neutral", topics: ["จราจร", "นิมมาน"] },
  { id: "cm-th-5", source: "google-news", lang: "th", title: "อุทยานแห่งชาติดอยสุเทพ-ปุย ประกาศเฝ้าระวังพื้นที่ป่าอนุรักษ์ ลาดตระเวนร่วมชุมชน 24 ชม.", url: "https://dnp.go.th", tone: "info", sentiment: "neutral", topics: ["ดอยสุเทพ", "ป่าสงวน"] },
  { id: "cm-th-6", source: "google-news", lang: "th", title: "มหาวิทยาลัยเชียงใหม่ เปิดตัวสถานีตรวจวัดคุณภาพอากาศเซ็นเซอร์ความแม่นยำสูง 100 จุด", url: "https://cmu.ac.th", tone: "info", sentiment: "positive", topics: ["มช.", "ฝุ่นควัน"] },
  { id: "cm-th-7", source: "google-news", lang: "th", title: "ท่าอากาศยานเชียงใหม่ (CNX) เผยยอดผู้โดยสารระหว่างประเทศพุ่ง 35% สายการบินเอเชียแห่เปิดรูทตรง", url: "https://chiangmaiairportthai.com", tone: "info", sentiment: "positive", topics: ["สนามบิน", "ท่องเที่ยว"] },
  { id: "cm-th-8", source: "google-news", lang: "th", title: "กรมป่าไม้ร่วมกับจังหวัดเชียงใหม่ สั่งห้ามเผาเด็ดขาดในเขตป่าสงวนแม่แจ่มและสะเมิง", url: "https://forest.go.th", tone: "alert", sentiment: "negative", topics: ["ห้ามเผา", "แม่แจ่ม"] },
  { id: "cm-th-9", source: "google-news", lang: "th", title: "วัดพระสิงห์วรมหาวิหารและวัดเจดีย์หลวง เตรียมจัดงานสมโภชพระอารามหลวง 700 ปี เมืองเชียงใหม่", url: "https://onab.go.th", tone: "info", sentiment: "positive", topics: ["วัดพระสิงห์", "วัฒนธรรม"] },
  { id: "cm-th-10", source: "google-news", lang: "th", title: "เขื่อนภูมิพลและเขื่อนสิริกิติ์รายงานปริมาณน้ำกักเก็บพร้อมรับฤดูแล้ง ไม่กระทบพื้นที่การเกษตรล้านนา", url: "https://egat.co.th", tone: "info", sentiment: "positive", topics: ["เขื่อนภูมิพล", "น้ำ"] },
  { id: "cm-en-1", source: "google-news", lang: "en", title: "Chiang Mai ranked top global digital nomad hub for 2026 citing climate and cafe culture", url: "https://nomadlist.com", tone: "info", sentiment: "positive", topics: ["nomads", "lifestyle"] },
  { id: "cm-en-2", source: "google-news", lang: "en", title: "Chiang Mai International Airport expands terminal capacity to handle 16.5 million passengers", url: "https://bangkokpost.com", tone: "info", sentiment: "positive", topics: ["aviation", "tourism"] },
  { id: "cm-en-3", source: "gdelt", lang: "en", title: "Northern Thailand provincial task force deploys satellite telemetry for early wildfire detection", url: "https://reuters.com", tone: "info", sentiment: "positive", topics: ["wildfires", "remote-sensing"] },
  { id: "cm-en-4", source: "google-news", lang: "en", title: "UNESCO heritage committee reviews Chiang Mai historic monuments and Old City moat conservation", url: "https://unesco.org", tone: "info", sentiment: "positive", topics: ["heritage", "old-city"] },
  { id: "cm-en-5", source: "gdelt", lang: "en", title: "Chiang Mai coffee industry booms as specialty Arabica from Mae Taeng wins international acclaim", url: "https://bloomberg.com", tone: "info", sentiment: "positive", topics: ["agriculture", "economy"] },
  { id: "cm-en-6", source: "google-news", lang: "en", title: "Air quality monitoring in Ping River basin enhanced with real-time sensor network", url: "https://air4thai.pcd.go.th", tone: "info", sentiment: "neutral", topics: ["air-quality", "sensor"] },
  { id: "cm-zh-1", source: "google-news", lang: "zh", title: "清迈旅游热度持续攀升 中国游客直飞航线增至每周48班次", url: "https://xinhuanet.com", tone: "info", sentiment: "positive", topics: ["旅游", "航线"] },
  { id: "cm-ja-1", source: "google-news", lang: "ja", title: "チェンマイ旧市街の寺院修復プロジェクトが完了 観光客の受け入れ体制を強化", url: "https://nhk.or.jp", tone: "info", sentiment: "positive", topics: ["寺院", "文化"] },
  { id: "cm-ko-1", source: "google-news", lang: "ko", title: "치앙마이 골프 및 힐링 여행 수요 급증 직항편 예약률 90% 돌파", url: "https://yonhapnewstv.co.kr", tone: "info", sentiment: "positive", topics: ["관광", "직항"] }
];

function buildBaselineItems(nowIso: string): SocialItem[] {
  const nowMs = Date.parse(nowIso) || Date.now();
  // Baseline items are **scenario placeholders** so the social rail is
  // never empty during cold start, Overpass / GDELT outages, or when
  // the dashboard is offline from public feeds. Each one is themed
  // around a real Chiang Mai operational topic (burning season, Mae
  // Ngat storage, Nimman traffic, Doi Suthep ranger patrol, etc.) so
  // an operator glancing at the rail still sees plausible categories
  // — but the headline copy and the specific URLs are placeholders,
  // NOT live news. The UI labels them with `tone: "demo"` so the
  // RAG/social sidebar can render an amber DEMO badge. Operators are
  // expected to swap these out as real feeds come online.
  return BASELINE_CNX_SOCIAL.map((item, idx) => ({
    ...item,
    tone: "demo" as const,
    publishedAt: new Date(nowMs - (idx * 23 + 12) * 60_000).toISOString(),
  }));
}

/** Multilingual social: subscribes to per-language Google News feeds
 *  for the given top-N countries. Used when the flight desk's top
 *  origin countries include CN / JP / KR / RU / DE / FR / IN / AU. */
export async function fetchCnxSocialMultilingual(countries: string[] = []): Promise<SocialListeningResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const now = new Date().toISOString();
  const baseline = buildBaselineItems(now);

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
            publishedAt: r.pubDate ? new Date(r.pubDate).toISOString() : now,
            tone: "info",
          });
        }
      } catch {
        // skip malformed feed
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

    // Merge baseline items to guarantee a rich stream
    const seenTitles = new Set(items.map((i) => i.title.toLowerCase().trim()));
    for (const b of baseline) {
      if (!seenTitles.has(b.title.toLowerCase().trim())) {
        items.push(b);
      }
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
    cache = { at: Date.now(), data: response };
    return response;
  } catch {
    const response: SocialListeningResponse = {
      generatedAt: now,
      items: baseline,
      counts: {
        th: baseline.filter((i) => i.lang === "th").length,
        en: baseline.filter((i) => i.lang !== "th").length,
      },
    };
    return response;
  }
}

export async function fetchCnxSocial(): Promise<SocialListeningResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const now = new Date().toISOString();
  const baseline = buildBaselineItems(now);

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
    ];

    const seenTitles = new Set(items.map((i) => i.title.toLowerCase().trim()));
    for (const b of baseline) {
      if (!seenTitles.has(b.title.toLowerCase().trim())) {
        items.push(b);
      }
    }

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
      items: baseline,
      counts: {
        th: baseline.filter((i) => i.lang === "th").length,
        en: baseline.filter((i) => i.lang !== "th").length,
      },
    };
    return response;
  }
}