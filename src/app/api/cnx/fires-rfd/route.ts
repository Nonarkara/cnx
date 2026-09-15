import { NextResponse } from "next/server";
import { fetchCnxRfdFires } from "../../../../lib/cnx/fire-rfd";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await fetchCnxRfdFires();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1800" },
  });
}