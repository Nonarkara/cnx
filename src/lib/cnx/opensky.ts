// OpenSky Network client — anonymous access, bbox query for the CNX area.
//
// The anonymous tier gives 400 credits/day. Each /states/all call costs
// 4 credits and each /aircraft lookup costs 1 credit. We poll states
// every 60s, so a single in-memory cache per process keeps us well
// under the daily budget. Aircraft metadata (the typecode that drives
// the size bucket) is cached forever — it never changes for a given
// icao24 — so the aircraft lookup happens at most once per plane.
//
// The bbox below is wider than Chiang Mai's city limits: it covers the
// approach corridors from Bangkok (south), Chiang Rai (north), the
// Myanmar and Laos borders (west/east). Most of the action is 20-50
// km around CNX airport, but a plane on final from the south starts
// showing up 150 km out.

import { fetchAdsbLolStates } from "./adsb-lol";

export const OPENSKY_BASE = "https://opensky-network.org/api";

/** Chiang Mai area bbox (lamin, lomin, lamax, lomax). */
export const CNX_BBOX = {
  lamin: 17.5,
  lomin: 97.5,
  lamax: 20.5,
  lomax: 100.5,
} as const;

/** OpenSky state array indices — same for all anonymous-tier responses. */
const IDX = {
  icao24: 0,
  callsign: 1,
  originCountry: 2,
  timePosition: 3,
  lastContact: 4,
  longitude: 5,
  latitude: 6,
  baroAltitude: 7,
  onGround: 8,
  velocity: 9,
  trueTrack: 10,
  verticalRate: 11,
  geoAltitude: 12,
  squawk: 13,
  spi: 14,
  positionSource: 15,
} as const;

export interface FlightState {
  icao24: string;
  callsign: string;
  originCountry: string;
  /** ms since epoch */
  timePosition: number | null;
  /** ms since epoch */
  lastContact: number;
  longitude: number | null;
  latitude: number | null;
  /** metres above sea level, or null if unknown */
  baroAltitude: number | null;
  /** metres above ground, or null if unknown */
  geoAltitude: number | null;
  onGround: boolean;
  /** m/s */
  velocity: number | null;
  /** degrees from north, clockwise */
  trueTrack: number | null;
  /** m/s, +ve climbing, -ve descending */
  verticalRate: number | null;
  /** 0–4 (low confidence to high), -1 if unknown. 1+ is ADS-B. */
  positionSource: number;
  /** ICAO type designator, when the source provides it inline (adsb.lol). */
  typecode?: string;
  registration?: string;
}

export interface FetchResult {
  /** ms since epoch — when OpenSky generated this snapshot. */
  fetchedAt: number;
  /** ms since epoch — when our server fetched it (may be later if cached). */
  observedAt: number;
  /** All airborne flights inside the bbox. */
  airborne: FlightState[];
  /** All flights on the ground inside the bbox. */
  ground: FlightState[];
  /** True when the fetch failed and we returned cached or empty data. */
  degraded: boolean;
  /** Error message if degraded. */
  error?: string;
  /** Which upstream produced this snapshot. */
  source?: "adsb.lol" | "opensky";
}

type RawState = readonly unknown[];

function num(raw: RawState, i: number): number | null {
  const v = raw[i];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function parseState(raw: RawState): FlightState {
  const icao24 = raw[IDX.icao24];
  const callsign = raw[IDX.callsign];
  const country = raw[IDX.originCountry];
  const onGround = raw[IDX.onGround];
  const posSource = raw[IDX.positionSource];
  return {
    icao24: typeof icao24 === "string" ? icao24 : "",
    callsign: typeof callsign === "string" ? callsign.trim() : "",
    originCountry: typeof country === "string" ? country : "",
    timePosition: num(raw, IDX.timePosition) !== null ? num(raw, IDX.timePosition)! * 1000 : null,
    lastContact: num(raw, IDX.lastContact) !== null ? num(raw, IDX.lastContact)! * 1000 : Date.now(),
    longitude: num(raw, IDX.longitude),
    latitude: num(raw, IDX.latitude),
    baroAltitude: num(raw, IDX.baroAltitude),
    geoAltitude: num(raw, IDX.geoAltitude),
    onGround: Boolean(onGround),
    velocity: num(raw, IDX.velocity),
    trueTrack: num(raw, IDX.trueTrack),
    verticalRate: num(raw, IDX.verticalRate),
    positionSource: typeof posSource === "number" ? posSource : -1,
  };
}

interface RawResponse {
  time: number;
  states: RawState[] | null;
}

/** Module-level cache so back-to-back requests within the same process
    don't double-burn credits. Backs up the upstream for one minute. */
let cache: { at: number; data: RawResponse | null } | null = null;
const CACHE_MS = 30_000; // upstream cache: 30 s, well below the upstream refresh

// Anonymous OpenSky access (400 credits/day, no auth) is throttled
// aggressively by source IP — and Cloudflare Workers share egress IPs
// across every customer on the platform, so anonymous requests from
// here get rate-limited far more often than the same code running
// from a residential or single-tenant IP. A free OpenSky account
// (https://opensky-network.org/apidoc/rest.html#authentication) raises
// the limit to 4000 credits/day and is keyed to the account, not the
// IP, which sidesteps the shared-egress problem. Configure it with
// OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET (OAuth2 client-credentials,
// from the account's API client page) to enable it; falls back to
// anonymous when unset.
const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`token ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    // Refresh 30s early so a request never races an expiring token.
    tokenCache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in - 30) * 1000 };
    return json.access_token;
  } catch (e) {
    console.warn(`[opensky] auth failed, falling back to anonymous: ${(e as Error).message}`);
    return null;
  }
}

async function fetchRaw(): Promise<RawResponse | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return cache.data;
  }
  const url = new URL(`${OPENSKY_BASE}/states/all`);
  url.searchParams.set("lamin", String(CNX_BBOX.lamin));
  url.searchParams.set("lomin", String(CNX_BBOX.lomin));
  url.searchParams.set("lamax", String(CNX_BBOX.lamax));
  url.searchParams.set("lomax", String(CNX_BBOX.lomax));
  const token = await getAccessToken();
  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "cnx-dashboard/0.1 (https://cnx.nonarkara.org)",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      // 10 s ceiling — OpenSky occasionally hangs on cold paths.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Don't blow up the page on a transient OpenSky 429. The map
      // continues to render; the flight overlay just stays empty
      // until the next poll succeeds.
      console.warn(`[opensky] ${res.status} ${res.statusText}`);
      cache = { at: now, data: null };
      return null;
    }
    const json = (await res.json()) as RawResponse;
    cache = { at: now, data: json };
    return json;
  } catch (e) {
    console.warn(`[opensky] fetch failed: ${(e as Error).message}`);
    cache = { at: now, data: null };
    return null;
  }
}

function inBbox(s: FlightState): boolean {
  return (
    s.latitude !== null && s.longitude !== null &&
    s.latitude >= CNX_BBOX.lamin && s.latitude <= CNX_BBOX.lamax &&
    s.longitude >= CNX_BBOX.lomin && s.longitude <= CNX_BBOX.lomax
  );
}

function split(states: FlightState[]) {
  const located = states.filter(inBbox);
  return {
    airborne: located.filter((s) => !s.onGround),
    ground: located.filter((s) => s.onGround),
  };
}

let adsbCache: { at: number; data: Awaited<ReturnType<typeof fetchAdsbLolStates>> } | null = null;

/** Fetch the current snapshot: adsb.lol first, OpenSky as fallback. */
export async function fetchCnxSnapshot(): Promise<FetchResult> {
  const fetchedAt = Date.now();
  if (!adsbCache || fetchedAt - adsbCache.at >= CACHE_MS) {
    adsbCache = { at: fetchedAt, data: await fetchAdsbLolStates() };
  }
  if (adsbCache.data) {
    return {
      fetchedAt,
      observedAt: adsbCache.data.observedAt,
      ...split(adsbCache.data.states),
      degraded: false,
      source: "adsb.lol",
    };
  }
  const raw = await fetchRaw();
  if (!raw) {
    return {
      fetchedAt,
      observedAt: fetchedAt,
      airborne: [],
      ground: [],
      degraded: true,
      error: "adsb.lol and OpenSky both unavailable",
    };
  }
  return {
    fetchedAt,
    observedAt: raw.time * 1000,
    ...split((raw.states ?? []).map(parseState)),
    degraded: false,
    source: "opensky",
  };
}

/** Group airborne flights by origin country and bucket by size.
    Used for the side panel. */
export interface CountrySummary {
  country: string;
  flights: number;
  bySize: Record<"heavy" | "wide" | "narrow" | "regional", number>;
}

import { lookupAircraft, type PlaneSize } from "./aircraft";

export function summariseByCountry(
  flights: FlightState[],
  typecodeByIcao: Map<string, string | undefined>,
): CountrySummary[] {
  const out = new Map<string, CountrySummary>();
  for (const f of flights) {
    const tc = typecodeByIcao.get(f.icao24);
    const size = lookupAircraft(tc).size;
    let entry = out.get(f.originCountry);
    if (!entry) {
      entry = {
        country: f.originCountry || "Unknown",
        flights: 0,
        bySize: { heavy: 0, wide: 0, narrow: 0, regional: 0 },
      };
      out.set(f.originCountry || "Unknown", entry);
    }
    entry.flights += 1;
    entry.bySize[size] += 1;
  }
  return [...out.values()].sort((a, b) => b.flights - a.flights);
}

export interface AircraftMeta {
  icao24: string;
  typecode?: string;
  registration?: string;
  manufacturerName?: string;
  model?: string;
}

/** Shared aircraft-metadata lookup — used by /api/cnx/aircraft and the
 *  arrivals visitor-estimate pipeline. Authenticated when OpenSky
 *  credentials are configured (see getAccessToken), same as states. */
export async function fetchAircraftMetadata(icao24List: string[]): Promise<AircraftMeta[]> {
  if (icao24List.length === 0) return [];
  const token = await getAccessToken();
  const upstream = new URL(`${OPENSKY_BASE}/aircraft`);
  upstream.searchParams.set("icao24", icao24List.join(","));
  const res = await fetch(upstream.toString(), {
    headers: {
      "User-Agent": "cnx-dashboard/0.1 (https://cnx.nonarkara.org)",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`opensky aircraft ${res.status}`);
  const json = (await res.json()) as Record<string, AircraftMeta | null>;
  const out: AircraftMeta[] = [];
  for (const id of icao24List) {
    const v = json[id];
    if (v) out.push({ icao24: id, typecode: v.typecode, registration: v.registration, manufacturerName: v.manufacturerName, model: v.model });
  }
  return out;
}

export interface SizeBucket {
  size: PlaneSize;
  count: number;
  seats: number;
}

export function summariseBySize(
  flights: FlightState[],
  typecodeByIcao: Map<string, string | undefined>,
): SizeBucket[] {
  const buckets = new Map<PlaneSize, SizeBucket>();
  for (const f of flights) {
    const tc = typecodeByIcao.get(f.icao24);
    const spec = lookupAircraft(tc);
    let b = buckets.get(spec.size);
    if (!b) {
      b = { size: spec.size, count: 0, seats: 0 };
      buckets.set(spec.size, b);
    }
    b.count += 1;
    b.seats += spec.seats;
  }
  return [...buckets.values()];
}
