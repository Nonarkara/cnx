import { HAZE_VISION_KV_KEY, isHazeVisionPayload } from "../../../../../lib/cnx/haze-vision";
import { ingestRelayJson } from "../../../../../lib/cnx/relay-kv";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Relay push (scripts/haze-vision.mjs), authenticated with x-relay-secret. */
export async function POST(request: Request): Promise<Response> {
  return ingestRelayJson(request, HAZE_VISION_KV_KEY, isHazeVisionPayload, 24 * 60 * 60);
}
