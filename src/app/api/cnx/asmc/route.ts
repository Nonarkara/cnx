import { NextResponse } from "next/server";
import { fetchCnxAsmc } from "../../../../lib/cnx/asmc";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * CNX /api/cnx/asmc — ASEAN Specialized Meteorological Centre
 * transboundary haze assessment.
 *
 * Covers Myanmar / Laos / Thailand / Cambodia / Vietnam regional
 * hotspots + 24 h PM10 dispersion + wind analysis at 925 hPa.
 * Haze is transboundary — Chiang Mai's worst days are fed by fires
 * upstream, not domestic burning — so the regional read matters more
 * than the FIRMS-CNX-bbox-only count.
 *
 * No public ASMC API host is known yet; with a working ASMC_BASE + key it
 * returns live assessment + regional counts, otherwise empty + provenance="needs-key"
 * + a setup note — never fabricated regional hotspot counts.
 *
 * Cache: 30 min in-process.
 */
async function handle(): Promise<Response> {
  const data = await fetchCnxAsmc();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" },
  });
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle());
}
