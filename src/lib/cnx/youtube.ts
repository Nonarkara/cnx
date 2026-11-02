// Daily sampled YouTube metadata. Imports stay lazy so the same validation
// and bounds can run in the plain-Node relay without loading Next/Workers.
export const YOUTUBE_KV_KEY = "youtube-catalogue-latest";
export const YOUTUBE_DAY_MS = 86_400_000;
export const YOUTUBE_MAX_AGE_MS = 2 * YOUTUBE_DAY_MS;
export const YOUTUBE_MAX_VIDEOS = 60;
export const YOUTUBE_QUERIES = [
  { language: "th", query: "เชียงใหม่" }, { language: "en", query: "Chiang Mai" },
  { language: "zh-Hans", query: "清迈" }, { language: "ja", query: "チェンマイ" },
  { language: "ko", query: "치앙마이" }, { language: "ru", query: "Чиангмай" },
] as const;

export interface YoutubeVideo {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  /** YouTube's cumulative view count at capturedAt, not views in this window. */
  viewCount: number;
  embeddable: true;
  /** Omitted upstream flags remain unknown. Do not infer false. */
  madeForKids: boolean | null;
  /** Upstream metadata only; search-language bias is not video-language detection. */
  language: string | null;
}
export interface YoutubeQuery {
  language: string;
  query: string;
  status: "ok" | "failed";
  resultCount: number;
}
export interface YoutubePayload {
  generatedAt: string;
  /** Metadata retrieval time, distinct from publication dates. */
  capturedAt: string;
  windowStart: string;
  windowEnd: string;
  queries: YoutubeQuery[];
  detailsFailed: number;
  videos: YoutubeVideo[];
}
export interface YoutubeResponse {
  provenance: "cached" | "unavailable";
  state: "current" | "stale" | "unavailable";
  source: "YouTube Data API v3";
  generatedAt: string | null;
  capturedAt: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  queries: YoutubeQuery[];
  detailsFailed: number;
  videos: YoutubeVideo[];
  note: string;
}
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const uint = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
export const isYoutubeVideoId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{11}$/.test(v);
const iso = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)) return false;
  const t = Date.parse(v);
  return Number.isFinite(t) && (new Date(t).toISOString() === v || new Date(t).toISOString().replace(".000Z", "Z") === v);
};
export function isYoutubeVideo(v: unknown): v is YoutubeVideo {
  return obj(v) && isYoutubeVideoId(v.id) && text(v.title, 300) && text(v.channelTitle, 200)
    && typeof v.channelId === "string" && /^UC[A-Za-z0-9_-]{22}$/.test(v.channelId)
    && iso(v.publishedAt) && uint(v.viewCount) && v.embeddable === true
    && (v.madeForKids === null || typeof v.madeForKids === "boolean")
    && (v.language === null || typeof v.language === "string" && /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8}){0,3}$/.test(v.language));
}
export function isYoutubePayload(v: unknown): v is YoutubePayload {
  if (!obj(v) || !iso(v.generatedAt) || !iso(v.capturedAt) || !iso(v.windowStart) || !iso(v.windowEnd)
    || v.generatedAt !== v.capturedAt || Date.parse(v.windowEnd) > Date.parse(v.capturedAt)
    || Date.parse(v.capturedAt) - Date.parse(v.windowEnd) > 10 * 60_000
    || Date.parse(v.windowEnd) - Date.parse(v.windowStart) !== 30 * YOUTUBE_DAY_MS
    || !uint(v.detailsFailed, 3) || !Array.isArray(v.videos) || v.videos.length > YOUTUBE_MAX_VIDEOS
    || !Array.isArray(v.queries) || v.queries.length !== YOUTUBE_QUERIES.length) return false;
  const queries = v.queries;
  if (!YOUTUBE_QUERIES.every(q => queries.filter(r => obj(r) && r.language === q.language && r.query === q.query
    && (r.status === "ok" || r.status === "failed") && uint(r.resultCount, 25)
    && (r.status === "ok" || r.resultCount === 0)).length === 1)
    || !queries.some(q => q.status === "ok")) return false;
  const videos = v.videos;
  return videos.every(isYoutubeVideo) && new Set(videos.map(row => row.id)).size === videos.length
    && videos.every((row, index) => Date.parse(row.publishedAt) >= Date.parse(v.windowStart as string)
      && Date.parse(row.publishedAt) <= Date.parse(v.windowEnd as string)
      && (index === 0 || videos[index - 1].viewCount >= row.viewCount));
}

export async function fetchCnxYoutube(): Promise<YoutubeResponse> {
  const { readRelayJson } = await import("./relay-kv.ts");
  const data = await readRelayJson(YOUTUBE_KV_KEY, YOUTUBE_MAX_AGE_MS, isYoutubePayload);
  if (!data) return {
    provenance: "unavailable", state: "unavailable", source: "YouTube Data API v3",
    generatedAt: null, capturedAt: null, windowStart: null, windowEnd: null, queries: [], detailsFailed: 0, videos: [],
    note: "No valid daily catalogue is available within 48 hours. The relay/API key may be unconfigured or retrieval failed. Visitor requests never search YouTube; no fallback videos are invented.",
  };
  const stale = Date.now() - Date.parse(data.capturedAt) > YOUTUBE_DAY_MS;
  const partial = data.queries.some(q => q.status === "failed") || data.detailsFailed > 0;
  return {
    ...data, provenance: "cached", state: stale ? "stale" : "current", source: "YouTube Data API v3",
    note: `${stale ? "Stale daily snapshot (over 24 hours). " : "Daily metadata snapshot. "}${partial ? "Retrieval is partial; some queries or detail batches failed. " : ""}Ranked by cumulative YouTube views at capture among the retrieved multilingual query sample of videos published in the preceding 30 days, not worldwide top videos, views gained in 30 days, public sentiment or verified local reporting. Search languages do not establish spoken language or nationality. Only public videos with embedding allowed at capture are listed; playback availability can change or vary by region.`,
  };
}
