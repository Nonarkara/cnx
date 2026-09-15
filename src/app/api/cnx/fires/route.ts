import { NextResponse } from "next/server";
import { fetchCnxFires } from "../../../../lib/cnx/fires";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await fetchCnxFires();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=900" },
  });
}