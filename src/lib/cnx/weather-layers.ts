// Resolves ready-to-use raster tile URL templates for the map's weather
// overlays: live rain radar, Himawari-9 infrared, and MODIS aerosol
// optical depth (AOD). All three are free, keyless, public tile
// services — confirmed reachable from Cloudflare's own network (unlike
// OpenSky/adsb.lol, see lib/cnx/opensky.ts) with a throwaway test Worker
// before this was built.
//
// The GIBS layers (Himawari, AOD) are published under a fixed UTC time
// slot per frame — a request for any other time 404s — and there is no
// endpoint that just returns "the latest time"; the only reliable way
// to find it is to probe candidate times, newest first, until one
// exists. Each result is cached in-process because polling every
// request would multiply that probing cost by every viewer.

const REF_TILE = { z: 6, x: 49, y: 28 } as const; // Chiang Mai, at GoogleMapsCompatible_Level6

const GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
const RAINVIEWER_MAPS_URL = "https://api.rainviewer.com/public/weather-maps.json";
const RAINVIEWER_HOST = "https://tilecache.rainviewer.com";

async function gibsTileExists(layer: string, tms: string, time: string): Promise<boolean> {
  const url = `${GIBS_BASE}/${layer}/default/${time}/${tms}/${REF_TILE.z}/${REF_TILE.y}/${REF_TILE.x}.png`;
  // GET only — verified empirically that GIBS's CDN answers HEAD with
  // 404 on tiles that return 200 on GET (checked live: a tile that GET
  // confirmed existed still 404'd on HEAD, repeatably). A HEAD-first
  // probe would treat every real tile as missing and never find one.
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    return res.ok;
  } catch {
    return false;
  }
}

function toGibsIso(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Himawari-9 Band 13 clean infrared — ~10 min cadence, observed ~30-50
 *  min publishing latency. Probes back in 10-min steps up to 3 hours. */
async function resolveHimawariTime(): Promise<string | null> {
  const layer = "Himawari_AHI_Band13_Clean_Infrared";
  const tms = "GoogleMapsCompatible_Level6";
  const now = new Date();
  for (let stepsBack = 0; stepsBack <= 18; stepsBack++) {
    const t = new Date(now.getTime() - stepsBack * 10 * 60_000);
    t.setUTCMinutes(Math.floor(t.getUTCMinutes() / 10) * 10, 0, 0);
    const iso = toGibsIso(t);
    if (await gibsTileExists(layer, tms, iso)) return iso;
  }
  return null;
}

/** MODIS combined (Terra+Aqua) value-added AOD — daily granularity,
 *  observed ~1 day publishing latency. Probes back up to 5 days. */
async function resolveAodDate(): Promise<string | null> {
  const layer = "MODIS_Combined_Value_Added_AOD";
  const tms = "GoogleMapsCompatible_Level6";
  const now = new Date();
  for (let daysBack = 0; daysBack <= 5; daysBack++) {
    const t = new Date(now.getTime() - daysBack * 86_400_000);
    const date = t.toISOString().slice(0, 10);
    if (await gibsTileExists(layer, tms, date)) return date;
  }
  return null;
}

interface RainViewerFrame {
  time: number;
  path: string;
}

interface RainViewerResponse {
  host: string;
  radar: { past: RainViewerFrame[]; nowcast?: RainViewerFrame[] };
}

async function resolveRainRadarPath(): Promise<{ host: string; path: string; generatedAt: number } | null> {
  try {
    const res = await fetch(RAINVIEWER_MAPS_URL, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<RainViewerResponse>;
    const past = json.radar?.past;
    const latest = Array.isArray(past) ? past.at(-1) : undefined;
    // Guard the shape — a half-changed upstream schema must degrade to
    // "no radar right now", never to a template with "undefined" in it.
    if (!latest || typeof latest.path !== "string" || typeof latest.time !== "number") return null;
    const host = typeof json.host === "string" && json.host ? json.host : RAINVIEWER_HOST;
    return { host, path: latest.path, generatedAt: latest.time * 1000 };
  } catch {
    return null;
  }
}

export interface WeatherLayerUrls {
  /** MapLibre raster tile URL template — null when the upstream has no
   *  data available right now (all three degrade independently; a dead
   *  one doesn't block the others). RainViewer uses {z}/{x}/{y}; the
   *  GIBS WMTS templates use {z}/{y}/{x} order, which MapLibre fills
   *  correctly since it substitutes each placeholder by name. */
  rainRadar: string | null;
  himawari: string | null;
  aerosol: string | null;
  attribution: { rainRadar: string; himawari: string; aerosol: string };
}

interface CacheEntry {
  at: number;
  value: string | null;
}

const CACHE_MS = {
  rainRadar: 2 * 60_000, // RainViewer publishes a new frame every ~10 min
  himawari: 8 * 60_000,
  aerosol: 30 * 60_000, // daily layer — no need to re-probe often
};

let rainRadarCache: CacheEntry | null = null;
let himawariCache: CacheEntry | null = null;
let aerosolCache: CacheEntry | null = null;

async function cached(
  cache: CacheEntry | null,
  ttlMs: number,
  resolve: () => Promise<string | null>,
): Promise<{ entry: CacheEntry; value: string | null }> {
  if (cache && Date.now() - cache.at < ttlMs) return { entry: cache, value: cache.value };
  const value = await resolve();
  return { entry: { at: Date.now(), value }, value };
}

export async function fetchWeatherLayerUrls(): Promise<WeatherLayerUrls> {
  const [rain, himawari, aod] = await Promise.all([
    cached(rainRadarCache, CACHE_MS.rainRadar, async () => {
      const r = await resolveRainRadarPath();
      return r ? `${r.host}${r.path}/256/{z}/{x}/{y}/2/1_1.png` : null;
    }),
    cached(himawariCache, CACHE_MS.himawari, resolveHimawariTime).then((r) => ({
      entry: r.entry,
      value: r.value
        ? `${GIBS_BASE}/Himawari_AHI_Band13_Clean_Infrared/default/${r.value}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`
        : null,
    })),
    cached(aerosolCache, CACHE_MS.aerosol, resolveAodDate).then((r) => ({
      entry: r.entry,
      value: r.value
        ? `${GIBS_BASE}/MODIS_Combined_Value_Added_AOD/default/${r.value}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`
        : null,
    })),
  ]);
  rainRadarCache = rain.entry;
  himawariCache = himawari.entry;
  aerosolCache = aod.entry;

  return {
    rainRadar: rain.value,
    himawari: himawari.value,
    aerosol: aod.value,
    attribution: {
      rainRadar: "RainViewer",
      himawari: "NASA GIBS / JMA Himawari-9",
      aerosol: "NASA GIBS / MODIS Terra+Aqua",
    },
  };
}
