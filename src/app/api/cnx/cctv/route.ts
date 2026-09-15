import { NextResponse } from "next/server";
import { fetchCnxCctv } from "../../../../lib/cnx/cctv";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await fetchCnxCctv();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=45, stale-while-revalidate=90" },
  });
}