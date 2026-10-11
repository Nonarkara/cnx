// Fetches the 48-hour forecast field (wind at 10 m and 850 hPa, rain, PM2.5)
// for the map's particle animation, the smoke-trajectory engine and the
// district outlook. Two grids:
//   - fine   0.3° over the province (what the map animates and the outlook
//            samples), wind + rain from Open-Meteo, PM2.5 from CAMS;
//   - coarse 0.75° over the 350 km haze window, wind only, for plumes from
//            Shan State and Laos.
//
// Open-Meteo counts every grid point as a call. One refresh is ~340 calls,
// so the field is shared through KV and refreshed at most every three hours
// — the models themselves update every 3–6 h, so a fresher copy would not
// be newer weather. A failed refresh keeps the last good run while it still
// covers the present, and says how old it is; otherwise the field is
// unavailable, never invented.

import { cnxKv } from "./relay-kv";
import { districtOutlook, windToUV, type DistrictOutlook, type FieldGrid, type ForecastField, type Frames, type WindSource } from "./wind-field-core";
import { CNX_DISTRICT_POINTS } from "./wind-field-points";

export const FINE_GRID: FieldGrid = { lon0: 97.5, lat0: 17.5, d: 0.3, nx: 11, ny: 11 };
export const COARSE_GRID: FieldGrid = { lon0: 95.5, lat0: 15.5, d: 0.75, nx: 10, ny: 10 };
const FINE_HOURS = 49;
const COARSE_HOURS = 25;
const KV_KEY = "forecast-field-v1";
const REFRESH_MS = 3 * 3_600_000;
const KEEP_MS = 12 * 3_600_000;
const MEMORY_MS = 10 * 60_000;

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";


export interface ForecastFieldResponse {
  generatedAt: string;
  /** When the model numbers were fetched from Open-Meteo. */
  fetchedAt: string | null;
  provenance: "model" | "unavailable";
  source: string;
  note: string;
  field: ForecastField | null;
  outlook: DistrictOutlook[];
}

interface Stored {
  fetchedAt: string;
  fine: ForecastField;
  coarse: WindSource;
}

function gridPoints(g: FieldGrid): { lats: string; lons: string } {
  const lats: string[] = [];
  const lons: string[] = [];
  for (let j = 0; j < g.ny; j += 1) {
    for (let i = 0; i < g.nx; i += 1) {
      lats.push((g.lat0 + j * g.d).toFixed(2));
      lons.push((g.lon0 + i * g.d).toFixed(2));
    }
  }
  return { lats: lats.join(","), lons: lons.join(",") };
}

type Hourly = Record<string, (number | null)[] | undefined> & { time?: number[] };
type Located = { hourly?: Hourly };

async function getLocations(base: string, g: FieldGrid, vars: string[], hours: number): Promise<Located[] | null> {
  const { lats, lons } = gridPoints(g);
  const extra = base === FORECAST_URL ? "&wind_speed_unit=ms" : "";
  const url = `${base}?latitude=${lats}&longitude=${lons}&hourly=${vars.join(",")}&forecast_hours=${hours}&timeformat=unixtime&timezone=GMT${extra}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const list = Array.isArray(body) ? body : [body];
    return list.length === g.nx * g.ny ? (list as Located[]) : null;
  } catch {
    return null;
  }
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round = (v: number, step: number) => Math.round(v / step) * step;

/** Time axis shared by every location, or null when the payload is inconsistent. */
function commonTimes(locs: Located[]): number[] | null {
  const times = locs[0]?.hourly?.time;
  if (!Array.isArray(times) || times.length === 0 || !times.every(finite)) return null;
  return locs.every((l) => l.hourly?.time?.length === times.length && l.hourly.time[0] === times[0]) ? times : null;
}

function windFrames(locs: Located[], nT: number, speedKey: string, dirKey: string): { u: Frames; v: Frames } {
  const u: Frames = Array.from({ length: nT }, () => new Array(locs.length).fill(null));
  const v: Frames = Array.from({ length: nT }, () => new Array(locs.length).fill(null));
  locs.forEach((loc, k) => {
    const sp = loc.hourly?.[speedKey];
    const dr = loc.hourly?.[dirKey];
    for (let t = 0; t < nT; t += 1) {
      const s = sp?.[t];
      const d = dr?.[t];
      if (!finite(s) || !finite(d) || s < 0 || s > 100) continue;
      const [uu, vv] = windToUV(s, d);
      u[t][k] = round(uu, 0.1);
      v[t][k] = round(vv, 0.1);
    }
  });
  return { u, v };
}

function scalarFrames(locs: Located[], nT: number, key: string, step: number, max: number): Frames {
  const out: Frames = Array.from({ length: nT }, () => new Array(locs.length).fill(null));
  locs.forEach((loc, k) => {
    const arr = loc.hourly?.[key];
    for (let t = 0; t < nT; t += 1) {
      const x = arr?.[t];
      if (finite(x) && x >= 0 && x <= max) out[t][k] = round(x, step);
    }
  });
  return out;
}

/** Align AQ frames to the forecast times by timestamp; missing hours become gaps. */
function alignFrames(srcTimes: number[], frames: Frames, targetTimes: number[], size: number): Frames {
  const at = new Map(srcTimes.map((t, i) => [t, i]));
  return targetTimes.map((t) => {
    const i = at.get(t);
    return i === undefined ? new Array(size).fill(null) : frames[i];
  });
}

async function fetchUpstream(): Promise<Stored | null> {
  const windVars = ["wind_speed_10m", "wind_direction_10m", "wind_speed_850hPa", "wind_direction_850hPa"];
  const [fine, aq, coarse] = await Promise.all([
    getLocations(FORECAST_URL, FINE_GRID, [...windVars, "precipitation"], FINE_HOURS),
    getLocations(AQ_URL, FINE_GRID, ["pm2_5"], FINE_HOURS),
    getLocations(FORECAST_URL, COARSE_GRID, windVars, COARSE_HOURS),
  ]);
  if (!fine) return null;
  const times = commonTimes(fine);
  if (!times) return null;
  const n = times.length;
  const w10 = windFrames(fine, n, "wind_speed_10m", "wind_direction_10m");
  const w850 = windFrames(fine, n, "wind_speed_850hPa", "wind_direction_850hPa");
  const aqTimes = aq ? commonTimes(aq) : null;
  const pm25 = aq && aqTimes ? alignFrames(aqTimes, scalarFrames(aq, aqTimes.length, "pm2_5", 1, 1000), times, fine.length) : null;
  const fineField: ForecastField = {
    grid: FINE_GRID,
    times,
    u10: w10.u,
    v10: w10.v,
    u850: w850.u,
    v850: w850.v,
    precip: scalarFrames(fine, n, "precipitation", 0.1, 200),
    pm25,
  };
  const cTimes = coarse ? commonTimes(coarse) : null;
  const c10 = coarse && cTimes ? windFrames(coarse, cTimes.length, "wind_speed_10m", "wind_direction_10m") : null;
  const c850 = coarse && cTimes ? windFrames(coarse, cTimes.length, "wind_speed_850hPa", "wind_direction_850hPa") : null;
  const coarseField: WindSource =
    cTimes && c10 && c850
      ? { grid: COARSE_GRID, times: cTimes, u10: c10.u, v10: c10.v, u850: c850.u, v850: c850.v }
      : { grid: COARSE_GRID, times: [], u10: [], v10: [], u850: [], v850: [] };
  return { fetchedAt: new Date().toISOString(), fine: fineField, coarse: coarseField };
}

function isStored(v: unknown): v is Stored {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<Stored>;
  return typeof s.fetchedAt === "string" && !!s.fine && Array.isArray(s.fine.times) && Array.isArray(s.fine.u10) && !!s.coarse && Array.isArray(s.coarse.times);
}

async function readKv(): Promise<Stored | null> {
  try {
    const store = await cnxKv();
    const raw = store ? await store.get(KV_KEY) : null;
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStored(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeKv(s: Stored): Promise<void> {
  try {
    const store = await cnxKv();
    await store?.put(KV_KEY, JSON.stringify(s), { expirationTtl: KEEP_MS / 1000 });
  } catch {
    // Sharing is an optimisation; the fetched field is still served.
  }
}

let memory: { at: number; data: Stored } | null = null;

/** The latest model field: memory → KV → upstream, keeping a run only while it covers now. */
export async function loadForecastField(nowMs = Date.now()): Promise<Stored | null> {
  const covers = (s: Stored) => {
    const last = s.fine.times[s.fine.times.length - 1];
    return typeof last === "number" && last * 1000 > nowMs && nowMs - Date.parse(s.fetchedAt) < KEEP_MS;
  };
  if (memory && nowMs - memory.at < MEMORY_MS && covers(memory.data)) return memory.data;
  const shared = await readKv();
  if (shared && nowMs - Date.parse(shared.fetchedAt) < REFRESH_MS && covers(shared)) {
    memory = { at: nowMs, data: shared };
    return shared;
  }
  const fresh = await fetchUpstream();
  if (fresh) {
    memory = { at: nowMs, data: fresh };
    await writeKv(fresh);
    return fresh;
  }
  if (shared && covers(shared)) {
    memory = { at: nowMs, data: shared };
    return shared;
  }
  return null;
}

/** Drop frames that are already in the past so the client starts at "now". */
function fromCurrentHour(f: ForecastField, nowMs: number): ForecastField {
  const nowSec = nowMs / 1000;
  const start = Math.max(0, f.times.findIndex((t) => t + 3600 > nowSec));
  const cut = <T>(a: T[]) => a.slice(start);
  return { ...f, times: cut(f.times), u10: cut(f.u10), v10: cut(f.v10), u850: cut(f.u850), v850: cut(f.v850), precip: cut(f.precip), pm25: f.pm25 ? cut(f.pm25) : null };
}

const SOURCE = "Open-Meteo (best-match weather models) · PM2.5: CAMS via Open-Meteo";

export async function fetchForecastField(nowMs = Date.now()): Promise<ForecastFieldResponse> {
  const stored = await loadForecastField(nowMs);
  if (!stored) {
    return {
      generatedAt: new Date(nowMs).toISOString(),
      fetchedAt: null,
      provenance: "unavailable",
      source: SOURCE,
      note: "The forecast model did not answer and no recent run is stored — no wind, rain or PM2.5 forecast is shown, which is not a calm forecast.",
      field: null,
      outlook: [],
    };
  }
  const field = fromCurrentHour(stored.fine, nowMs);
  return {
    generatedAt: new Date(nowMs).toISOString(),
    fetchedAt: stored.fetchedAt,
    provenance: "model",
    source: SOURCE,
    note: "Model forecast on a 0.3° grid (~30 km) — it shows the regional flow, not a single valley's storm or a gust. Measured rain and river levels always outrank it.",
    field,
    outlook: districtOutlook(field, CNX_DISTRICT_POINTS, nowMs / 1000),
  };
}

/** Both grids for the trajectory engine (finest first), or null. */
export async function trajectoryWind(nowMs = Date.now()): Promise<WindSource[] | null> {
  const stored = await loadForecastField(nowMs);
  if (!stored) return null;
  return stored.coarse.times.length ? [stored.fine, stored.coarse] : [stored.fine];
}
