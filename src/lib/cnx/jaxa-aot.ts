// CNX — JAXA GCOM-C SGLI aerosol optical depth, resolved from a static
// STAC catalog on public Wasabi S3.
//
// Why this is not a map toggle
// ----------------------------
// JAXA publishes this as Cloud Optimized GeoTIFF on object storage, not
// through a WMTS endpoint. There is no `{z}/{x}/{y}.png`. The catalog is a
// tree of relative JSON links that has to be *walked* to reach a file:
//
//   collection.json
//     └── YYYY-MM/catalog.json
//           └── DD/catalog.json                  ← tiling level
//                 └── E000.00-E180.00/catalog.json
//                       └── S90.00-N90.00.json    ← Item, holds the real href
//                             └── …-AROT.tiff    ← the COG
//
// There is no STAC API behind it — `/search`, `/collections`, `/conformance`
// and `items.json` are all absent, and the bucket does not list. So there is
// no index to shortcut to and every path is derived from the date and the
// longitude band.
//
// The declaration that makes it safe to draw
// -----------------------------------------
// The Item's asset carries a `je:rasters` extension that states, in the file
// itself:
//
//   "dn":      {"data_type":"uint16","min":10.0,"max":50000.0,
//               "nodata":65535.0,"error":[65535.0]},
//   "dn2value":{"slope":9.999999747378752e-05,"offset":0.0}
//
// GCOM-C only retrieves where the sky is clear along the swath, so a scene
// over northern Thailand is *routinely* part-observation, part-blank during
// exactly the haze conditions this board exists to watch. 65535 is a
// declared no-observation value, not a threshold chosen here. That is the
// difference between a layer that can say "we could not see it" and one
// that renders a hole as clean air — the same failure as the story's
// "0% of bank-full", in new clothes.

export const JAXA_AOT_BASE =
  "https://s3.ap-northeast-1.wasabisys.com/je-pds/cog/v1/" +
  "JAXA.G-Portal_GCOM-C.SGLI_standard.L3-AROT.daytime.v3_global_daily";

/** As declared in the Item's `je:rasters.dn`. */
export const JAXA_AOT_NODATA = 65535;
export const JAXA_AOT_SCALE = 9.999999747378752e-05;
export const JAXA_AOT_OFFSET = 0.0;

export interface AotItem {
  /** Absolute URL of the COG, resolved against the Item's relative href. */
  cogUrl: string;
  /** Observation window this scene actually covers. */
  observedFrom: string | null;
  observedTo: string | null;
  nodata: number;
  scale: number;
  offset: number;
  /** Instrument metadata as published, for the attribution line. */
  platform: string | null;
  instrument: string | null;
  license: string | null;
}

/**
 * Level-0 band name for a longitude.
 *
 * The catalogue splits the globe into E000-E180 and W180-E000. Chiang Mai at
 * 98.98°E is in the eastern one. This is the only part of the path that is
 * not derivable from the date, which is why it is a function with a test
 * rather than a string constant.
 */
export function bandForLon(lon: number): string {
  return lon >= 0 ? "E000.00-E180.00" : "W180.00-E000.00";
}

/** `YYYY-MM-DD` → the five catalog hops, ending at the Item. */
export function itemPathFor(date: string, lon: number): string {
  const ym = date.slice(0, 7);
  const dd = date.slice(8, 10);
  return `${ym}/${dd}/0/${bandForLon(lon)}/S90.00-N90.00.json`;
}

/** A day the catalogue does not carry is a normal outcome, not an error. */
export interface AotResolution {
  item: AotItem | null;
  /** Human-readable why there is no item, in operator language. */
  reason: string | null;
}

export async function resolveAotItem(
  date: string,
  lon: number,
  fetchImpl: typeof fetch = fetch,
): Promise<AotResolution> {
  const url = `${JAXA_AOT_BASE}/${itemPathFor(date, lon)}`;
  let doc: Record<string, unknown>;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
    if (res.status === 404) {
      // No pass on that date. This is a real absence, and must be reported
      // as one — never rendered as zero, and never as a clear sky.
      return { item: null, reason: "no GCOM-C pass published for this date" };
    }
    if (!res.ok) return { item: null, reason: `catalogue answered HTTP ${res.status}` };
    doc = (await res.json()) as Record<string, unknown>;
  } catch (e) {
    return { item: null, reason: `catalogue unreachable: ${(e as Error).message}` };
  }

  const props = (doc.properties ?? {}) as Record<string, unknown>;
  const assets = (doc.assets ?? {}) as Record<string, { href?: string; "je:rasters"?: unknown }>;
  const asset = assets.AROT;
  const rawHref = asset?.href;
  if (!rawHref || rawHref === "N/A") {
    // The collection-level placeholder is "N/A"; only an Item carries a
    // real href. Reaching this means the walk stopped short, not that the
    // product is missing.
    return { item: null, reason: "item carries no resolved asset href" };
  }

  // hrefs are relative to the Item, which is why every flat shortcut 404s.
  const cogUrl = new URL(rawHref, url).toString();

  return {
    item: {
      cogUrl,
      observedFrom: (props.start_datetime as string) ?? null,
      observedTo: (props.end_datetime as string) ?? null,
      nodata: JAXA_AOT_NODATA,
      scale: JAXA_AOT_SCALE,
      offset: JAXA_AOT_OFFSET,
      platform: (props.platform as string) ?? null,
      instrument: (props.instrument as string) ?? null,
      license: (props.license as string) ?? null,
    },
    reason: null,
  };
}

// ── newest-scene resolution, the thing the wired route serves ──

export interface JaxaAotResponse {
  generatedAt: string;
  /** "live" = a resolved Item; "unavailable" = nothing resolvable. */
  provenance: "live" | "unavailable";
  item: AotItem | null;
  /** Why there is no item, in operator language. */
  reason: string | null;
  /** The date the walk asked for when it found the item. */
  resolvedFor: string | null;
  /** How far back from today the walk had to go. */
  walkedBackDays: number;
}

let cache: { at: number; data: JaxaAotResponse } | null = null;
const TTL_MS = 30 * 60_000; // 30 min — a daily catalogue needs no more

/**
 * The newest GCOM-C scene, walking back from today.
 *
 * GCOM-C publishes the daytime pass with a lag, so today's item is often
 * not up yet. Walking back is the difference between "no pass today" and
 * "no data at all" — reporting the first as the second is the FIRMS
 * header-only failure in new clothes.
 *
 * The walk is 10 days deep because the lag is at the MONTH BOUNDARY,
 * verified live 2 October 2026: `2026-10/catalog.json` answered 404 on
 * day 2 of the month while `2026-09-30` resolved — every date in an
 * unpublished month 404s regardless of recency, so the walk must be able
 * to cross into the previous month and keep going. Beyond 10 days the
 * answer is genuinely "absent", reported as absence.
 *
 * The 30 min TTL is also access-log citizenship: access is what generates
 * JAXA's text access log (the licence gate in docs/SOURCES.md §8), so the
 * route hits the catalogue at most once per TTL plus once per s-maxage
 * at the edge.
 */
export async function fetchLatestAotItem(
  lon: number,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<JaxaAotResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const generatedAt = now.toISOString();
  let lastReason: string | null = null;
  for (let daysAgo = 0; daysAgo <= 10; daysAgo += 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - daysAgo);
    const date = d.toISOString().slice(0, 10);
    const { item, reason } = await resolveAotItem(date, lon, fetchImpl);
    if (item) {
      const data: JaxaAotResponse = {
        generatedAt,
        provenance: "live",
        item,
        reason: null,
        resolvedFor: date,
        walkedBackDays: daysAgo,
      };
      cache = { at: Date.now(), data };
      return data;
    }
    lastReason = reason;
  }
  const data: JaxaAotResponse = {
    generatedAt,
    provenance: "unavailable",
    item: null,
    // An unreachable catalogue is not a clear fortnight; carry the walk's
    // own last words rather than flattening both states into one sentence.
    reason:
      lastReason === "no GCOM-C pass published for this date"
        ? "no GCOM-C pass published in the last 11 days"
        : lastReason,
    resolvedFor: null,
    walkedBackDays: 10,
  };
  cache = { at: Date.now(), data };
  return data;
}
