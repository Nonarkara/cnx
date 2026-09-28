import { NextResponse } from "next/server";
import { fetchCnxCitizenReports } from "../../../../lib/cnx/citizen-reports";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Haze reports from public posts + local news, place-matched by the relay. */
export async function GET(): Promise<Response> {
  return NextResponse.json(await fetchCnxCitizenReports(), { headers: { "Cache-Control": "s-maxage=300" } });
}
