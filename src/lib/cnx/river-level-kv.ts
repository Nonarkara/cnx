// Shared plumbing for the measured river-level feed's relay tier, the
// same shape as flights-kv.ts: the off-Cloudflare relay
// (scripts/relay-flights.mjs) reads ThaiWater from a residential IP —
// where the shared-egress 429 does not apply — and pushes the RAW
// envelope into CNX_FLIGHTS_KV. The projection and severity maths run
// at the edge, in the same pure functions the direct path uses, so a
// relay cannot push numbers that bypass the documented bank-geometry
// methodology.

import { isIsoDate, isNum, isObj, isStr } from "./relay-kv";

export const RIVER_LEVEL_KV_KEY = "river-level-latest";

/** The relay pushes every ~10 min; copies older than this fall back to
 *  the direct read — which rate-limits (429) from Cloudflare's shared
 *  egress, see river-level.ts. 45 min is three poll intervals: fresh
 *  enough that the per-gauge observedAt ages are still meaningful. */
export const RIVER_LEVEL_KV_STALE_MS = 45 * 60_000;

/**
 * What the relay pushes: the RAW ThaiWater envelope plus the province's
 * telemetry catalogue count. Deliberately raw — the gauge projection,
 * severity bands and note are computed at the edge from this envelope,
 * so the trust boundary matches the flights relay's: the estimate maths
 * is never done on the untrusted side.
 */
export interface RiverLevelRelayPayload {
  /** When the relay pulled, ISO-8601 UTC. Governs staleness. */
  generatedAt: string;
  /** The raw /public/waterlevel response, unmodified. */
  envelope: { result?: string; data?: unknown[] };
  /** Province-wide telemetry catalogue count, or null when unread. */
  catalogueCount: number | null;
}

/**
 * Validates untrusted JSON from the relay ingest endpoint before it is
 * stored in KV. Row shape is checked loosely — every entry must be an
 * object — because the projection (projectGauge) coerces every field
 * and skips what it cannot use; a compromised relay pushing garbage
 * rows surfaces as the skipped count, never as a crash or a fabricated
 * gauge.
 */
export function isRiverLevelRelayPayload(v: unknown): v is RiverLevelRelayPayload {
  if (!isObj(v)) return false;
  if (!isIsoDate(v.generatedAt)) return false;
  const env = v.envelope;
  if (!isObj(env)) return false;
  if (env.result !== undefined && !isStr(env.result, 40)) return false;
  // 627 stations in the catalogue; 46 rows in the feed. 2,000 is generous.
  if (!Array.isArray(env.data) || env.data.length > 2_000) return false;
  if (!env.data.every((r) => isObj(r))) return false;
  if (v.catalogueCount !== null && !isNum(v.catalogueCount)) return false;
  return true;
}
