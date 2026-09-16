import { NextResponse } from "next/server";
import { fetchCnxGistdaPm25, fetchCnxCnAqi } from "../../../../lib/cnx/gistda-pm25";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const [pm25, cn] = await Promise.all([fetchCnxGistdaPm25(), fetchCnxCnAqi()]);
  return NextResponse.json(
    { pm25, cnAqi: cn },
    {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=1200" },
    },
  );
}