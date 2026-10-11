import { NextResponse } from "next/server";
import { buildManifest } from "../../../../lib/cnx/twin-manifest";
import { probeAll } from "../../../../lib/cnx/twin-manifest-live";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The machine-readable twin manifest: every feed CNX is built from, its
 * declared cadence and freshness SLO, and whether it is on time right now.
 * Live fields come from cached module reads and relay KV stamps, never a
 * fresh fan-out to every upstream (src/lib/cnx/twin-manifest-live.ts).
 */
async function handle(): Promise<Response> {
  const readings = await probeAll();
  const manifest = buildManifest(readings, {
    nowMs: Date.now(),
    version: process.env.NEXT_PUBLIC_APP_VERSION || "unknown",
    commit: process.env.NEXT_PUBLIC_GIT_SHA || "unknown",
  });
  return NextResponse.json(manifest, { headers: { "Cache-Control": "s-maxage=120" } });
}

/** Served through the shared edge cache for two minutes (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle());
}
