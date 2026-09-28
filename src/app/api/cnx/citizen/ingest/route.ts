import { CITIZEN_KV_KEY, isCitizenPayload } from "../../../../../lib/cnx/citizen-reports";
import { ingestRelayJson } from "../../../../../lib/cnx/relay-kv";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Relay push (scripts/citizen-reports.mjs), authenticated with x-relay-secret. */
export async function POST(request: Request): Promise<Response> {
  return ingestRelayJson(request, CITIZEN_KV_KEY, isCitizenPayload, 3 * 24 * 60 * 60);
}
