import { NextResponse } from "next/server";
import { fetchRiverLevel } from "../../../../lib/cnx/river-level";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await fetchRiverLevel();
  return NextResponse.json(data, {
    // Matches the module's own 10-minute TTL. The gauge observations
    // inside carry their own `observedAt`, which is what the panel ages
    // — this header only governs how long the envelope may be reused.
    headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" },
  });
}
