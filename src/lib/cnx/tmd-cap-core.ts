// TMD official warnings — pure CAP 1.2 parsing and Chiang Mai selection.
//
// The Thai Meteorological Department publishes signed CAP 1.2 alerts behind
// two RSS indexes (Thai: /api/xml/CAP, English: /en/api/xml/CAP); each item
// links to one CAP XML document. This module turns those documents into the
// alerts that are in force for Chiang Mai. It has no imports and touches no
// DOM (Workers has no DOMParser), so the Worker and, if TMD ever blocks
// Cloudflare's egress, a residential relay script can run the same code.
//
// Selection, in this order (docs/DIGITAL-TWIN-STANDARDS.md item 1):
//   1. Pair the Thai and English documents of one alert: their identifiers
//      differ only by a "-en" suffix ("TMD20261011062847_2" and
//      "TMD20261011062847_2-en"), and `references` uses the bare form.
//   2. Keep only the latest message of each references chain. This runs on
//      ALL alerts before the geography test, because an Update that drops
//      Chiang Mai from its area is exactly how TMD lifts a warning here.
//   3. Drop msgType=Cancel, status other than Actual, and expired alerts.
//   4. Keep an alert when an area carries geocode TH-50 (ISO 3166-2 for
//      Chiang Mai) or, for an area with no province geocodes at all, when
//      a polygon vertex falls inside the province (see areaHitsProvince for
//      why polygons do not override an explicit geocode list).
//
// CAP polygons are "lat,lon" pairs separated by spaces; everything this
// module returns is [lon, lat], the order of the province ring and deck.gl.

export type CapSeverity = "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";
export type LonLat = [number, number];

export interface CapRssItem {
  link: string;
  guid: string | null;
  title: string | null;
  pubDate: string | null;
}

export interface CapArea {
  areaDesc: string;
  geocodes: { valueName: string; value: string }[];
  /** Rings as [lon, lat]. */
  polygons: LonLat[][];
}

export interface CapInfo {
  language: string;
  event: string;
  urgency: string;
  severity: CapSeverity;
  certainty: string;
  effective: string | null;
  expires: string | null;
  headline: string;
  instruction: string;
  web: string | null;
  areas: CapArea[];
}

export interface CapAlert {
  identifier: string;
  sender: string;
  sent: string;
  status: string;
  msgType: string;
  scope: string;
  /** Identifiers named in `references` (the middle of each sender,id,sent triple). */
  references: string[];
  infos: CapInfo[];
}

/** One alert as served by /api/cnx/official-warnings. */
export interface OfficialAlert {
  /** Base identifier shared by the Thai and English documents. */
  identifier: string;
  sent: string;
  effective: string | null;
  expires: string | null;
  event: string;
  headline_th: string | null;
  headline_en: string | null;
  severity: CapSeverity;
  urgency: string;
  certainty: string;
  instruction_th: string | null;
  instruction_en: string | null;
  web: string | null;
  areaDesc: string;
  areaDesc_th: string | null;
  areaDesc_en: string | null;
  /** True when the match came from TH-50 rather than only from a polygon. */
  geocodeMatch: boolean;
  /** Rings near the province, [lon, lat]; the rest of Thailand is dropped. */
  polygons: LonLat[][];
}

export interface OfficialWarningsResponse {
  provenance: "live" | "unavailable";
  fetchedAt: string;
  alerts: OfficialAlert[];
  /** Why the feed is unavailable, or a partial-read note; null when clean. */
  reason: string | null;
  reason_th: string | null;
  /** CAP documents read / listed in the indexes. */
  documentsRead: number;
  documentsListed: number;
  source: string;
}

export interface SelectOptions {
  now: number;
  /** Point-in-province test, (longitude, latitude). */
  inside: (longitude: number, latitude: number) => boolean;
  /** Province bounding box; polygons that miss it are not returned. */
  bbox: { west: number; south: number; east: number; north: number };
}

export const CHIANG_MAI_GEOCODE = "TH-50";
export const TMD_CAP_SOURCE = "TMD · CAP 1.2";

// ── Minimal XML reading ────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXml(raw: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  if (cdata) return cdata[1];
  return raw.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

/** Inner XML of every <tag> (any namespace prefix). Tags must not nest in themselves. */
export function xmlBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z_][\\w.-]*:)?${tag}\\s*>`, "g");
  const out: string[] = [];
  for (let m = re.exec(xml); m; m = re.exec(xml)) out.push(m[1]);
  return out;
}

/** Decoded, trimmed text of the first <tag>, or null. */
export function xmlText(xml: string, tag: string): string | null {
  const block = xmlBlocks(xml, tag)[0];
  if (block === undefined) return null;
  const text = decodeXml(block).trim();
  return text || null;
}

function stripNoise(xml: string): string {
  return xml
    .replace(/^﻿/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(?:[A-Za-z_][\w.-]*:)?Signature[\s>][\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?Signature\s*>/g, "");
}

// ── RSS index ──────────────────────────────────────────────────────────

/** Items of a TMD CAP RSS index; only http(s) links to .xml documents. */
export function parseCapRss(xml: string, limit = 20): CapRssItem[] {
  const items: CapRssItem[] = [];
  for (const block of xmlBlocks(stripNoise(xml), "item")) {
    const link = xmlText(block, "link");
    if (!link || !/^https?:\/\/[^\s]+\.xml$/i.test(link)) continue;
    items.push({ link, guid: xmlText(block, "guid"), title: xmlText(block, "title"), pubDate: xmlText(block, "pubDate") });
    if (items.length >= limit) break;
  }
  return items;
}

/** Base identifier of an index item: its guid, else the link's file name. */
export function rssItemBaseId(item: CapRssItem): string | null {
  if (item.guid) return capBaseId(item.guid);
  const file = /CAP(TMD[^/]*?)\.xml$/i.exec(item.link);
  return file ? capBaseId(file[1]) : null;
}

// ── CAP document ───────────────────────────────────────────────────────

const SEVERITIES: readonly CapSeverity[] = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"];

/** "lat,lon lat,lon …" → [lon, lat] ring; null when it is not a usable ring. */
export function parseCapPolygon(text: string): LonLat[] | null {
  const ring: LonLat[] = [];
  for (const pair of text.trim().split(/\s+/)) {
    const [latRaw, lonRaw] = pair.split(",");
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    ring.push([lon, lat]);
  }
  return ring.length >= 3 ? ring : null;
}

function parseArea(block: string): CapArea {
  const geocodes = xmlBlocks(block, "geocode").flatMap((g) => {
    const value = xmlText(g, "value");
    return value ? [{ valueName: xmlText(g, "valueName") ?? "", value }] : [];
  });
  const polygons = xmlBlocks(block, "polygon").flatMap((p) => {
    const ring = parseCapPolygon(decodeXml(p));
    return ring ? [ring] : [];
  });
  return { areaDesc: xmlText(block, "areaDesc") ?? "", geocodes, polygons };
}

function parseInfo(block: string): CapInfo {
  const severity = xmlText(block, "severity") as CapSeverity | null;
  return {
    language: xmlText(block, "language") ?? "en-US",
    event: xmlText(block, "event") ?? "",
    urgency: xmlText(block, "urgency") ?? "Unknown",
    severity: severity && SEVERITIES.includes(severity) ? severity : "Unknown",
    certainty: xmlText(block, "certainty") ?? "Unknown",
    effective: xmlText(block, "effective"),
    expires: xmlText(block, "expires"),
    headline: xmlText(block, "headline") ?? "",
    instruction: xmlText(block, "instruction") ?? "",
    web: xmlText(block, "web"),
    areas: xmlBlocks(block, "area").map(parseArea),
  };
}

/** One CAP 1.2 <alert>, or null when the document is not one. */
export function parseCapAlert(xml: string): CapAlert | null {
  const clean = stripNoise(xml);
  const alert = xmlBlocks(clean, "alert")[0];
  if (alert === undefined) return null;
  const identifier = xmlText(alert, "identifier");
  const sent = xmlText(alert, "sent");
  if (!identifier || !sent) return null;
  // references: whitespace-separated "sender,identifier,sent" triples.
  const references = (xmlText(alert, "references") ?? "")
    .split(/\s+/)
    .map((triple) => triple.split(",")[1]?.trim())
    .filter((id): id is string => Boolean(id));
  return {
    identifier,
    sender: xmlText(alert, "sender") ?? "",
    sent,
    status: xmlText(alert, "status") ?? "",
    msgType: xmlText(alert, "msgType") ?? "",
    scope: xmlText(alert, "scope") ?? "",
    references,
    infos: xmlBlocks(alert, "info").map(parseInfo),
  };
}

// ── Selection ──────────────────────────────────────────────────────────

/** "TMD20261011062847_2-en" → "TMD20261011062847_2". */
export function capBaseId(identifier: string): string {
  return identifier.replace(/-(en|th)$/i, "");
}

const isThai = (info: CapInfo) => /^th/i.test(info.language);

/**
 * An area that lists ISO 3166-2 geocodes is decided by them alone; the
 * polygon test is for areas that carry no geocode.
 *
 * Measured on the live feed, 2026-10-11: TMD's polygons are province
 * outlines from a different boundary dataset than our OSM ring, and they
 * disagree by up to 4.7 km along shared borders. TMD20261011062847_2 lists
 * Tak (TH-63) but not TH-50, yet 37 vertices of its Tak outline fall inside
 * our Chiang Mai ring — a plain "any vertex inside" rule would have shown
 * the governor an official TMD warning for Chiang Mai that TMD never issued.
 * TMD's own geocode list is the statement of which provinces it covers.
 */
function areaHitsProvince(area: CapArea, opts: SelectOptions): { hit: boolean; geocode: boolean } {
  const iso = area.geocodes.filter((g) => /^TH-\d+$/i.test(g.value.trim()));
  if (iso.length > 0) {
    const hit = iso.some((g) => g.value.trim().toUpperCase() === CHIANG_MAI_GEOCODE);
    return { hit, geocode: hit };
  }
  return { hit: area.polygons.some((ring) => ring.some(([lon, lat]) => opts.inside(lon, lat))), geocode: false };
}

function ringTouchesBox(ring: LonLat[], box: SelectOptions["bbox"]): boolean {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const [lon, lat] of ring) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return west <= box.east && east >= box.west && south <= box.north && north >= box.south;
}

/** Latest of each references chain: anything another alert references is superseded. */
export function latestOfChains(alerts: CapAlert[]): CapAlert[] {
  const superseded = new Set(alerts.flatMap((a) => a.references.map(capBaseId)));
  return alerts.filter((a) => !superseded.has(capBaseId(a.identifier)));
}

function mergeLanguages(alerts: CapAlert[]): Map<string, CapAlert[]> {
  const byBase = new Map<string, CapAlert[]>();
  for (const a of alerts) {
    const key = capBaseId(a.identifier);
    byBase.set(key, [...(byBase.get(key) ?? []), a]);
  }
  return byBase;
}

const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

/** Alerts in force (or issued for later) for Chiang Mai, most severe first. */
export function selectChiangMaiAlerts(alerts: CapAlert[], opts: SelectOptions): OfficialAlert[] {
  const latest = latestOfChains(alerts);
  const out: OfficialAlert[] = [];
  for (const [identifier, docs] of mergeLanguages(latest)) {
    if (docs.some((d) => d.msgType.toLowerCase() === "cancel" || d.status.toLowerCase() !== "actual")) continue;
    const infos = docs.flatMap((d) => d.infos);
    if (infos.length === 0) continue;
    const expiresMs = Math.max(...infos.map((i) => ms(i.expires)).filter(Number.isFinite));
    if (Number.isFinite(expiresMs) && expiresMs < opts.now) continue;

    const areas = infos.flatMap((i) => i.areas);
    const hits = areas.map((a) => areaHitsProvince(a, opts));
    if (!hits.some((h) => h.hit)) continue;

    const th = infos.find(isThai) ?? null;
    const en = infos.find((i) => !isThai(i)) ?? null;
    const lead = en ?? th!;
    // Both language documents carry the same geometry; draw one copy.
    const geometrySource = (en ?? th!).areas;
    const areaDesc = (info: CapInfo | null) => (info ? info.areas.map((a) => a.areaDesc).filter(Boolean).join(" · ") || null : null);
    out.push({
      identifier,
      sent: docs[0].sent,
      effective: lead.effective,
      expires: lead.expires,
      event: lead.event,
      headline_th: th?.headline || null,
      headline_en: en?.headline || null,
      severity: lead.severity,
      urgency: lead.urgency,
      certainty: lead.certainty,
      instruction_th: th?.instruction || null,
      instruction_en: en?.instruction || null,
      web: th?.web ?? en?.web ?? null,
      areaDesc: areaDesc(th) ?? areaDesc(en) ?? "",
      areaDesc_th: areaDesc(th),
      areaDesc_en: areaDesc(en),
      geocodeMatch: hits.some((h) => h.geocode),
      polygons: geometrySource.flatMap((a) => a.polygons).filter((ring) => ringTouchesBox(ring, opts.bbox)),
    });
  }
  const rank: Record<CapSeverity, number> = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };
  return out.sort((a, b) => rank[b.severity] - rank[a.severity] || ms(b.sent) - ms(a.sent));
}
