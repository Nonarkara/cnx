import { NextResponse } from "next/server";
import { cnxKv } from "../../../../lib/cnx/relay-kv";
import { logKey, logMonth, parseLogMonth, parseLogRows, WARNING_LOG_CAP } from "../../../../lib/cnx/warning-log-core";
import { edgeCached } from "../../../../lib/edge-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE = { "Cache-Control": "s-maxage=60" };
const NOTE =
  "What the board said and when: one row per change of the province verdict level, and per outlook district entering, changing level within, or leaving ≥ watch. Written on change only; months on Chiang Mai time; the newest 2,000 rows a month are kept for 400 days. No personal data.";

/** Warning log for verification (docs/DIGITAL-TWIN-STANDARDS.md item 8). `?month=YYYY-MM`, default this month. */
async function handle(request: Request): Promise<Response> {
  const asked = new URL(request.url).searchParams.get("month");
  const month = asked === null ? logMonth(Date.now()) : parseLogMonth(asked);
  if (!month) return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400, headers: CACHE });
  const kv = await cnxKv().catch(() => null);
  if (!kv) {
    return NextResponse.json(
      { month, provenance: "unavailable", rows: [], count: 0, cap: WARNING_LOG_CAP, note: "The log store is not reachable — this is not an empty log." },
      { headers: CACHE },
    );
  }
  const rows = parseLogRows(await kv.get(logKey(month)));
  return NextResponse.json(
    { month, provenance: "live", generatedAt: new Date().toISOString(), rows, count: rows.length, cap: WARNING_LOG_CAP, note: NOTE },
    { headers: CACHE },
  );
}

/** Served through the shared edge cache for the route's own s-maxage (src/lib/edge-cache.ts). */
export async function GET(request: Request): Promise<Response> {
  return edgeCached(request, () => handle(request), ["month"]);
}
