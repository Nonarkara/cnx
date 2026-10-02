// Google Flood Hub forecasts for the Ping at Chiang Mai.
//
// What this is (from probing the API, 2026-10-01): Flood Hub has 337
// forecast points in the upper north and every one is a HYBAS "virtual
// gauge" — a point on Google's hydrological model of the river network,
// not a physical river station; only 5 are quality-verified. The nearest
// sits 3 km from Nawarat bridge. So these are MODEL FORECASTS, labelled as
// such, and they follow one rule: a forecast may raise a flag (flooding
// forecast → prepare) but can never clear the board to "safe". "No
// flooding forecast" is reported as exactly that. Google's terms also say
// Flood Hub must not be the sole source in an emergency.

const API = "https://floodforecasting.googleapis.com/v1";
const CITY = { latitude: 18.79, longitude: 98.99 }; // Nawarat bridge, Ping
/** Forecast points further than this from the city are not the Ping at Chiang Mai. */
const RADIUS_KM = 30;
const MAX_POINTS = 12;
/** Google: gauge lists change, don't cache them much beyond a day. */
const GAUGE_TTL_MS = 12 * 60 * 60_000;
const STATUS_TTL_MS = 30 * 60_000;

export type FloodHubSeverity = "EXTREME" | "SEVERE" | "ABOVE_NORMAL" | "NO_FLOODING" | "UNKNOWN";

export interface FloodHubPoint {
  gaugeId: string;
  latitude: number;
  longitude: number;
  kmFromCity: number;
  qualityVerified: boolean;
  severity: FloodHubSeverity;
  trend: "RISE" | "FALL" | "NO_CHANGE" | "UNKNOWN";
  issuedTime: string | null;
  forecastStart: string | null;
  forecastEnd: string | null;
}

export interface FloodHubResponse {
  generatedAt: string;
  provenance: "live" | "unavailable";
  points: FloodHubPoint[];
  /** "flooding" when any point forecasts above-normal water or worse;
   *  "none-forecast" otherwise — never "safe". */
  outlook: "flooding" | "none-forecast" | "unknown";
  worst: FloodHubSeverity | null;
  note: string;
}

const RANK: Record<FloodHubSeverity, number> = { UNKNOWN: 0, NO_FLOODING: 1, ABOVE_NORMAL: 2, SEVERE: 3, EXTREME: 4 };
const SEVERITIES = Object.keys(RANK) as FloodHubSeverity[];
const TRENDS = ["RISE", "FALL", "NO_CHANGE"] as const;

/**
 * Built from the points actually shown, not written as a fixed string.
 *
 * "most are not quality-verified" was true of the basin and false of the
 * screen: the twelve nearest are all HYBAS virtual points, none verified.
 * A hedge that is wrong in the direction of comfort is worse than no
 * hedge, so the count is computed here and states "none of" when that is
 * what the data says. If Google later validates a Ping point, this line
 * changes on its own.
 *
 * The scope sentence is the one that matters most and was missing:
 * FloodHub forecasts *riverine* flooding only. It does not cover urban
 * or flash flooding. Chiang Mai's acute city flood mode is urban, so a
 * clean riverine forecast is silent about the failure that actually
 * floods streets — the same omission half of the error everywhere else.
 */
export function floodHubNote(points: Array<{ qualityVerified: boolean }>): string {
  const verified = points.filter((p) => p.qualityVerified).length;
  const total = points.length;
  const verification =
    total === 0
      ? "no forecast points available"
      : verified === 0
      ? `none of the ${total} points shown are quality-verified — these are points on Google's river model, not physical river stations, so no reading here has been checked against a real gauge`
      : verified === total
      ? `all ${total} points shown are quality-verified`
      : `only ${verified} of the ${total} points shown are quality-verified; the rest are points on Google's river model, not physical river stations`;
  return (
    `Google Flood Hub model forecast, ${verification}. ` +
    "It forecasts river flooding only — it does not cover urban or flash flooding, so it is silent about street-level and drainage flooding in the city. " +
    "A forecast of flooding is a reason to prepare; no forecast of flooding is not an all-clear. Not for use as the sole source in an emergency."
  );
}

function km(lat: number, lon: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x =
    Math.sin(rad(lat - CITY.latitude) / 2) ** 2 +
    Math.cos(rad(CITY.latitude)) * Math.cos(rad(lat)) * Math.sin(rad(lon - CITY.longitude) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

interface RawGauge {
  gaugeId?: string;
  location?: { latitude?: number; longitude?: number };
  qualityVerified?: boolean;
}

interface RawStatus {
  gaugeId?: string;
  severity?: string;
  forecastTrend?: string;
  issuedTime?: string;
  forecastTimeRange?: { start?: string; end?: string };
}

/** Gauges within RADIUS_KM of the city, nearest first. */
export function nearestGauges(gauges: RawGauge[]): { gaugeId: string; latitude: number; longitude: number; kmFromCity: number; qualityVerified: boolean }[] {
  return gauges
    .flatMap((g) => {
      const lat = g.location?.latitude;
      const lon = g.location?.longitude;
      if (!g.gaugeId || typeof lat !== "number" || typeof lon !== "number") return [];
      const d = km(lat, lon);
      return d <= RADIUS_KM ? [{ gaugeId: g.gaugeId, latitude: lat, longitude: lon, kmFromCity: Math.round(d * 10) / 10, qualityVerified: g.qualityVerified === true }] : [];
    })
    .sort((a, b) => a.kmFromCity - b.kmFromCity)
    .slice(0, MAX_POINTS);
}

/** Joins gauges with their statuses and derives the escalation-only outlook. */
export function summariseFloodHub(
  gauges: ReturnType<typeof nearestGauges>,
  statuses: RawStatus[],
  now = new Date().toISOString(),
): FloodHubResponse {
  const byId = new Map(statuses.map((s) => [s.gaugeId, s]));
  const points: FloodHubPoint[] = gauges.map((g) => {
    const s = byId.get(g.gaugeId);
    const issued = Date.parse(s?.issuedTime ?? "");
    const end = Date.parse(s?.forecastTimeRange?.end ?? "");
    const start = Date.parse(s?.forecastTimeRange?.start ?? "");
    const nowMs = Date.parse(now);
    const usable = Number.isFinite(issued) && issued <= nowMs + 5 * 60_000 && nowMs - issued <= 24 * 3_600_000 && Number.isFinite(start) && Number.isFinite(end) && start <= nowMs && end > nowMs;
    const severity = usable && SEVERITIES.includes(s?.severity as FloodHubSeverity) ? (s?.severity as FloodHubSeverity) : "UNKNOWN";
    const trend = usable && TRENDS.includes(s?.forecastTrend as (typeof TRENDS)[number]) ? (s?.forecastTrend as FloodHubPoint["trend"]) : "UNKNOWN";
    return {
      ...g,
      severity,
      trend,
      issuedTime: s?.issuedTime ?? null,
      forecastStart: s?.forecastTimeRange?.start ?? null,
      forecastEnd: s?.forecastTimeRange?.end ?? null,
    };
  });
  const known = points.filter((p) => p.severity !== "UNKNOWN");
  const worst = known.length ? known.reduce((a, b) => (RANK[b.severity] > RANK[a.severity] ? b : a)).severity : null;
  const outlook = worst === null ? "unknown" : RANK[worst] >= RANK.ABOVE_NORMAL ? "flooding" : "none-forecast";
  return { generatedAt: now, provenance: known.length ? "live" : "unavailable", points, outlook, worst, note: floodHubNote(points) };
}

let gaugeCache: { at: number; gauges: ReturnType<typeof nearestGauges> } | null = null;
let cache: { at: number; data: FloodHubResponse } | null = null;

function unavailable(reason: string): FloodHubResponse {
  return {
    generatedAt: new Date().toISOString(),
    provenance: "unavailable",
    points: [],
    outlook: "unknown",
    worst: null,
    note: `${reason} ${floodHubNote([])}`,
  };
}

export async function fetchCnxFloodHub(): Promise<FloodHubResponse> {
  if (cache && Date.now() - cache.at < STATUS_TTL_MS) return cache.data;
  const key = process.env.CNX_FLOODHUB_KEY;
  if (!key) return unavailable("CNX_FLOODHUB_KEY is not set.");
  const headers = { "Content-Type": "application/json", "X-goog-api-key": key };
  try {
    if (!gaugeCache || Date.now() - gaugeCache.at > GAUGE_TTL_MS) {
      const res = await fetch(`${API}/gauges:searchGaugesByArea`, {
        method: "POST",
        headers,
        body: JSON.stringify({ regionCode: "TH", includeNonQualityVerified: true }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return unavailable(`Flood Hub gauge search answered HTTP ${res.status}.`);
      const body = (await res.json()) as { gauges?: RawGauge[] };
      gaugeCache = { at: Date.now(), gauges: nearestGauges(body.gauges ?? []) };
    }
    const gauges = gaugeCache.gauges;
    if (gauges.length === 0) return unavailable("Flood Hub lists no forecast point near Chiang Mai.");
    const q = gauges.map((g) => `gaugeIds=${encodeURIComponent(g.gaugeId)}`).join("&");
    const res = await fetch(`${API}/floodStatus:queryLatestFloodStatusByGaugeIds?${q}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return unavailable(`Flood Hub status query answered HTTP ${res.status}.`);
    const body = (await res.json()) as { floodStatuses?: RawStatus[] };
    const data = summariseFloodHub(gauges, body.floodStatuses ?? []);
    cache = { at: Date.now(), data };
    return data;
  } catch (e) {
    return unavailable(`Flood Hub request failed: ${(e as Error).message}.`);
  }
}
