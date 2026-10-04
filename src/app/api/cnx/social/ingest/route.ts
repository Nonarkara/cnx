import { ingestRelayJson } from "../../../../../lib/cnx/relay-kv";
import { isSocialRssPayload } from "../../../../../lib/cnx/social";
import { SOCIAL_RSS_KV_KEY } from "../../../../../lib/cnx/social-feeds";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Relay push (scripts/social-relay.mjs): raw Google News RSS the Worker cannot fetch itself. */
export async function POST(request: Request): Promise<Response> {
  return ingestRelayJson(request, SOCIAL_RSS_KV_KEY, isSocialRssPayload, 6 * 60 * 60);
}
