import { DAM_KV_KEY, isDamPayload } from "../../../../../lib/cnx/dam";
import { ingestRelayJson } from "../../../../../lib/cnx/relay-kv";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Relay push (scripts/dam-relay.mjs), authenticated with x-relay-secret. */
export async function POST(request: Request): Promise<Response> {
  return ingestRelayJson(request, DAM_KV_KEY, isDamPayload, 12 * 60 * 60);
}
