import { NextResponse } from "next/server";
import { fetchCnxArrivals } from "../../../../lib/cnx/arrivals";
import { appendArrivalsSnapshot } from "../../../../lib/cnx/arrivals-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await fetchCnxArrivals();
  // Persist each computed day for the long-term archive — best-effort,
  // never blocks the response.
  void Promise.all(data.days.map((d) => appendArrivalsSnapshot(d))).catch(() => {});
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=3600" },
  });
}
