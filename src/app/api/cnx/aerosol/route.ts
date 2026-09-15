import { NextResponse } from "next/server";
import { fetchCnxAerosol } from "../../../../lib/cnx/aerosol";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await fetchCnxAerosol();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1800" },
  });
}