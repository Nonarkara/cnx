import { RIVER_LEVEL_KV_KEY, isRiverLevelRelayPayload } from "../../../../../lib/cnx/river-level-kv";
import { ingestRelayJson } from "../../../../../lib/cnx/relay-kv";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Receives the raw ThaiWater waterlevel envelope from the off-Cloudflare
 * relay (scripts/relay-flights.mjs, same process and secret as the
 * flights push) — the edge gets 429 from api-v3.thaiwater.net because
 * the rate limit is per source IP and Cloudflare's egress is shared, see
 * lib/cnx/river-level.ts. The envelope is stored raw; the projection,
 * severity bands and note are computed at the edge in the same pure
 * functions the direct path uses, so a relay cannot push numbers that
 * bypass the documented bank-geometry methodology.
 */
export async function POST(request: Request): Promise<Response> {
  // 6 h TTL: generous on purpose. Freshness is governed by the 45 min
  // staleness check on read; this only cleans up a dead relay's entry.
  return ingestRelayJson(request, RIVER_LEVEL_KV_KEY, isRiverLevelRelayPayload, 6 * 60 * 60);
}
