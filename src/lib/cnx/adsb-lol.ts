// adsb.lol — community ADS-B aggregator, open API, no key. Primary live
// source because OpenSky's anonymous tier throttles Cloudflare's shared
// egress IPs. It also returns the aircraft type and registration inline,
// so no separate /aircraft lookup is needed.

import type { FlightState } from "./opensky";

const CENTER = { lat: 19.0, lon: 99.0 };
/** Nautical miles — covers the CNX_BBOX corners. */
const RADIUS_NM = 125;
const FT_TO_M = 0.3048;
const KT_TO_MS = 0.514444;
const FPM_TO_MS = 0.00508;

interface ReadsbAircraft {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  alt_baro?: number | "ground";
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  geom_rate?: number;
  lat?: number;
  lon?: number;
  seen_pos?: number;
  seen?: number;
}

interface ReadsbResponse {
  now?: number;
  ac?: ReadsbAircraft[];
}

// Registration prefix → state of registry. Longest prefix wins.
const REG_PREFIX_COUNTRY: Record<string, string> = {
  HS: "Thailand", "9V": "Singapore", "9M": "Malaysia", PK: "Indonesia", RP: "Philippines",
  VN: "Viet Nam", XU: "Cambodia", RDPL: "Laos", XY: "Myanmar", XZ: "Myanmar",
  B: "China", "B-H": "Hong Kong", "B-K": "Hong Kong", "B-L": "Hong Kong", "B-M": "Macao",
  JA: "Japan", HL: "Republic of Korea", VT: "India", A6: "United Arab Emirates", A7: "Qatar",
  "4R": "Sri Lanka", S2: "Bangladesh", "8Q": "Maldives", "9N": "Nepal", A5: "Bhutan",
  VH: "Australia", ZK: "New Zealand", N: "United States", C: "Canada", G: "United Kingdom",
  D: "Germany", F: "France", EI: "Ireland", PH: "Netherlands", TC: "Turkey", RA: "Russia",
  HZ: "Saudi Arabia", "4X": "Israel",
};

export function countryFromRegistration(reg: string | undefined): string {
  if (!reg) return "";
  const r = reg.toUpperCase();
  // Taiwan and mainland China share "B-"; Taiwan uses five digits.
  if (/^B-\d{5}$/.test(r)) return "Taiwan";
  let best = "";
  for (const prefix of Object.keys(REG_PREFIX_COUNTRY)) {
    if (r.startsWith(prefix) && prefix.length > best.length) {
      // Single-letter prefixes (N, C, G, D, F, B) need a hyphen or digit next.
      const next = r.charAt(prefix.length);
      if (prefix.length === 1 && next !== "-" && !/\d/.test(next)) continue;
      best = prefix;
    }
  }
  return best ? REG_PREFIX_COUNTRY[best] : "";
}

function toState(a: ReadsbAircraft, nowMs: number): FlightState | null {
  if (!a.hex || typeof a.lat !== "number" || typeof a.lon !== "number") return null;
  const onGround = a.alt_baro === "ground";
  const baro = typeof a.alt_baro === "number" ? a.alt_baro * FT_TO_M : onGround ? 0 : null;
  const rate = a.baro_rate ?? a.geom_rate;
  return {
    icao24: a.hex.replace(/^~/, "").toLowerCase(),
    callsign: (a.flight ?? "").trim(),
    originCountry: countryFromRegistration(a.r),
    timePosition: typeof a.seen_pos === "number" ? nowMs - a.seen_pos * 1000 : null,
    lastContact: nowMs - (a.seen ?? 0) * 1000,
    longitude: a.lon,
    latitude: a.lat,
    baroAltitude: baro,
    geoAltitude: typeof a.alt_geom === "number" ? a.alt_geom * FT_TO_M : null,
    onGround,
    velocity: typeof a.gs === "number" ? a.gs * KT_TO_MS : null,
    trueTrack: a.track ?? null,
    verticalRate: typeof rate === "number" ? rate * FPM_TO_MS : null,
    positionSource: 0,
    typecode: a.t,
    registration: a.r,
  };
}

/** Returns parsed states, or null if the upstream is unavailable. */
export async function fetchAdsbLolStates(): Promise<{ observedAt: number; states: FlightState[] } | null> {
  try {
    const res = await fetch(`https://api.adsb.lol/v2/point/${CENTER.lat}/${CENTER.lon}/${RADIUS_NM}`, {
      headers: { "User-Agent": "cnx-dashboard/0.1 (https://cnx.nonarkara.org)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[adsb.lol] ${res.status} ${res.statusText}`);
      return null;
    }
    const json = (await res.json()) as ReadsbResponse;
    const now = json.now ?? Date.now();
    const states = (json.ac ?? [])
      .map((a) => toState(a, now))
      .filter((s): s is FlightState => s !== null);
    return { observedAt: now, states };
  } catch (e) {
    console.warn(`[adsb.lol] fetch failed: ${(e as Error).message}`);
    return null;
  }
}
