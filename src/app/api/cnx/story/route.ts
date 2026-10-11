import { NextResponse } from "next/server";
import { buildCnxStory } from "../../../../lib/cnx/story";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // A themed headline on demand would let anyone make the official domain
  // print "Rain and river watch" over calm data. Only a deployment that sets
  // CNX_DEMO_MODE=1 honours ?scenario=; production derives it from the data.
  const scenarioId = process.env.CNX_DEMO_MODE === "1" ? url.searchParams.get("scenario") : null;
  const data = await buildCnxStory(scenarioId);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=180, stale-while-revalidate=360" },
  });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle(request), process.env.CNX_DEMO_MODE === "1" ? ["scenario"] : []);
}
