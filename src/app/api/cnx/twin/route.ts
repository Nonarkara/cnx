import { NextResponse } from "next/server";
import { fetchCnxTwin } from "../../../../lib/cnx/twin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * CNX /api/twin — single province-level risk surface.
 *
 * Joins flood + air + fires + reservoir + forecast into one bilingual
 * verdict (TH/EN) with score/band/level, top reasons, and operational
 * checklist. Mirrors the FloodDash / AirDash /api/twin contract so
 * any other dashboard — or a future AirDash for CNX — can join on
 * province_code = "50" without re-ingesting the upstream feeds.
 *
 * Honest data: the verdict carries `data_provenance` (`live` |
 * `scenario` | `mixed`) so the wall can't quietly present scenario
 * numbers as ground truth. The disclaimers name DDPM 1784 + PCD 1650
 * + DDC 1422 + EMS 1669 — official hotlines remain the source of
 * authoritative action.
 */
export async function GET(): Promise<Response> {
  const data = await fetchCnxTwin();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" },
  });
}
