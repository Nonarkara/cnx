// CNX — public CCTV in the Chiang Mai basin, via the Maholan flood wall.
//
// WHAT THIS IS
// ------------
// `cctv.maholan.net` is a community-operated wall that aggregates public
// flood and road cameras across Thailand and re-publishes them as JSON.
// Probed directly 2026-10-01 and re-probed 2026-10-02: the catalogue is
// 2,355 cameras, keyless, and every entry carries `lat`/`lng`, a `live`
// flag, and — importantly — the `source` agency that owns the camera.
// Nine sit inside the CNX bbox, six of them live, most from the Royal
// Department of Highways (กรมทางหลวง).
//
// The value to a war room is not the video. It is the LOCATION: a marked
// map of which public cameras are currently answering, owned by a named
// agency, at the road crossings that decide a flood detour. That is a
// road-and-river question, and it is answerable from metadata alone.
//
// THREE DELIBERATE RESTRICTIONS
// -----------------------------
// 1. NO VIDEO IS PROXIED. The wall's own source comments record it
//    fighting ~300 Mbps of origin uplink because Cloudflare does not
//    edge-cache its snapshots. A second consumer pulling HLS would add
//    load to a volunteer server for no gain: we need the map, not the
//    frames. Video stays at the source; we link, we do not mirror.
//
// 2. THE CATALOGUE IS POLLED SLOWLY. `/api/cameras` is ~906 KB and takes
//    no filter parameters (bbox/region/q are all ignored or rejected),
//    so the whole thing comes down and is filtered here. At a 15-minute
//    TTL that is ~87 MB/day against a community host, which is a
//    reasonable thing to cost. The cost of that choice is that the
//    `live` flag is at most 15 minutes old — so the response carries
//    `cataloguedAt` and the panel ages it. A camera shown as live is
//    live *as of the stamp*, and the stamp says how long ago that was.
//
// 3. THE `live` FLAG IS THE UPSTREAM'S, NOT OURS. It is passed through
//    unchanged and is never inferred from a snapshot succeeding. A
//    camera the wall cannot reach is `live: false` here too, and the
//    note says so in the same breath as the count that are working.
//    Absence of a camera is never evidence that a road is clear.

const CATALOGUE = "https://cctv.maholan.net/api/cameras";

/** Chiang Mai operating area. Mirrors the province bbox used elsewhere. */
const BBOX = { south: 18.4, west: 98.2, north: 19.2, east: 99.4 } as const;

/** See restriction 2. The catalogue is large and the host is a volunteer. */
export const CATALOGUE_TTL_MS = 15 * 60_000;

export type CameraStreamType = "hls" | "mjpeg" | "snapshot" | "unknown";

export interface FloodCamera {
  id: string;
  /** Thai name as published. */
  name: string;
  /** Thai province/region as published, when present. */
  region: string | null;
  /** The agency that owns this camera. Never dropped — attribution is
   *  the whole reason to use an aggregator rather than a guess. */
  source: string;
  sourceUrl: string | null;
  latitude: number;
  longitude: number;
  type: CameraStreamType;
  /** The wall's own liveness flag, passed through. */
  live: boolean;
}

export interface FloodCamerasResponse {
  /** When this module produced the answer. NOT the observation time. */
  generatedAt: string;
  /** When the upstream catalogue was last read — the observation time,
   *  and what the panel must age. */
  cataloguedAt: string;
  provenance: "live" | "unavailable";
  cameras: FloodCamera[];
  liveCount: number;
  /** Built from the cameras actually shown. */
  note: string;
  /** Attribution block, rendered verbatim wherever the cameras appear. */
  credit: FloodCameraCredit;
  /** Intended-use / terms statement. Rendered verbatim alongside credit. */
  legal: FloodCameraLegal;
}

export interface FloodCameraCredit {
  aggregator: string;
  aggregatorUrl: string;
  agencies: string[];
}

export interface FloodCameraLegal {
  intendedUse: string;
  terms: string;
}

const CREDIT: FloodCameraCredit = {
  aggregator: "Maholan Flood CCTV Wall (cctv.maholan.net)",
  aggregatorUrl: "https://cctv.maholan.net",
  agencies: [],
};

/**
 * Stated as intended use and terms-as-published, NOT as a licence we
 * hold. The wall publishes no API terms, so there is nothing to cite and
 * nothing to claim; what we can honestly put on a public page is what we
 * do with the data and what the rights holder is. Claiming a legal
 * status the source has not granted would be exactly the kind of
 * sentence this board refuses to publish about anything else.
 */
const LEGAL: FloodCameraLegal = {
  intendedUse:
    "Public-goods situational awareness for haze and flood response in Chiang Mai province. Camera positions and liveness are read to help the province decide road openings, flood detours and air-quality field checks. No video is mirrored, recorded, stored or redistributed by this board; the panel links to the source. Nothing here is sold, and nothing here is used to identify or track any person.",
  terms:
    "Camera streams remain the property of the agencies that operate them, as credited per camera. The aggregator publishes no formal API terms; this integration is keyless, rate-limited to one catalogue read per 15 minutes, and limited to the Chiang Mai operating area. Any reuse beyond public-goods situational awareness should be agreed with the aggregator and the named agencies first.",
};

function withinBbox(lat: number, lng: number): boolean {
  return lat >= BBOX.south && lat <= BBOX.north && lng >= BBOX.west && lng <= BBOX.east;
}

function streamType(v: unknown): CameraStreamType {
  return v === "hls" || v === "mjpeg" || v === "snapshot" ? v : "unknown";
}

interface RawCamera {
  id?: unknown;
  name?: unknown;
  region?: unknown;
  source?: unknown;
  sourceUrl?: unknown;
  district?: unknown;
  lat?: unknown;
  lng?: unknown;
  type?: unknown;
  live?: unknown;
}

/**
 * Pure filter + normalise, so the bbox and the attribution contract are
 * testable without a network. Returns only what we will actually show.
 */
export function selectCnxCameras(raw: RawCamera[]): FloodCamera[] {
  const out: FloodCamera[] = [];
  for (const c of raw) {
    const lat = typeof c.lat === "number" ? c.lat : null;
    const lng = typeof c.lng === "number" ? c.lng : null;
    if (lat === null || lng === null) continue;
    if (!withinBbox(lat, lng)) continue;
    const id = typeof c.id === "string" && c.id ? c.id : null;
    if (!id) continue;
    out.push({
      id,
      name: typeof c.name === "string" ? c.name : id,
      region: typeof c.region === "string" ? c.region : null,
      // An unstated owner is labelled, not dropped: the position is the
      // operational value here, and losing a real camera because its
      // owner line is blank costs more than it saves. What must never
      // happen is showing it as though it were creditable — hence the
      // explicit "not stated" rather than an empty string that would
      // read as an omitted field.
      source: typeof c.source === "string" && c.source.trim() ? c.source : "ไม่ระบุ (not stated)",
      sourceUrl: typeof c.sourceUrl === "string" ? c.sourceUrl : null,
      latitude: lat,
      longitude: lng,
      type: streamType(c.type),
      live: c.live === true,
    });
  }
  return out.sort((a, b) => Number(b.live) - Number(a.live) || a.id.localeCompare(b.id));
}

/** Credit block, with the agencies actually on screen. */
export function cameraCredit(cameras: FloodCamera[]): FloodCameraCredit {
  const agencies = [...new Set(cameras.map((c) => c.source))].sort();
  return { ...CREDIT, agencies };
}

/**
 * Computed from the cameras actually shown, not written as a fixed
 * string — same rule as `floodHubNote`. A count that is right for the
 * province and wrong for the screen is the "most are unverified" class
 * of hedge, and a hedge that errs toward comfort is worse than none.
 */
export function camerasNote(cameras: FloodCamera[]): string {
  const total = cameras.length;
  if (total === 0) {
    return (
      "No public cameras in the Chiang Mai operating area are listed by the source. " +
      "That is an absence of coverage, not a report that the roads are clear."
    );
  }
  const live = cameras.filter((c) => c.live).length;
  const dead = total - live;
  const hls = cameras.filter((c) => c.type === "hls").length;
  return (
    `${live} of ${total} listed public cameras in the Chiang Mai area are reporting live` +
    (hls > 0 ? ` (${hls} of them continuous video)` : "") +
    (dead > 0
      ? `; ${dead} are known offline and are shown as such, not omitted.`
      : `; none are currently offline.`) +
    " Positions and liveness come from the aggregator and are as of the catalogue stamp. " +
    "A camera that is not answering says nothing about the water on that road, and video stays with the source agency."
  );
}

function unavailable(reason: string): FloodCamerasResponse {
  return {
    generatedAt: new Date().toISOString(),
    cataloguedAt: "",
    provenance: "unavailable",
    cameras: [],
    liveCount: 0,
    note: `${reason} ${camerasNote([])}`,
    credit: { ...CREDIT, agencies: [] },
    legal: LEGAL,
  };
}

let cache: { at: number; data: FloodCamerasResponse } | null = null;

/** Test seam. The cache is module-level so the 15-minute TTL survives
 *  across requests in a warm isolate; tests need to step past it. */
export function resetFloodCameraCache(): void {
  cache = null;
}

export async function fetchCnxFloodCameras(fetchImpl: typeof fetch = fetch): Promise<FloodCamerasResponse> {
  if (cache && Date.now() - cache.at < CATALOGUE_TTL_MS) return cache.data;
  try {
    const res = await fetchImpl(CATALOGUE, {
      headers: { "User-Agent": "cnx-dashboard/1.0 (+https://cnx.nonarkara.org)", Accept: "application/json" },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return unavailable(`The camera catalogue answered HTTP ${res.status}.`);
    const body = (await res.json()) as { cameras?: RawCamera[] } | RawCamera[];
    const raw = Array.isArray(body) ? body : (body.cameras ?? []);
    const cameras = selectCnxCameras(raw);
    // An empty list is a real answer — the source is up and says it has
    // nothing here — so it stays `live` with zero cameras and a note
    // that names it as absent coverage. Only a failure is `unavailable`.
    const cataloguedAt = new Date().toISOString();
    const data: FloodCamerasResponse = {
      generatedAt: cataloguedAt,
      cataloguedAt,
      provenance: "live",
      cameras,
      liveCount: cameras.filter((c) => c.live).length,
      note: camerasNote(cameras),
      credit: cameraCredit(cameras),
      legal: LEGAL,
    };
    cache = { at: Date.now(), data };
    return data;
  } catch (e) {
    return unavailable(`The camera catalogue request failed: ${(e as Error).message}.`);
  }
}
