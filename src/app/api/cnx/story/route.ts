import { NextResponse } from "next/server";
import { buildCnxStory } from "../../../../lib/cnx/story";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scenarioId = url.searchParams.get("scenario");
  const data = await buildCnxStory(scenarioId);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=180, stale-while-revalidate=360" },
  });
}