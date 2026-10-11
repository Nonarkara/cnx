// TMD official warnings for Chiang Mai — fetcher for /api/cnx/official-warnings.
//
// Official forecasts take precedence over the board's own (EW4All Pillar 2),
// so this feed leads the watch board. Parsing and selection live in
// tmd-cap-core.ts (pure, import-free); this file only does I/O and caching.
//
// Read path, per refresh:
//   1. Both RSS indexes (Thai and English), in parallel.
//   2. Up to MAX_DOCUMENTS CAP documents from the English index (the Thai
//      index when the English one fails). Both languages carry the same
//      references, areas and geocodes, so one language is enough to decide
//      which alerts are in force for Chiang Mai.
//   3. The other-language document of each selected alert only (usually
//      zero to two), for the Thai or English headline and instruction.
//
// "No alert" is only claimed when every listed document was read. If some
// could not be read and none of the rest covers Chiang Mai, the feed is
// reported unavailable: an unread document may be the warning.
//
// Caching follows ThaiWater (river-level.ts): 10 min on success, 30 min on
// failure, so a refusing upstream is not hammered and the row cannot flap.
//
// Relay fallback (not built — tmd.go.th answered a direct read on
// 2026-10-11 from a residential IP; whether it answers Cloudflare's shared
// egress is only known once deployed): if production shows HTTP 403/429
// here, add scripts/tmd-cap-relay.mjs that imports tmd-cap-core.ts (exact
// .ts path, as dam-relay.mjs does), runs fetch+select on the relay host,
// and POSTs the OfficialWarningsResponse to an /ingest route into KV; then
// read that copy first via readRelayJson, exactly as fetchRiverLevel does.

import { CNX_PROVINCE_RING, inChiangMaiProvince } from "./province-boundary";
import {
  parseCapAlert,
  parseCapRss,
  rssItemBaseId,
  selectChiangMaiAlerts,
  TMD_CAP_SOURCE,
  type CapAlert,
  type CapRssItem,
  type OfficialWarningsResponse,
} from "./tmd-cap-core";

export const TMD_CAP_INDEX = {
  th: "https://www.tmd.go.th/api/xml/CAP",
  en: "https://www.tmd.go.th/en/api/xml/CAP",
} as const;

const MAX_DOCUMENTS = 20;
const INDEX_TIMEOUT_MS = 10_000;
const DOCUMENT_TIMEOUT_MS = 12_000;
const SUCCESS_TTL_MS = 10 * 60_000;
const FAILURE_TTL_MS = 30 * 60_000;
const UA = "cnx-dashboard/1.0 (+https://cnx.nonarkara.org)";

const PROVINCE_BBOX = (() => {
  const lons = CNX_PROVINCE_RING.map(([lon]) => lon);
  const lats = CNX_PROVINCE_RING.map(([, lat]) => lat);
  return { west: Math.min(...lons), east: Math.max(...lons), south: Math.min(...lats), north: Math.max(...lats) };
})();

type Read = { ok: true; text: string } | { ok: false; error: string };

async function readText(url: string, timeoutMs: number): Promise<Read> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/xml, text/xml, application/rss+xml", "User-Agent": UA },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, text: await res.text() };
  } catch (e) {
    return { ok: false, error: (e as Error).name === "TimeoutError" ? "timed out" : (e as Error).message };
  }
}

async function readIndex(url: string): Promise<{ items: CapRssItem[] } | { error: string }> {
  const r = await readText(url, INDEX_TIMEOUT_MS);
  if (!r.ok) return { error: r.error };
  return { items: parseCapRss(r.text, MAX_DOCUMENTS) };
}

async function readAlerts(items: CapRssItem[]): Promise<{ alerts: CapAlert[]; failed: number }> {
  const docs = await Promise.all(items.map((item) => readText(item.link, DOCUMENT_TIMEOUT_MS)));
  const alerts = docs.flatMap((d) => (d.ok ? [parseCapAlert(d.text)].filter((a): a is CapAlert => a !== null) : []));
  return { alerts, failed: items.length - alerts.length };
}

function unavailable(reason: string, reasonTh: string, listed = 0, read = 0): OfficialWarningsResponse {
  return { provenance: "unavailable", fetchedAt: new Date().toISOString(), alerts: [], reason, reason_th: reasonTh, documentsRead: read, documentsListed: listed, source: TMD_CAP_SOURCE };
}

/** One full read of the feed, uncached. Exported for tests. */
export async function readOfficialWarnings(now = Date.now()): Promise<OfficialWarningsResponse> {
  const [th, en] = await Promise.all([readIndex(TMD_CAP_INDEX.th), readIndex(TMD_CAP_INDEX.en)]);
  const usingEnglish = "items" in en;
  const primary = usingEnglish ? en.items : "items" in th ? th.items : null;
  if (!primary) {
    const why = (x: typeof th) => ("error" in x ? x.error : "ok");
    return unavailable(
      `TMD CAP index unreachable (Thai: ${why(th)}; English: ${why(en)})`,
      `เข้าถึงดัชนีประกาศ CAP ของกรมอุตุนิยมวิทยาไม่ได้ (ไทย: ${why(th)}; อังกฤษ: ${why(en)})`,
    );
  }
  const other = usingEnglish && "items" in th ? th.items : [];

  const { alerts, failed } = await readAlerts(primary);
  if (primary.length > 0 && alerts.length === 0) {
    return unavailable(
      `TMD listed ${primary.length} CAP documents but none could be read`,
      `กรมอุตุฯ แสดงประกาศ ${primary.length} ฉบับ แต่อ่านไม่ได้เลย`,
      primary.length,
    );
  }

  const opts = { now, inside: inChiangMaiProvince, bbox: PROVINCE_BBOX };
  const first = selectChiangMaiAlerts(alerts, opts);
  if (failed > 0 && first.length === 0) {
    return unavailable(
      `read ${alerts.length} of ${primary.length} TMD CAP documents; an unread one may be a Chiang Mai warning`,
      `อ่านประกาศ CAP ได้ ${alerts.length} จาก ${primary.length} ฉบับ — ฉบับที่อ่านไม่ได้อาจเป็นประกาศสำหรับเชียงใหม่`,
      primary.length,
      alerts.length,
    );
  }

  // Other-language documents for the selected alerts only.
  const wanted = new Set(first.map((a) => a.identifier));
  const counterpart = await readAlerts(other.filter((item) => wanted.has(rssItemBaseId(item) ?? "")));
  const selected = counterpart.alerts.length ? selectChiangMaiAlerts([...alerts, ...counterpart.alerts], opts) : first;

  return {
    provenance: "live",
    fetchedAt: new Date(now).toISOString(),
    alerts: selected,
    reason: failed > 0 ? `read ${alerts.length} of ${primary.length} TMD CAP documents` : null,
    reason_th: failed > 0 ? `อ่านประกาศ CAP ได้ ${alerts.length} จาก ${primary.length} ฉบับ` : null,
    documentsRead: alerts.length,
    documentsListed: primary.length,
    source: TMD_CAP_SOURCE,
  };
}

let cache: { at: number; value: OfficialWarningsResponse } | null = null;

/** Test seam. */
export function resetOfficialWarningsCache(): void {
  cache = null;
}

export async function fetchOfficialWarnings(): Promise<OfficialWarningsResponse> {
  const now = Date.now();
  if (cache) {
    const ttl = cache.value.provenance === "live" ? SUCCESS_TTL_MS : FAILURE_TTL_MS;
    if (now - cache.at < ttl) return cache.value;
  }
  const value = await readOfficialWarnings(now).catch((e: unknown) =>
    unavailable(`TMD CAP read failed: ${(e as Error).message}`, `อ่านประกาศ CAP ของกรมอุตุฯ ไม่สำเร็จ: ${(e as Error).message}`),
  );
  cache = { at: now, value };
  return value;
}
