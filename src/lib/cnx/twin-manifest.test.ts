import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MANIFEST_EXCLUDED_ROUTES,
  RELAY_HEALTH_IDS,
  RELAY_OFFLINE_AFTER_SEC,
  TWIN_ENTITIES,
  buildManifest,
  getTwinEntity,
  relayHealth,
  sloCounts,
  sloState,
  withinSlo,
} from "./twin-manifest";
import { LAYER_CONTRACTS } from "./layer-contract";
import { RIVER_LEVEL_KV_KEY, RIVER_LEVEL_KV_STALE_MS } from "./river-level-kv";
import { RAIN_KV_KEY } from "./rain";
import { RAIN_RELAY_MAX_AGE_MS } from "./rain-core";
import { DAM_KV_KEY } from "./dam";
import { DAM_RELAY_MAX_AGE_MS } from "./dam-core";
import { HAZE_VISION_KV_KEY } from "./haze-vision";
import { CITIZEN_KV_KEY } from "./citizen-reports";
import { SOCIAL_RSS_KV_KEY } from "./social-feeds";
import { FLIGHTS_KV_KEY, FLIGHTS_KV_STALE_MS } from "./flights-kv";
import { ARRIVALS_KV_KEY, ARRIVALS_KV_STALE_MS } from "./arrivals-kv";
import { DIRECT_PROBE_IDS, gibsTime, newestIso, relayStamp } from "./twin-manifest-live";

const API_ROOT = join(__dirname, "..", "..", "app", "api", "cnx");
const NOW = Date.parse("2026-10-11T05:00:00Z");
const ago = (sec: number) => new Date(NOW - sec * 1000).toISOString();

/** Every route.ts under src/app/api/cnx, as its URL path. */
function apiRoutes(dir = API_ROOT): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return apiRoutes(full);
    return name === "route.ts" ? [`/api/cnx/${relative(API_ROOT, dir).split(sep).join("/")}`] : [];
  });
}

describe("twin manifest registry", () => {
  it("has unique ids and every declared field filled", () => {
    const ids = TWIN_ENTITIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of TWIN_ENTITIES) {
      for (const field of [e.name_th, e.name_en, e.upstream.agency, e.upstream.host, e.licence, e.route, e.fidelity, e.failureMode, e.mustNotConclude.th, e.mustNotConclude.en]) {
        expect(field.trim(), `${e.id}`).not.toBe("");
      }
      expect(["measured", "satellite", "model", "vision", "static", "derived"]).toContain(e.kind);
      expect(["direct", "relay", "baked"]).toContain(e.transport);
      expect(["none", "cross-checked", "ground-truthed"]).toContain(e.validation);
      expect(e.route).toMatch(/^\/(api\/cnx|data\/cnx)\//);
    }
  });

  it("declares a stale limit no tighter than the cadence", () => {
    for (const e of TWIN_ENTITIES) {
      if (e.staleAfterSec !== null && e.cadenceSec !== null) expect(e.staleAfterSec, e.id).toBeGreaterThanOrEqual(e.cadenceSec);
    }
  });

  it("includes the new water, forecast, shelter and warning feeds", () => {
    for (const id of ["forecast-field", "dam", "shelters", "rain", "river-level", "official-warnings", "cap-export"]) {
      expect(getTwinEntity(id), id).not.toBeNull();
    }
    expect(getTwinEntity("shelters")?.transport).toBe("baked");
    expect(getTwinEntity("official-warnings")?.route).toBe("/api/cnx/official-warnings");
    expect(getTwinEntity("cap-export")?.route).toBe("/api/cnx/cap.xml");
    expect(getTwinEntity("nope")).toBeNull();
  });

  it("reuses the layer contracts' must-not-conclude boundary where one exists", () => {
    const reused = TWIN_ENTITIES.filter((e) => e.layerContract);
    expect(reused.map((e) => e.id).sort()).toEqual(["dam", "rain", "river-level"]);
    for (const e of reused) expect(e.mustNotConclude).toEqual(LAYER_CONTRACTS[e.layerContract!].mustNotConclude);
  });

  it("names the relay KV keys and stale limits the modules actually use", () => {
    const relay = Object.fromEntries(TWIN_ENTITIES.filter((e) => e.transport === "relay").map((e) => [e.id, e]));
    expect(Object.keys(relay).sort()).toEqual(["arrivals", "citizen", "dam", "flights", "haze-vision", "rain", "river-level", "social"]);
    expect(relay["river-level"].relayKey).toBe(RIVER_LEVEL_KV_KEY);
    expect(relay.rain.relayKey).toBe(RAIN_KV_KEY);
    expect(relay.dam.relayKey).toBe(DAM_KV_KEY);
    expect(relay["haze-vision"].relayKey).toBe(HAZE_VISION_KV_KEY);
    expect(relay.citizen.relayKey).toBe(CITIZEN_KV_KEY);
    expect(relay.social.relayKey).toBe(SOCIAL_RSS_KV_KEY);
    expect(relay.flights.relayKey).toBe(FLIGHTS_KV_KEY);
    expect(relay.arrivals.relayKey).toBe(ARRIVALS_KV_KEY);
    expect(relay["river-level"].staleAfterSec! * 1000).toBe(RIVER_LEVEL_KV_STALE_MS);
    expect(relay.rain.staleAfterSec! * 1000).toBe(RAIN_RELAY_MAX_AGE_MS);
    expect(relay.dam.staleAfterSec! * 1000).toBe(DAM_RELAY_MAX_AGE_MS);
    expect(relay.flights.staleAfterSec! * 1000).toBe(FLIGHTS_KV_STALE_MS);
    expect(relay.arrivals.staleAfterSec! * 1000).toBe(ARRIVALS_KV_STALE_MS);
    for (const id of RELAY_HEALTH_IDS) expect(relay[id], id).toBeDefined();
  });

  it("gives every live, non-relay feed with an SLO a probe", () => {
    const needProbe = TWIN_ENTITIES.filter((e) => e.transport !== "relay" && e.staleAfterSec !== null).map((e) => e.id);
    // Built by other agents; their live fields stay null until a probe lands with the module.
    const pending = new Set(["official-warnings"]);
    for (const id of needProbe) if (!pending.has(id)) expect(DIRECT_PROBE_IDS, id).toContain(id);
  });
});

describe("route coverage — unknown feed ⇒ fail", () => {
  const routes = apiRoutes();

  it("finds the routes on disk, including this manifest at /api/cnx/manifest.json", () => {
    expect(routes.length).toBeGreaterThan(30);
    expect(routes).toContain("/api/cnx/manifest.json");
  });

  it("lists every data route in the manifest or on the exclusion list", () => {
    const inManifest = new Set(TWIN_ENTITIES.map((e) => e.route));
    const uncovered = routes.filter((r) => {
      if (inManifest.has(r)) return false;
      const segments = r.replace("/api/cnx/", "").split("/");
      if (segments.at(-1) === "ingest") return false;
      return !(segments[0] in MANIFEST_EXCLUDED_ROUTES);
    });
    expect(uncovered, `add these to TWIN_ENTITIES or MANIFEST_EXCLUDED_ROUTES: ${uncovered.join(", ")}`).toEqual([]);
  });

  it("points every manifest route at a real route (except those being built elsewhere)", () => {
    const pending = new Set(["/api/cnx/official-warnings", "/api/cnx/cap.xml"]);
    for (const e of TWIN_ENTITIES) {
      if (!e.route.startsWith("/api/") || pending.has(e.route)) continue;
      expect(routes, e.id).toContain(e.route);
    }
  });

  it("does not exclude a route that is also a manifest entity", () => {
    for (const e of TWIN_ENTITIES) expect(MANIFEST_EXCLUDED_ROUTES).not.toHaveProperty(e.route.replace("/api/cnx/", ""));
  });
});

describe("SLO computation", () => {
  it("never counts a missing observation as within", () => {
    expect(sloState(3600, null, NOW)).toBe("missing");
    expect(sloState(3600, "not a date", NOW)).toBe("missing");
    expect(withinSlo("missing")).toBe(false);
  });

  it("is within up to the limit and stale past it", () => {
    expect(sloState(3600, ago(3599), NOW)).toBe("within");
    expect(sloState(3600, ago(3600), NOW)).toBe("within");
    expect(sloState(3600, ago(3601), NOW)).toBe("stale");
    expect(withinSlo("within")).toBe(true);
    expect(withinSlo("stale")).toBe(false);
  });

  it("treats a timestamp well in the future as not on time, small skew as fine", () => {
    expect(sloState(3600, ago(-60), NOW)).toBe("within");
    expect(sloState(3600, ago(-3600), NOW)).toBe("stale");
  });

  it("has no SLO for static entities", () => {
    expect(sloState(null, ago(10), NOW)).toBe("no-slo");
    expect(withinSlo("no-slo")).toBeNull();
  });

  it("counts on-time feeds only among those with an SLO", () => {
    const counts = sloCounts([
      { staleAfterSec: 600, lastObservedAt: ago(60) },
      { staleAfterSec: 600, lastObservedAt: ago(6000) },
      { staleAfterSec: 600, lastObservedAt: null },
      { staleAfterSec: null, lastObservedAt: null },
    ], NOW);
    expect(counts).toEqual({ onTime: 1, total: 3 });
  });
});

describe("buildManifest", () => {
  it("adds live fields, version, commit and generatedAt", () => {
    const m = buildManifest({ dustboy: { lastObservedAt: ago(600), provenance: "live" }, firms: { lastObservedAt: null, provenance: "scenario" } }, { nowMs: NOW, version: "1.9.0", commit: "abc1234" });
    expect(m.version).toBe("1.9.0");
    expect(m.commit).toBe("abc1234");
    expect(m.generatedAt).toBe(new Date(NOW).toISOString());
    expect(m.entities).toHaveLength(TWIN_ENTITIES.length);
    const dustboy = m.entities.find((e) => e.id === "dustboy")!;
    expect(dustboy).toMatchObject({ lastObservedAt: ago(600), provenance: "live", withinSlo: true, sloState: "within", ageSec: 600 });
    const firms = m.entities.find((e) => e.id === "firms")!;
    expect(firms).toMatchObject({ lastObservedAt: null, provenance: "scenario", withinSlo: false, sloState: "missing", ageSec: null });
    const warnings = m.entities.find((e) => e.id === "official-warnings")!;
    expect(warnings).toMatchObject({ lastObservedAt: null, provenance: null, withinSlo: false });
    expect(m.slo.onTime).toBe(1);
    expect(m.slo.total).toBe(TWIN_ENTITIES.filter((e) => e.staleAfterSec !== null).length);
  });

  it("reports the relay offline past 45 min, with the newest relay stamp", () => {
    const fresh = relayHealth({ rain: { lastObservedAt: ago(600), provenance: "relay" }, flights: { lastObservedAt: ago(30), provenance: "relay" } }, NOW);
    expect(fresh).toMatchObject({ newestAt: ago(30), ageSec: 30, offline: false, offlineAfterSec: RELAY_OFFLINE_AFTER_SEC });
    expect(fresh.feeds.map((f) => f.key)).toContain("river-level-latest");
    const dead = relayHealth({ rain: { lastObservedAt: ago(2 * 3600), provenance: "relay" } }, NOW);
    expect(dead.offline).toBe(true);
    expect(relayHealth({}, NOW)).toMatchObject({ newestAt: null, offline: true });
  });
});

describe("live probe helpers", () => {
  it("reads the relay stamp from generatedAt or the flights snapshot's fetchedAt", () => {
    expect(relayStamp(JSON.stringify({ generatedAt: "2026-10-11T04:50:00Z" }))).toBe("2026-10-11T04:50:00.000Z");
    expect(relayStamp(JSON.stringify({ fetchedAt: NOW }))).toBe(new Date(NOW).toISOString());
    expect(relayStamp(null)).toBeNull();
    expect(relayStamp("{oops")).toBeNull();
    expect(relayStamp(JSON.stringify({ generatedAt: "never" }))).toBeNull();
  });

  it("takes the newest parseable stamp and never invents one", () => {
    expect(newestIso(["2026-10-11T01:00:00Z", null, "bad", "2026-10-11T03:00:00Z"])).toBe("2026-10-11T03:00:00.000Z");
    expect(newestIso([])).toBeNull();
  });

  it("reads the frame time out of a GIBS tile URL", () => {
    expect(gibsTime("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Himawari_AHI_Band13_Clean_Infrared/default/2026-10-11T04:50:00Z/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png")).toBe("2026-10-11T04:50:00.000Z");
    expect(gibsTime(null)).toBeNull();
  });
});
