import { fetchCnxYoutube } from "../../../../lib/cnx/youtube";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// One KV read, no YouTube API calls. Do not cache a computed age state beyond
// its 48h limit or allow caller query strings to initiate expensive searches.
export async function GET(_request: Request): Promise<Response> {
  return Response.json(await fetchCnxYoutube(), { headers: { "Cache-Control": "private, no-store" } });
}
