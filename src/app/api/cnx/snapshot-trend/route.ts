import { NextResponse } from "next/server";
import { summariseRecentDays } from "../../../../lib/cnx/snapshot-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedDays = Number(url.searchParams.get("days") ?? "7");
  if (!Number.isFinite(requestedDays)) {
    return NextResponse.json({ error: "days must be a finite number" }, { status: 400 });
  }
  const days = Math.min(90, Math.max(1, Math.floor(requestedDays)));
  const data = await summariseRecentDays(days);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" },
  });
}