import { ingestRelayJson } from "../../../../../lib/cnx/relay-kv";
import { isYoutubePayload, YOUTUBE_KV_KEY, YOUTUBE_MAX_AGE_MS } from "../../../../../lib/cnx/youtube";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request): Promise<Response> {
  return ingestRelayJson(request, YOUTUBE_KV_KEY, isYoutubePayload, YOUTUBE_MAX_AGE_MS / 1000);
}
