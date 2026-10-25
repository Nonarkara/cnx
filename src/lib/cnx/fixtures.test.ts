/**
 * Baked fixtures under `public/data/cnx/` must parse as RFC 7946
 * GeoJSON — and the coordinate order must be `[lon, lat]`, not the
 * Overpass-native `{lat, lon}` shape that broke the 3D layer once.
 *
 * These tests are the regression catch: if a future extraction script
 * writes `[{lat:...}, {lon:...}]` instead of `[[lon,lat], ...]`, the
 * MapLibre fill-extrusion would render nothing and the dashboard
 * would silently look 2D.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const DATA_DIR = resolve(process.cwd(), "public/data/cnx");

function loadGeoJson(filename: string): {
  type: string;
  features: Array<{
    type: string;
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown };
  }>;
} {
  const path = resolve(DATA_DIR, filename);
  if (!existsSync(path)) {
    throw new Error(`fixture missing: ${path} — run npm run fetch:opendata + scripts/fetch-cnx-buildings-3d.mjs`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("buildings-core.geojson", () => {
  const data = loadGeoJson("buildings-core.geojson");
  it("is a valid FeatureCollection", () => {
    expect(data.type).toBe("FeatureCollection");
    expect(Array.isArray(data.features)).toBe(true);
    expect(data.features.length).toBeGreaterThan(1000);
  });

  it("emits Polygon geometries (not raw `{lat, lon}` objects)", () => {
    const sample = data.features[0];
    expect(sample.geometry.type).toBe("Polygon");
    expect(Array.isArray(sample.geometry.coordinates)).toBe(true);
    const ring = (sample.geometry.coordinates as number[][][])[0];
    const [first] = ring;
    expect(Array.isArray(first)).toBe(true);
    expect(first).toHaveLength(2);
  });

  it("uses `[lon, lat]` ordering (RFC 7946), not `[lat, lon]`", () => {
    // Chiang Mai sits at ~98.98°E, 18.79°N. Longitude must be > latitude.
    const sample = data.features[0];
    const ring = (sample.geometry.coordinates as number[][][])[0];
    const [first] = ring;
    const [a, b] = first as number[];
    // Both numbers are between -180 and 180, but longitude must be > 90 for Chiang Mai.
    expect(Math.abs(a)).toBeGreaterThan(90);
    expect(Math.abs(b)).toBeLessThan(20);
    expect(Math.abs(a)).toBeGreaterThan(Math.abs(b));
  });
});

describe("temples.geojson", () => {
  const data = loadGeoJson("temples.geojson");

  it("is a valid FeatureCollection of wat polygons", () => {
    expect(data.type).toBe("FeatureCollection");
    expect(data.features.length).toBeGreaterThan(100);
    for (const f of data.features.slice(0, 20)) {
      expect(f.properties.kind).toBe("temple");
    }
  });
});

describe("temple-compounds.geojson", () => {
  const data = loadGeoJson("temple-compounds.geojson");
  const temples = loadGeoJson("temples.geojson");

  it("is a valid FeatureCollection of compound parts", () => {
    expect(data.type).toBe("FeatureCollection");
    expect(data.features.length).toBeGreaterThan(1000);
  });

  it("never emits a coordinate that is not a number", () => {
    // The first bake closed each ring AFTER converting it to lon/lat,
    // where the closing helper expected vectors — so 4,198 of 4,380
    // rings ended with a point of `{}`. A malformed polygon is one a
    // GeoJSON consumer must reject, and the map would silently drop
    // the layer. Every coordinate has to be a real number.
    for (const f of data.features) {
      const rings = (f.geometry.coordinates as number[][][]) ?? [];
      for (const ring of rings) {
        for (const point of ring) {
          expect(Array.isArray(point)).toBe(true);
          expect(point).toHaveLength(2);
          expect(Number.isFinite(point[0])).toBe(true);
          expect(Number.isFinite(point[1])).toBe(true);
        }
      }
    }
  });

  it("closes every ring", () => {
    for (const f of data.features) {
      const rings = (f.geometry.coordinates as number[][][]) ?? [];
      for (const ring of rings) {
        expect(ring[0][0]).toBe(ring[ring.length - 1][0]);
        expect(ring[0][1]).toBe(ring[ring.length - 1][1]);
      }
    }
  });

  it("uses `[lon, lat]` ordering (RFC 7946), not `[lat, lon]`", () => {
    const sample = data.features[0];
    const ring = (sample.geometry.coordinates as number[][][])[0];
    const [first] = ring;
    const [a, b] = first as number[];
    expect(Math.abs(a)).toBeGreaterThan(90);
    expect(Math.abs(b)).toBeLessThan(20);
  });

  it("declares what every part is and where it came from", () => {
    // A part with no provenance is a part the operator cannot trust.
    for (const f of data.features) {
      const p = f.properties;
      expect(typeof p.part).toBe("string");
      expect(["measured", "model"]).toContain(p.origin);
      expect(["osm", "fallback", "grammar"]).toContain(p.height_source);
      expect(["osm-footprints", "osm-boundary-only", "single-footprint"]).toContain(p.evidence);
      expect(Number.isFinite(Number(p.height))).toBe(true);
    }
  });

  it("gives every wall a hole, so it is a band and not a slab", () => {
    const walls = data.features.filter((f) => f.properties.part === "wall");
    expect(walls.length).toBeGreaterThan(100);
    for (const w of walls) {
      expect((w.geometry.coordinates as number[][][]).length).toBe(2);
    }
  });

  it("carries every mapped temple — none is silently dropped", () => {
    // A temple that vanishes from the layer reads on the map as "there
    // is no wat here", which is the absence-is-not-evidence failure
    // this board treats as fatal. Every mapped place of worship must
    // still be present, as a compound or as a single building.
    const inCompound = new Set(data.features.map((f) => String(f.properties.compound_id)));
    for (const t of temples.features) {
      const id = String(t.properties.id);
      expect(inCompound.has(id)).toBe(true);
    }
  });
});

describe("walls.geojson", () => {
  const data = loadGeoJson("walls.geojson");

  it("captures the Old City gates", () => {
    // Wall properties may carry the name in `name`, `name_en`, or
    // `name_th` depending on which OSM contributor tagged it; check all.
    const names = data.features.flatMap((f) => {
      const p = f.properties;
      return [p.name, p.name_en, p.name_th].filter(Boolean) as string[];
    });
    const knownGates = ["Suan Dok Gate", "Chaeng Siphum", "Chaeng Ku Hueang", "Chaeng Hua Lin", "Chaeng Katam"];
    const hits = knownGates.filter((g) =>
      names.some((n) => n.includes(g.split(" ")[0]) || n.includes(g.split(" ")[0].toLowerCase())),
    );
    expect(hits.length).toBeGreaterThanOrEqual(3);
    expect(data.features.length).toBeGreaterThan(5);
  });
});

describe("waterways.geojson", () => {
  const data = loadGeoJson("waterways.geojson");

  it("is a FeatureCollection with rivers + streams", () => {
    expect(data.type).toBe("FeatureCollection");
    expect(data.features.length).toBeGreaterThan(500);
    const categories = new Set(data.features.map((f) => f.properties.category));
    expect(categories.has("river")).toBe(true);
    expect(categories.has("stream")).toBe(true);
  });
});

describe("bus-routes.geojson", () => {
  // The CNX bus routes file is NOT a FeatureCollection — it has the
  // shape `{ meta, routes, stops }` because the OSM Overpass relation
  // response doesn't naturally flatten to GeoJSON. The waterways.ts
  // and bus-routes.ts modules both handle this shape (the test
  // catches regressions where a future script writes bad JSON).
  const data = JSON.parse(
    readFileSync(resolve(DATA_DIR, "bus-routes.geojson"), "utf8"),
  ) as {
    meta: { generatedAt: string };
    routes: Array<{ id: string; ref: string; colour: string }>;
    stops: Array<{ id: string }>;
  };

  it("has the routes/stops/meta shape and a hex colour", () => {
    expect(data.meta).toBeDefined();
    expect(typeof data.meta.generatedAt).toBe("string");
    expect(data.routes.length).toBeGreaterThan(5);
    expect(data.stops.length).toBeGreaterThan(50);
    const first = data.routes[0];
    expect(first.colour).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(first.ref.length).toBeGreaterThan(0);
  });
});

describe("open-data/index.json", () => {
  const data = loadGeoJson("open-data/index.json") as unknown as {
    totalDatasets: number;
    datasets: Array<{ id: string; titleTh?: string; nameTh?: string; nameEn?: string }>;
  };

  it("holds the whole catalogue, not the partial one the old bake published", () => {
    // The 2 Oct 2026 bake published 316 of 682 because a failed search was
    // swallowed. A floor of 300 could not see that; 500 sits well above the
    // partial figure and still leaves headroom for ordinary drift in
    // data.go.th. The exact count is pinned by open-data-snapshot.test.ts.
    expect(data.totalDatasets).toBeGreaterThanOrEqual(500);
    expect(data.datasets.length).toBeGreaterThanOrEqual(500);
  });

  it("each dataset has an id and a Thai title (or fallback to nameTh)", () => {
    for (const d of data.datasets.slice(0, 50)) {
      expect(typeof d.id).toBe("string");
      expect((d.titleTh ?? d.nameTh ?? "").length).toBeGreaterThan(0);
    }
  });
});

describe("the roof tables", () => {
  function loadRoofs(filename: string): {
    version: number;
    note: string;
    columns: string[];
    kinds: string[];
    groups: string[];
    categories: string[];
    rows: number[][];
  } {
    const path = resolve(DATA_DIR, filename);
    if (!existsSync(path)) {
      throw new Error(`fixture missing: ${path} — run scripts/build-cnx-roofs.mjs`);
    }
    return JSON.parse(readFileSync(path, "utf8"));
  }

  const city = loadRoofs("roofs-city.json");
  const temple = loadRoofs("roofs-temple.json");

  it("declares its columns, and every row has one value per column", () => {
    for (const table of [city, temple]) {
      expect(table.version).toBe(1);
      expect(table.columns).toEqual([
        "lon",
        "lat",
        "length",
        "width",
        "rotation",
        "eaves",
        "rise",
        "kind",
        "group",
        "category",
      ]);
      for (const row of table.rows) expect(row).toHaveLength(table.columns.length);
    }
  });

  it("says where the roof form came from", () => {
    // The form is a model; the note has to say so, because a reader
    // of the file has no other way to know.
    for (const table of [city, temple]) {
      expect(table.note.length).toBeGreaterThan(100);
      expect(table.note).toContain("model");
      expect(table.note).toContain("OSM");
    }
  });

  it("never emits a number that is not a number", () => {
    for (const table of [city, temple]) {
      for (const row of table.rows) {
        for (const value of row) expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("gives every roof a size and a place", () => {
    for (const table of [city, temple]) {
      for (const row of table.rows) {
        expect(row[2]).toBeGreaterThan(0); // length
        expect(row[3]).toBeGreaterThan(0); // width
        expect(row[5]).toBeGreaterThan(0); // eaves
        expect(row[6]).toBeGreaterThan(0); // rise
        expect(Math.abs(row[0])).toBeGreaterThan(90); // lon
        expect(Math.abs(row[1])).toBeLessThan(20); // lat
      }
    }
  });

  it("carries a roof for every building in the city", () => {
    const buildings = loadGeoJson("buildings-core.geojson");
    const wide = loadGeoJson("buildings-wide.geojson");
    expect(city.rows.length).toBe(buildings.features.length + wide.features.length);
  });

  it("carries a roof for every temple compound", () => {
    const compounds = loadGeoJson("temple-compounds.geojson");
    const meta = (compounds as unknown as { meta?: { roofs?: { rows?: number[][] } } }).meta;
    expect(meta?.roofs?.rows?.length ?? 0).toBe(temple.rows.length);
    expect(temple.rows.length).toBeGreaterThan(1000);
  });

  it("draws the temple roofs in the temple group and the city roofs in theirs", () => {
    for (const row of temple.rows) expect(temple.groups[row[8]]).toBe("temple");
    for (const row of city.rows) expect(city.groups[row[8]]).not.toBe("temple");
  });

  it("has both roof kinds, and says which is which", () => {
    for (const table of [city, temple]) {
      expect(table.kinds).toEqual(["gable", "flat"]);
      const kinds = new Set(table.rows.map((r) => table.kinds[r[7]]));
      expect(kinds.has("gable")).toBe(true);
    }
    // The city is mostly gabled and a minority flat, which is the rule
    // the board states.
    const gables = city.rows.filter((r) => city.kinds[r[7]] === "gable").length;
    expect(gables / city.rows.length).toBeGreaterThan(0.7);
    expect(gables / city.rows.length).toBeLessThan(0.95);
  });
});

describe("temple roof failure fallback", () => {
  const compounds = loadGeoJson("temple-compounds.geojson");
  it("persists full top heights and removable roof rises for every native part", () => {
    for (const feature of compounds.features) {
      const part = feature.properties;
      expect(typeof part.total_height).toBe("number");
      expect(typeof part.roof_rise).toBe("number");
      expect(Number(part.height)).toBeGreaterThan(Number(part.base_height));
      expect(Number(part.total_height)).toBeCloseTo(Number(part.height) + Number(part.roof_rise), 6);
    }
    expect(compounds.features.some(feature => Number(feature.properties.roof_rise) > 0)).toBe(true);
  });
  it("can restore every standalone and stepped roof ridge from the native fallback", () => {
    const table = JSON.parse(readFileSync(resolve(DATA_DIR, "roofs-temple.json"), "utf8"));
    for (const row of table.rows as number[][]) {
      const [lon, lat, , , , eaves, rise] = row;
      const category = table.categories[row[9]];
      const candidates = compounds.features.filter(feature => {
        if (feature.properties.part !== category) return false;
        const ring = (feature.geometry.coordinates as number[][][])[0];
        return lon >= Math.min(...ring.map(point => point[0])) - 1e-6 && lon <= Math.max(...ring.map(point => point[0])) + 1e-6 &&
          lat >= Math.min(...ring.map(point => point[1])) - 1e-6 && lat <= Math.max(...ring.map(point => point[1])) + 1e-6;
      });
      expect(candidates.some(feature => Number(feature.properties.total_height) >= eaves + rise - 0.02)).toBe(true);
    }
  });
});
