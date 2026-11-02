// Official API metadata only; never downloads media, transcripts or comments.
// Integration calls runYoutubeRelay from the existing relay tick. Importing
// this file starts no timers and sends no requests. API errors never log URLs
// or response bodies because either may contain credentials.
import { isYoutubePayload, isYoutubeVideo, isYoutubeVideoId, YOUTUBE_DAY_MS, YOUTUBE_MAX_VIDEOS, YOUTUBE_QUERIES } from "../src/lib/cnx/youtube.ts";

const MAX_JSON_BYTES = 1_048_576;
const cleanText = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
let lastRunAt = null;

async function boundedJson(response) {
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new Error(`YouTube HTTP ${response.status}`); }
  if (Number(response.headers.get("content-length")) > MAX_JSON_BYTES) { await response.body?.cancel().catch(() => {}); throw new Error("YouTube response too large"); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("YouTube response missing");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) { await reader.cancel().catch(() => {}); throw new Error("YouTube response too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) throw new Error("Invalid YouTube response");
  return parsed.items;
}
async function apiList(method, params, apiKey) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${method}`);
  url.search = new URLSearchParams({ ...params, key: apiKey }).toString();
  return boundedJson(await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) }));
}
function normaliseVideo(raw, windowStart, windowEnd) {
  const snippet = raw?.snippet;
  if (!snippet || raw.status?.privacyStatus !== "public" || raw.status.embeddable !== true
    || snippet.liveBroadcastContent === "live" || snippet.liveBroadcastContent === "upcoming") return null;
  const count = raw.statistics?.viewCount;
  if (typeof count !== "string" || !/^\d{1,16}$/.test(count)) return null;
  const published = Date.parse(snippet.publishedAt);
  if (!Number.isFinite(published) || published < Date.parse(windowStart) || published > Date.parse(windowEnd)) return null;
  const row = {
    id: raw.id, title: cleanText(snippet.title, 300), channelId: snippet.channelId,
    channelTitle: cleanText(snippet.channelTitle, 200), publishedAt: new Date(published).toISOString(),
    viewCount: Number(count), embeddable: true,
    madeForKids: typeof raw.status.madeForKids === "boolean" ? raw.status.madeForKids : null,
    language: snippet.defaultAudioLanguage ?? snippet.defaultLanguage ?? null,
  };
  return isYoutubeVideo(row) ? row : null;
}

/** At most six searches + three videos.list calls, no pagination/retries.
 * Search-language bias is not a classifier for a speaker or nationality.
 * Failed attempts return no payload, preserving the last successful KV copy.
 */
export async function collectYoutubeCatalogue({ apiKey = process.env.CNX_YOUTUBE_API_KEY ?? process.env.YOUTUBE_API_KEY ?? "" } = {}) {
  if (!apiKey.trim()) return { state: "not-configured", payload: null };
  const windowEnd = new Date().toISOString();
  const windowStart = new Date(Date.parse(windowEnd) - 30 * YOUTUBE_DAY_MS).toISOString();
  const queries = [];
  const ids = new Set();
  for (const q of YOUTUBE_QUERIES) {
    try {
      const items = await apiList("search", {
        part: "snippet", type: "video", q: q.query, relevanceLanguage: q.language,
        publishedAfter: windowStart, publishedBefore: windowEnd, order: "viewCount",
        maxResults: "25", videoEmbeddable: "true", safeSearch: "moderate",
        fields: "items(id/videoId)",
      }, apiKey);
      if (items.length > 25 || items.some(item => !isYoutubeVideoId(item?.id?.videoId))) throw new Error("Invalid YouTube search IDs");
      for (const item of items) ids.add(item.id.videoId);
      queries.push({ ...q, status: "ok", resultCount: items.length });
    } catch { queries.push({ ...q, status: "failed", resultCount: 0 }); }
  }
  if (queries.every(q => q.status === "failed")) return { state: "failed", payload: null };
  const videos = new Map();
  const list = [...ids];
  let detailsFailed = 0;
  let detailsSucceeded = 0;
  for (let start = 0; start < list.length; start += 50) {
    const batch = list.slice(start, start + 50);
    const requested = new Set(batch);
    try {
      const items = await apiList("videos", { part: "snippet,statistics,status", id: batch.join(","), maxResults: "50",
        fields: "items(id,snippet(title,channelId,channelTitle,publishedAt,defaultAudioLanguage,defaultLanguage,liveBroadcastContent),statistics/viewCount,status(privacyStatus,embeddable,madeForKids))",
      }, apiKey);
      if (items.length > 50) throw new Error("Too many YouTube detail rows");
      detailsSucceeded++;
      for (const raw of items) {
        if (!requested.has(raw?.id)) continue;
        const row = normaliseVideo(raw, windowStart, windowEnd);
        if (row) videos.set(row.id, row);
      }
    } catch { detailsFailed++; }
  }
  if (ids.size && !detailsSucceeded) return { state: "failed", payload: null };
  const capturedAt = new Date().toISOString();
  const payload = { generatedAt: capturedAt, capturedAt, windowStart, windowEnd, queries, detailsFailed,
    videos: [...videos.values()].sort((a, b) => b.viewCount - a.viewCount || a.id.localeCompare(b.id)).slice(0, YOUTUBE_MAX_VIDEOS) };
  if (!isYoutubePayload(payload)) return { state: "failed", payload: null };
  return { state: detailsFailed || queries.some(q => q.status === "failed") ? "partial" : "ok", payload };
}

/** Once per 24h per relay process; the host tick owns scheduling. No retries
 * on quota/auth failure and no failure payload overwrites a good snapshot.
 */
export async function runYoutubeRelay({ baseUrl, secret, apiKey } = {}) {
  if (!baseUrl || !secret) return { state: "not-configured" };
  if (lastRunAt !== null && Date.now() - lastRunAt < YOUTUBE_DAY_MS) return { state: "skipped" };
  lastRunAt = Date.now();
  const result = await collectYoutubeCatalogue({ apiKey });
  if (!result.payload) {
    console.warn(`[youtube] catalogue unavailable: ${result.state}; previous KV copy retained`);
    return { state: result.state };
  }
  try {
    const response = await fetch(`${baseUrl}/api/cnx/youtube/ingest`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Relay-Secret": secret },
      body: JSON.stringify(result.payload), signal: AbortSignal.timeout(20_000),
    });
    await response.body?.cancel().catch(() => {});
    if (!response.ok) throw new Error("ingest failed");
    console.log(`[youtube] ${result.payload.videos.length} sampled videos relayed (${result.state})`);
    return { state: result.state };
  } catch {
    console.warn("[youtube] ingest failed; previous KV copy retained");
    return { state: "push-failed" };
  }
}
