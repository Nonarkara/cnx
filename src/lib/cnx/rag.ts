// CNX Retrieval-Augmented Generation (RAG) corpus.
//
// Indexes every operational stream into a single searchable corpus so
// the "ถามเชียงใหม่" (Ask Chiang Mai) chatbot can answer free-text
// governor queries like:
//   - "How many RFD hotspots in Mae On district in the last 7 days?"
//   - "Which dams are above 70% storage right now?"
//   - "Which CNX datasets mention water quality?"
//
// Implementation note: We don't run an embedding model on the edge
// (Cloudflare Workers free tier doesn't host one). The retrieval uses
//// a normalised keyword index — fast enough for the corpus size
// (1k–10k docs) and honest about its limits (it can't do paraphrasing).
// Phase 7 swaps this for an embedding index when we wire a Vectorize
// index on Cloudflare.
//
// Each corpus "document" is a structured object with id / title / body
// / tags — see the `Corpus` interface. The chatbot UI renders the
// top-k retrieved documents as the answer, with their source link.

import { fetchCnxOpenDataIndex } from "./open-data-th";
import { fetchCnxFlood } from "./flood";
import { fetchCnxRfdFires } from "./fire-rfd";
import { fetchCnxSocial } from "./social";
import { fetchCnxAirQuality } from "./air-quality";
import type { CnxHeritageSite } from "../../types/cnx";

export interface Corpus {
  id: string;
  title: string;
  body: string;
  tags: string[];
  source: "open-data" | "flood" | "fire" | "social" | "air" | "heritage" | "story" | "flight";
  url?: string;
  /** Lat / lon if available, for map-linking. */
  longitude?: number;
  latitude?: number;
  /** ISO timestamp for recency ranking. */
  ts?: string;
}

const CNX_HERITAGE: CnxHeritageSite[] = [
  { id: "wat-phra-singh", name: "Wat Phra Singh", nameTh: "วัดพระสิงห์", category: "temple", longitude: 98.9867, latitude: 18.7895, brief: "14th-century Lanna temple housing the Phra Singh Buddha." },
  { id: "wat-chedi-luang", name: "Wat Chedi Luang", nameTh: "วัดเจดีย์หลวง", category: "temple", longitude: 98.9871, latitude: 18.7917, brief: "14th-century brick chedi, half-shattered by 1545 earthquake." },
  { id: "doi-suthep", name: "Wat Phra That Doi Suthep", nameTh: "วัดพระธาตุดอยสุเทพ", category: "temple", longitude: 98.9215, latitude: 18.8048, brief: "Iconic gilded chedi on the mountain above the city." },
  { id: "doi-inthanon", name: "Doi Inthanon NP", nameTh: "อุทยานแห่งชาติดอยอินทนนท์", category: "natural", longitude: 98.4867, latitude: 18.5883, brief: "Thailand's highest peak at 2,565 m." },
];

let cached: { at: number; corpus: Corpus[] } | null = null;
const TTL_MS = 5 * 60_000;

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w.length <= 32);
}

/** TF scoring — each term in a doc contributes 1/sqrt(term count in doc). */
function termFreq(doc: Document, term: string): number {
  const count = doc.terms.filter((t) => t === term).length;
  return count === 0 ? 0 : 1 / Math.sqrt(count);
}

interface Document {
  id: string;
  title: string;
  body: string;
  tags: string[];
  terms: string[];
  source: Corpus["source"];
  url?: string;
  longitude?: number;
  latitude?: number;
  ts?: string;
}

function buildCorpus(): Document[] {
  const docs: Document[] = [];
  // Open data
  for (const d of (cached?.corpus ?? []).filter((x) => x.source === "open-data")) {
    docs.push({
      id: d.id,
      title: d.title,
      body: d.body,
      tags: d.tags,
      terms: tokenize(`${d.title} ${d.body} ${d.tags.join(" ")}`),
      source: "open-data",
      url: d.url,
      ts: d.ts,
    });
  }
  // Heritage (static)
  for (const h of CNX_HERITAGE) {
    docs.push({
      id: h.id,
      title: `${h.name}${h.nameTh ? ` (${h.nameTh})` : ""}`,
      body: h.brief,
      tags: [h.category],
      terms: tokenize(`${h.name} ${h.nameTh ?? ""} ${h.brief} ${h.category}`),
      source: "heritage",
      longitude: h.longitude,
      latitude: h.latitude,
    });
  }
  // Live operational feeds — best-effort, fail-soft.
  // (Pulled synchronously here for simplicity; the cached corpus is
  // refreshed every TTL_MS.)
  // Note: in async mode these would be lazy.
  return docs;
}

async function buildAsyncCorpus(): Promise<Document[]> {
  const docs: Document[] = [];
  try {
    const od = await fetchCnxOpenDataIndex();
    for (const d of od.datasets) {
      docs.push({
        id: d.id,
        title: d.titleEn ?? d.titleTh ?? d.id,
        body: d.summary ?? `${d.publisher} · ${d.format}`,
        tags: d.tags,
        terms: tokenize(`${d.titleEn ?? ""} ${d.titleTh ?? ""} ${d.summary ?? ""} ${d.tags.join(" ")} ${d.publisher}`),
        source: "open-data",
        url: d.url,
        ts: d.fetchedAt,
      });
    }
  } catch { /* fail-soft */ }
  try {
    const flood = await fetchCnxFlood();
    for (const g of flood.gauges) {
      docs.push({
        id: g.stationId,
        title: `${g.name} (${g.river})`,
        body: `${g.levelM.toFixed(2)} m / ${g.bankFullM?.toFixed(2) ?? "?"} m · severity ${g.severity} · ${g.trend}`,
        tags: ["flood", "gauge", g.river, g.basin],
        terms: tokenize(`${g.name} ${g.river} ${g.basin} ${g.stationId}`),
        source: "flood",
        longitude: g.longitude,
        latitude: g.latitude,
        ts: g.observedAt,
      });
    }
    for (const r of flood.reservoirs) {
      docs.push({
        id: r.damId,
        title: r.name,
        body: `Storage ${(r.fillFraction * 100).toFixed(0)}% (${r.storageMCM} MCM) · inflow ${r.inflowM3s} m³/s · outflow ${r.outflowM3s} m³/s · severity ${r.severity}`,
        tags: ["flood", "dam", "reservoir"],
        terms: tokenize(`${r.name} dam reservoir`),
        source: "flood",
        ts: r.observedAt,
      });
    }
  } catch { /* fail-soft */ }
  try {
    const fires = await fetchCnxRfdFires();
    for (const h of fires.hotspots) {
      docs.push({
        id: h.yymmdd + h.lat + h.lon,
        title: `${h.aumper} · ${h.tumbon} · ${h.type}`,
        body: `${h.name} — ${h.yymmdd} ${h.time} · confidence ${h.confidence}%${h.frp ? ` · FRP ${h.frp} MW` : ""}`,
        tags: ["fire", "hotspot", h.type, h.aumper, h.tumbon],
        terms: tokenize(`${h.aumper} ${h.tumbon} ${h.name} ${h.type} hotspot fire`),
        source: "fire",
        longitude: h.lon,
        latitude: h.lat,
        ts: h.yymmdd,
      });
    }
  } catch { /* fail-soft */ }
  try {
    const air = await fetchCnxAirQuality();
    for (const s of air.stations) {
      docs.push({
        id: s.stationId,
        title: s.name,
        body: `PM2.5 ${s.pm25?.toFixed(0) ?? "?"} µg/m³ · PM10 ${s.pm10?.toFixed(0) ?? "?"} · O₃ ${s.o3?.toFixed(0) ?? "?"} · AQI ${s.aqiLevel}`,
        tags: ["air", "pm25", "station"],
        terms: tokenize(`${s.name} air pm25 station`),
        source: "air",
        longitude: s.longitude,
        latitude: s.latitude,
        ts: s.observedAt,
      });
    }
  } catch { /* fail-soft */ }
  for (const h of CNX_HERITAGE) {
    docs.push({
      id: h.id,
      title: `${h.name}${h.nameTh ? ` (${h.nameTh})` : ""}`,
      body: h.brief,
      tags: [h.category],
      terms: tokenize(`${h.name} ${h.nameTh ?? ""} ${h.brief} ${h.category}`),
      source: "heritage",
      longitude: h.longitude,
      latitude: h.latitude,
    });
  }
  return docs;
}

async function getCorpus(): Promise<Document[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.corpus.map(toDocument);
  const docs = await buildAsyncCorpus();
  cached = { at: Date.now(), corpus: docs };
  return docs;
}

function toDocument(c: Corpus): Document {
  return {
    id: c.id,
    title: c.title,
    body: c.body,
    tags: c.tags,
    terms: tokenize(`${c.title} ${c.body} ${c.tags.join(" ")}`),
    source: c.source,
    url: c.url,
    longitude: c.longitude,
    latitude: c.latitude,
    ts: c.ts,
  };
}

export interface RagResult {
  id: string;
  title: string;
  body: string;
  source: Corpus["source"];
  url?: string;
  score: number;
}

export async function searchCorpus(query: string, limit = 8): Promise<RagResult[]> {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];
  const docs = await getCorpus();

  // IDF over the corpus — frequent terms (e.g. "chiang", "mai") get
  // discounted, rare terms (e.g. "Nawarat Bridge") dominate.
  const df = new Map<string, number>();
  for (const d of docs) {
    const seen = new Set(d.terms);
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = (term: string) => Math.log(1 + (docs.length + 1) / ((df.get(term) ?? 0) + 1));

  const scored: { doc: Document; score: number }[] = [];
  for (const d of docs) {
    let s = 0;
    for (const q of queryTerms) {
      const tf = termFreq(d, q);
      if (tf === 0) continue;
      s += tf * idf(q);
      // Bonus if the term appears in the title.
      if (d.title.toLowerCase().includes(q)) s += 0.5;
    }
    // Tag boost — if any query term matches a tag exactly.
    for (const tag of d.tags) {
      if (queryTerms.includes(tag.toLowerCase())) s += 0.25;
    }
    if (s > 0) scored.push({ doc: d, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ doc, score }) => ({
    id: doc.id,
    title: doc.title,
    body: doc.body,
    source: doc.source,
    url: doc.url,
    score: Math.round(score * 1000) / 1000,
  }));
}

/** Build a short answer from the top-k retrieval. The chatbot UI
 *  shows this as the keystone paragraph; each cited doc becomes a
 *  reference bullet underneath. */
export async function answerQuestion(query: string): Promise<{
  query: string;
  answer: string;
  references: RagResult[];
}> {
  const results = await searchCorpus(query, 5);
  if (results.length === 0) {
    return {
      query,
      answer: "ฉันไม่พบคำตอบในข้อมูลที่มี — try a more specific query.",
      references: [],
    };
  }
  const bullets = results.map((r, i) => `${i + 1}. ${r.title} — ${r.body}`);
  return {
    query,
    answer: `จากข้อมูล ${results.length} แหล่ง:\n\n${bullets.join("\n")}`,
    references: results,
  };
}