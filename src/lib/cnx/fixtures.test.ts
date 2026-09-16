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

  it("reaches 311 datasets on the typical fetch", () => {
    expect(data.totalDatasets).toBeGreaterThanOrEqual(300);
    expect(data.datasets.length).toBeGreaterThanOrEqual(300);
  });

  it("each dataset has an id and a Thai title (or fallback to nameTh)", () => {
    for (const d of data.datasets.slice(0, 50)) {
      expect(typeof d.id).toBe("string");
      expect((d.titleTh ?? d.nameTh ?? "").length).toBeGreaterThan(0);
    }
  });
});
