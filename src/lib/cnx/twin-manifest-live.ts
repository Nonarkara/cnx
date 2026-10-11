// Live fields for the twin manifest: one cheap probe per entity.
//
// Relay feeds are read straight from their KV key (`generatedAt`, or
// `fetchedAt` for the flights snapshot): one KV get, no upstream call, and
// it is the relay's heartbeat. Direct feeds call the module's own fetcher,
// which answers from its in-isolate cache (5–60 min TTLs) — so a manifest
// request does not fan out to every upstream, and the route itself sits
// behind the edge cache for two minutes. Each probe picks the same clock
// the watch list ages (watch-list.ts), and returns no time at all unless the
// feed answered live: an "unavailable" feed has no observation to age.

import { cnxKv } from "./relay-kv";
import { fetchStaticAsset } from "./static-asset";
import { TWIN_ENTITIES, type LiveReading } from "./twin-manifest";
import { fetchCnxAirQuality } from "./air-quality";
import { fetchCnxDustboy } from "./dustboy";
import { fetchCnxAerosol } from "./aerosol";
import { fetchCnxAeronet } from "./aeronet";
import { fetchCnxGistdaPm25 } from "./gistda-pm25";
import { fetchCnxFires } from "./fires";
import { fetchCnxRfdFires } from "./fire-rfd";
import { fetchSmokeTrajectory } from "./smoke-feed";
import { fetchCnxFloodHub } from "./floodhub";
import { fetchForecastField } from "./wind-field";
import { fetchCnxCctv } from "./cctv";
import { fetchCnxFloodCameras } from "./flood-cameras";
import { fetchWeatherLayerUrls } from "./weather-layers";
import { fetchLatestAotItem } from "./jaxa-aot";
import { fetchCnxOpenDataIndex } from "./open-data-th";
import { fetchCnxAsmc } from "./asmc";
import { fetchOfficialWarnings } from "./tmd-cap";

const PROBE_TIMEOUT_MS = 8_000;
const CHIANG_MAI_LON = 98.98;

type Probe = () => Promise<LiveReading>;

const none = (provenance: string | null): LiveReading => ({ lastObservedAt: null, provenance });

/** Newest parseable timestamp, as ISO, or null — an empty feed is not a fresh feed. */
export function newestIso(values: ReadonlyArray<string | number | null | undefined>): string | null {
  let best = -Infinity;
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    const t = typeof v === "number" ? v : Date.parse(v);
    if (Number.isFinite(t) && t > best) best = t;
  }
  return Number.isFinite(best) ? new Date(best).toISOString() : null;
}

/** `generatedAt` (ISO) or `fetchedAt` (epoch ms, the flights snapshot) from a relay payload. */
export function relayStamp(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const o = v as Record<string, unknown>;
    if (typeof o.generatedAt === "string") return newestIso([o.generatedAt]);
    if (typeof o.fetchedAt === "number") return newestIso([o.fetchedAt]);
    return null;
  } catch {
    return null;
  }
}

/** Live only: a feed that did not answer live has nothing to age. */
const when = (isLive: boolean, provenance: string, at: string | null | undefined): LiveReading =>
  isLive ? { lastObservedAt: newestIso([at]), provenance } : none(provenance);

/** GIBS tile URLs carry their frame time: …/default/<time>/GoogleMaps… */
export function gibsTime(url: string | null): string | null {
  const m = url ? /\/default\/([^/]+)\//.exec(url) : null;
  return m ? newestIso([m[1]]) : null;
}

const DIRECT: Record<string, Probe> = {
  // TMD publishes issuance times, not observations: the clock is the feed's answer.
  "official-warnings": async () => {
    const r = await fetchOfficialWarnings();
    return when(r.provenance === "live", r.provenance, r.provenance === "live" ? r.fetchedAt : null);
  },
  air4thai: async () => {
    const r = await fetchCnxAirQuality();
    const pcd = r.stations.filter((s) => s.source === "pcd");
    const at = newestIso(pcd.map((s) => s.observedAt));
    return at ? { lastObservedAt: at, provenance: "live" } : none("unavailable");
  },
  dustboy: async () => {
    const r = await fetchCnxDustboy();
    return when(r.provenance === "live", r.provenance, newestIso(r.stations.map((s) => s.observedAt)));
  },
  "cams-aod": async () => {
    const r = await fetchCnxAerosol();
    return when(r.provenance === "model", r.provenance, r.generatedAt);
  },
  aeronet: async () => {
    const r = await fetchCnxAeronet();
    return r.latest ? { lastObservedAt: newestIso([r.latest.date]), provenance: "live" } : none("unavailable");
  },
  "gistda-pm25": async () => {
    const r = await fetchCnxGistdaPm25();
    return when(r.provenance === "live", r.provenance, r.observedAt);
  },
  firms: async () => {
    const r = await fetchCnxFires();
    return when(r.provenance === "live", r.provenance, r.generatedAt);
  },
  "rfd-fires": async () => {
    const r = await fetchCnxRfdFires();
    return when(r.provenance === "live", r.provenance, r.generatedAt);
  },
  "smoke-trajectory": async () => {
    const r = await fetchSmokeTrajectory();
    return when(r.provenance === "live", r.provenance, r.generatedAt);
  },
  floodhub: async () => {
    const r = await fetchCnxFloodHub();
    return when(r.provenance === "live", r.provenance, newestIso(r.points.map((p) => p.issuedTime)));
  },
  "forecast-field": async () => {
    const r = await fetchForecastField();
    return when(r.provenance === "model", r.provenance, r.fetchedAt);
  },
  cctv: async () => {
    const r = await fetchCnxCctv();
    return when(r.reachableCount > 0, r.reachableCount > 0 ? "live" : "unavailable", r.generatedAt);
  },
  "flood-cameras": async () => {
    const r = await fetchCnxFloodCameras();
    return when(r.provenance === "live", r.provenance, r.cataloguedAt);
  },
  "weather-imagery": async () => {
    const r = await fetchWeatherLayerUrls();
    const at = newestIso([gibsTime(r.himawari), gibsTime(r.aerosol)]);
    return at ? { lastObservedAt: at, provenance: "live" } : none(r.rainRadar ? "live" : "unavailable");
  },
  "jaxa-aot": async () => {
    const r = await fetchLatestAotItem(CHIANG_MAI_LON);
    return when(r.provenance === "live", r.provenance, r.item?.observedFrom ?? r.resolvedFor);
  },
  "open-data": async () => {
    const r = await fetchCnxOpenDataIndex();
    return when(r.datasets.length > 0, r.datasets.length > 0 ? "baked" : "unavailable", r.generatedAt);
  },
  asmc: async () => {
    const r = await fetchCnxAsmc();
    return when(r.provenance === "live", r.provenance, r.observedAt);
  },
  shelters: async () => {
    const res = await fetchStaticAsset("/data/cnx/shelters.json");
    if (!res.ok) return none("unavailable");
    const body = (await res.json()) as { generatedAt?: unknown };
    return when(typeof body.generatedAt === "string", "baked", typeof body.generatedAt === "string" ? body.generatedAt : null);
  },
};

function withTimeout(p: Promise<LiveReading>): Promise<LiveReading> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<LiveReading>((resolve) => {
    timer = setTimeout(() => resolve(none("timeout")), PROBE_TIMEOUT_MS);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

async function probeRelay(key: string): Promise<LiveReading> {
  const store = await cnxKv();
  if (!store) return none("unavailable");
  const at = relayStamp(await store.get(key));
  return at ? { lastObservedAt: at, provenance: "relay" } : none("unavailable");
}

/**
 * Live readings for every entity that can be probed. Entities with neither
 * a relay key nor a probe (outputs of this board, static reference data,
 * routes built elsewhere) are left out, so their live fields stay null.
 */
export async function probeAll(): Promise<Record<string, LiveReading>> {
  const jobs = TWIN_ENTITIES.flatMap((e): Array<[string, () => Promise<LiveReading>]> => {
    if (e.transport === "relay" && e.relayKey) {
      const key = e.relayKey;
      return [[e.id, () => probeRelay(key)]];
    }
    const probe = DIRECT[e.id];
    return probe ? [[e.id, probe]] : [];
  });
  const settled = await Promise.all(
    jobs.map(async ([id, run]) => {
      try {
        return [id, await withTimeout(run())] as const;
      } catch {
        return [id, none("unavailable")] as const;
      }
    }),
  );
  return Object.fromEntries(settled);
}

/** Exposed for the test: which ids have a direct probe. */
export const DIRECT_PROBE_IDS: readonly string[] = Object.keys(DIRECT);
