import { RAIN_KV_KEY, isRainPayload } from "../../../../../lib/cnx/rain";
import { ingestRelayJson } from "../../../../../lib/cnx/relay-kv";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Relay push (scripts/rain-relay.mjs), authenticated with x-relay-secret. */
export async function POST(request: Request): Promise<Response> {
  return ingestRelayJson(request, RAIN_KV_KEY, isRainPayload, 6 * 60 * 60);
}
