import { NextResponse } from "next/server";
import { fetchCnxOpenDataIndex } from "../../../../lib/cnx/open-data-th";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await fetchCnxOpenDataIndex();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=1800" },
  });
}