import { WATER_VISION_KV_KEY, isWaterVisionPayload } from "../../../../../lib/cnx/water-vision";
import { ingestRelayJson } from "../../../../../lib/cnx/relay-kv";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request): Promise<Response> {
  return ingestRelayJson(request, WATER_VISION_KV_KEY, isWaterVisionPayload, 24 * 60 * 60);
}
