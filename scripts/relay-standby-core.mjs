// One-shot off-Mac standby for the safety-critical ThaiWater feeds.
// No dependencies beyond Node 22 type stripping; no changes to verdict maths.
import { compactRainRow } from "../src/lib/cnx/rain-core.ts";

const SITE = "https://cnx.nonarkara.org";
const SOURCE = "https://api-v3.thaiwater.net/api/v1/thaiwater30";
const MAX_BYTES = 2_000_000;
const TAKEOVER_MS = 20 * 60_000;
const SKEW_MS = 5 * 60_000;
const FEEDS = ["rain", "river-level"];
const UA = "cnx-standby/1.0 (+https://cnx.nonarkara.org)";

/** Collection stamps, not gauge readings or the newest unrelated flight push. */
export function backupNeeded(manifest, id, now) {
  const age = now - Date.parse(manifest?.generatedAt);
  if (manifest?.schema !== "cnx-twin-manifest/1" || !Array.isArray(manifest?.relay?.feeds) || !Number.isFinite(age) || age < -SKEW_MS || age > 10 * 60_000) throw new Error("health manifest unavailable or stale");
  const feed = manifest.relay.feeds.find(feed => feed.id === id);
  if (!feed) throw new Error(`health manifest missing ${id}`);
  const elapsed = now - Date.parse(feed.generatedAt);
  return !Number.isFinite(elapsed) || elapsed < -SKEW_MS || elapsed > TAKEOVER_MS;
}

async function json(fetchImpl, url) {
  const res = await fetchImpl(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    redirect: "error", signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`source HTTP ${res.status}`);
  if (Number(res.headers.get("content-length")) > MAX_BYTES) throw new Error("source exceeds size limit");
  const reader = res.body?.getReader();
  if (!reader) throw new Error("source has no body");
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("source exceeds size limit");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function collect(id, fetchImpl, now) {
  // Stamp before collection: a racing newer Mac push wins the replay check.
  const generatedAt = new Date(now()).toISOString();
  if (id === "rain") {
    const source = await json(fetchImpl, `${SOURCE}/public/rain_24h?province_code=50`);
    const rows = (Array.isArray(source?.data) ? source.data : []).map(compactRainRow).filter(Boolean);
    if (!rows.length) throw new Error("source has no usable rain rows");
    return { generatedAt, rows };
  }
  const envelope = await json(fetchImpl, `${SOURCE}/public/waterlevel?province_code=50`);
  if (!Array.isArray(envelope?.data) || !envelope.data.length || envelope.data.length > 2000 || !envelope.data.every(row => row && typeof row === "object" && !Array.isArray(row))) throw new Error("source has no usable river envelope");
  let catalogueCount = null;
  try {
    const catalogue = await json(fetchImpl, `${SOURCE}/frontend/shared/tele_canal_station?province_code=50`);
    if (Array.isArray(catalogue?.data?.tele_waterlevel)) catalogueCount = catalogue.data.tele_waterlevel.length;
  } catch { /* Coverage context is optional; never substitute zero. */ }
  return { generatedAt, envelope, catalogueCount };
}

async function push(id, payload, secret, fetchImpl) {
  const res = await fetchImpl(`${SITE}/api/cnx/${id}/ingest`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/json", "X-Relay-Secret": secret },
    body: JSON.stringify(payload),
  });
  // A concurrent Mac push can win; never re-stamp and retry an older copy.
  if (res.status === 409) return "newer copy already held";
  if (!res.ok) throw new Error(`ingest HTTP ${res.status}`);
  return "pushed";
}

/** @param {{mode?: string, secret?: string, fetchImpl?: typeof fetch, now?: () => number, log?: (line: string) => void}} options */
export async function runStandby({ mode = "standby", secret = undefined, fetchImpl = fetch, now = Date.now, log = console.log }) {
  if (!["probe", "standby", "drill"].includes(mode)) throw new Error("invalid standby mode");
  const manifest = mode === "standby" ? await json(fetchImpl, `${SITE}/api/cnx/manifest.json`) : null;
  const needed = FEEDS.filter(id => mode !== "standby" || backupNeeded(manifest, id, now()));
  if (mode !== "probe" && needed.length && !secret) throw new Error("standby ingest secret missing");
  const failed = [];
  for (const id of needed) {
    try {
      const payload = await collect(id, fetchImpl, now);
      const count = id === "rain" ? payload.rows.length : payload.envelope.data.length;
      const result = mode === "probe" ? "upstream reachable (no write)" : await push(id, payload, secret, fetchImpl);
      log(`${id}: ${result}; ${count} rows`);
    } catch (error) {
      log(`${id}: FAILED (${error.message})`);
      failed.push(id);
    }
  }
  if (failed.length) throw new Error(`standby failed: ${failed.join(", ")}`);
  if (!needed.length) log("standby: primary feed copies fresh; no upstream reads or writes");
}
