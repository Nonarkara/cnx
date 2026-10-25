/**
 * The temple-compound grammar, tested.
 *
 * The failures these guard against are not hypothetical. Each one below
 * was a live defect in this file during the build:
 *
 *   • the mean latitude was read as `p[1]` off an `{x, y}` object, so it
 *     was NaN, so the area was NaN, and `NaN < threshold` is FALSE —
 *     every one of Chiang Mai's 474 temples became a compound, including
 *     the 182 that are single shrines;
 *   • `closeRing` was handed lon/lat tuples where it expected `{x, y}`
 *     vectors, and 4,198 of 4,380 rings serialised with a last point of
 *     `{}` — malformed geometry that GeoJSON consumers must reject;
 *   • the wall was a solid slab rather than a band, so it filled the
 *     courtyard the wall is supposed to enclose;
 *   • the interior buildings were dropped except the hall and the two
 *     flanks, so Wat Chedi Luang's 41 mapped buildings became three
 *     gold boxes on a cream rectangle.
 *
 * The rule the tests encode: a measurement that is not a number is not a
 * small measurement, it is no measurement.
 */

import { describe, it, expect } from "vitest";
import {
  composeCompound,
  looksLikeChedi,
  metresPerDegreeLon,
  COMPOUND_MIN_AREA_M2,
  CITY_CENTRE_LON,
  CITY_CENTRE_LAT,
  type CompoundPart,
  type Ring,
} from "./temple-compound";

const M_LAT = 110574;
const M_LON = metresPerDegreeLon(18.7883);

/** A rectangle as a lon/lat ring, centred on the given point. */
function rectRing(lon: number, lat: number, widthM: number, heightM: number): Ring {
  const halfW = widthM / 2 / M_LON;
  const halfH = heightM / 2 / M_LAT;
  const ring: Ring = [
    [lon - halfW, lat - halfH],
    [lon + halfW, lat - halfH],
    [lon + halfW, lat + halfH],
    [lon - halfW, lat + halfH],
    [lon - halfW, lat - halfH],
  ];
  return ring;
}

/** Every coordinate of a part, exterior and holes alike. */
function allCoords(part: CompoundPart): number[] {
  return [part.ring, ...(part.holes ?? [])].flat(2);
}

function partsOfKind(parts: CompoundPart[], kind: CompoundPart["kind"]): CompoundPart[] {
  return parts.filter((p) => p.kind === kind);
}

/** A compound just north-west of the city centre, ~120 m square. */
const OLD_CITY_COMPOUND: Ring = rectRing(98.975, 18.793, 120, 120);

describe("composeCompound", () => {
  it("refuses to compose a polygon that is too small to be a compound", () => {
    // A 20 m square is a shrine, not a compound. The grammar must hand
    // it back empty so the caller renders it as the mapped building it
    // is, rather than inventing a wall around it.
    const result = composeCompound({ boundary: rectRing(98.975, 18.793, 20, 20), interiors: [] });
    expect(result.parts).toHaveLength(0);
    expect(result.evidence).toBe("single-footprint");
  });

  it("composes a compound from a compound-sized boundary", () => {
    const result = composeCompound({ boundary: OLD_CITY_COMPOUND, interiors: [] });
    expect(result.parts.length).toBeGreaterThan(0);
    expect(result.evidence).toBe("osm-boundary-only");
    expect(result.areaM2).toBeGreaterThan(COMPOUND_MIN_AREA_M2);
    for (const kind of ["wall", "court", "gate", "hall"] as const) {
      expect(partsOfKind(result.parts, kind).length).toBeGreaterThan(0);
    }
  });

  it("gives the wall a hole, so it is a band and not a slab", () => {
    const result = composeCompound({ boundary: OLD_CITY_COMPOUND, interiors: [] });
    const wall = partsOfKind(result.parts, "wall")[0];
    expect(wall.holes).toBeDefined();
    expect((wall.holes ?? []).length).toBe(1);
    // The hole is the courtyard's edge, so it must be inside the wall.
    const outer = wall.ring;
    const inner = (wall.holes ?? [])[0];
    const outerArea = Math.abs(shoelace(outer));
    const innerArea = Math.abs(shoelace(inner));
    expect(innerArea).toBeLessThan(outerArea);
  });

  it("keeps EVERY mapped interior building, not just the hall and the flanks", () => {
    // The failure this pins: Wat Chedi Luang maps 41 buildings inside
    // its boundary and the grammar kept three of them, leaving the rest
    // of the compound as bare ground.
    const interiors = Array.from({ length: 12 }, (_, i) => ({
      ring: rectRing(98.975 + (i - 6) * 0.0009, 18.793 + (i % 3) * 0.0007, 12, 10),
      height: 9,
      heightSource: "fallback" as const,
      name: `cell ${i}`,
    }));
    const result = composeCompound({ boundary: OLD_CITY_COMPOUND, interiors });
    const buildings = partsOfKind(result.parts, "hall").filter((p) => p.origin === "measured");
    expect(buildings.length).toBe(12);
    expect(result.evidence).toBe("osm-footprints");
  });

  it("marks the mapped footprints measured and the grammar's own work modelled", () => {
    const interiors = [
      { ring: rectRing(98.975, 18.7933, 20, 14), height: 7, heightSource: "osm" as const, name: "viharn" },
    ];
    const result = composeCompound({ boundary: OLD_CITY_COMPOUND, interiors });
    const measured = result.parts.filter((p) => p.origin === "measured");
    const modelled = result.parts.filter((p) => p.origin === "model");
    expect(measured.length).toBeGreaterThan(0);
    expect(modelled.length).toBeGreaterThan(0);
    // A measured building keeps the height it was given — but the roof
    // is carved out of it, so the wall is what is left and the ridge
    // lands back on the mapped total.
    const viharn = measured.find((p) => p.kind === "hall");
    expect(viharn?.heightSource).toBe("osm");
    expect(viharn!.height).toBeLessThan(7);
    // The roof that caps that wall — the modelled hall has a roof too,
    // and it is not this one.
    const roof = result.roofs.find(
      (r) => r.category === "hall" && Math.abs(r.eaves - viharn!.height) < 0.001,
    );
    expect(roof).toBeDefined();
    expect(roof!.eaves + roof!.rise).toBeCloseTo(7, 6);
    expect(roof!.eaves).toBeCloseTo(viharn!.height, 6);
  });

  it("gives every roof-capable part a pitched roof, not a slab", () => {
    const interiors = [
      { ring: rectRing(98.975, 18.7933, 20, 14), height: 7, heightSource: "osm" as const, name: "viharn" },
    ];
    const result = composeCompound({ boundary: OLD_CITY_COMPOUND, interiors });
    expect(result.roofs.length).toBeGreaterThan(0);
    for (const roof of result.roofs) {
      expect(roof.kind).toBe("gable");
      expect(roof.rise).toBeGreaterThan(0);
      expect(roof.length).toBeGreaterThan(0);
      expect(roof.width).toBeGreaterThan(0);
      expect(Number.isFinite(roof.rotation)).toBe(true);
      expect(Number.isFinite(roof.eaves)).toBe(true);
      expect(Number.isFinite(roof.centre[0])).toBe(true);
      expect(Number.isFinite(roof.centre[1])).toBe(true);
    }
    // The gate always has a roof: it is the part the approach sees.
    expect(result.roofs.some((r) => r.category === "gate")).toBe(true);
  });

  it("never emits a coordinate that is not a number", () => {
    const interiors = [
      { ring: rectRing(98.975, 18.7933, 20, 14), height: 7, heightSource: "osm" as const, name: "viharn" },
    ];
    const result = composeCompound({ boundary: OLD_CITY_COMPOUND, interiors });
    for (const part of result.parts) {
      for (const v of allCoords(part)) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("fails closed on a boundary it cannot measure", () => {
    // A broken boundary must not sail past the area test. `NaN <
    // threshold` is false, which is exactly how every one of the city's
    // 474 temples became a compound the first time this was built.
    const broken: Ring = [
      [Number.NaN, 18.79],
      [98.976, 18.79],
      [98.976, 18.791],
      [Number.NaN, 18.791],
      [Number.NaN, 18.79],
    ];
    const result = composeCompound({ boundary: broken, interiors: [] });
    expect(result.parts).toHaveLength(0);
    expect(result.evidence).toBe("single-footprint");
    expect(Number.isFinite(result.areaM2)).toBe(true);
  });

  it("puts the gate on the south side of a north–south compound", () => {
    // The Chinese form and the Lanna form agree: a wat faces south. The
    // rule must not depend on where the city happens to be — this
    // compound is north-west of the centre, and the gate still goes on
    // the south side, not on the side facing town.
    const result = composeCompound({ boundary: OLD_CITY_COMPOUND, interiors: [] });
    const gate = partsOfKind(result.parts, "gate").find((p) => p.tier === "body");
    expect(gate).toBeDefined();
    const gateLat = centroid(gate!.ring)[1];
    const compoundLat = centroid(OLD_CITY_COMPOUND)[1];
    expect(gateLat).toBeLessThan(compoundLat);
  });

  it("breaks the tie on an east–west compound by putting the gate nearest the city", () => {
    // An east–west compound has no "south end" — the axis direction's
    // north component is noise — so the city breaks the tie. This one
    // sits EAST of the centre, so its west end is the approach.
    const eastOfTown = rectRing(CITY_CENTRE_LON + 0.012, CITY_CENTRE_LAT, 200, 40);
    const result = composeCompound({ boundary: eastOfTown, interiors: [] });
    const gate = partsOfKind(result.parts, "gate").find((p) => p.tier === "body");
    expect(gate).toBeDefined();
    const gateLon = centroid(gate!.ring)[0];
    expect(gateLon).toBeLessThan(centroid(eastOfTown)[0]);
  });

  it("scales a modelled tower with its compound instead of using a fixed size", () => {
    const small = composeCompound({ boundary: rectRing(98.975, 18.793, 30, 30), interiors: [] });
    const large = composeCompound({ boundary: rectRing(98.975, 18.793, 200, 200), interiors: [] });
    const heightOf = (r: typeof small): number =>
      Math.max(...partsOfKind(r.parts, "chedi").map((p) => p.base_height + p.height));
    expect(heightOf(large)).toBeGreaterThan(heightOf(small));
  });

  it("puts a tower only where a stupa belongs", () => {
    // The walled axis with a tower in the courtyard is a Buddhist
    // monastery order — a Lanna wat and a northern Chinese Buddhist
    // temple share it. Putting a stupa in a churchyard would have the
    // grammar asserting a faith the site does not have.
    const church = composeCompound({
      boundary: OLD_CITY_COMPOUND,
      interiors: [],
      religion: "christian",
    });
    expect(partsOfKind(church.parts, "chedi")).toHaveLength(0);

    const mosque = composeCompound({
      boundary: OLD_CITY_COMPOUND,
      interiors: [],
      religion: "muslim",
    });
    expect(partsOfKind(mosque.parts, "chedi")).toHaveLength(0);

    const wat = composeCompound({
      boundary: OLD_CITY_COMPOUND,
      interiors: [],
      religion: "buddhist",
    });
    expect(partsOfKind(wat.parts, "chedi").length).toBeGreaterThan(0);
  });

  it("still gives an untagged site a tower — an absent tag is not an absent religion", () => {
    const untagged = composeCompound({
      boundary: OLD_CITY_COMPOUND,
      interiors: [],
      religion: "unknown",
    });
    expect(partsOfKind(untagged.parts, "chedi").length).toBeGreaterThan(0);
  });
});

describe("looksLikeChedi", () => {
  it("recognises the tower by its names in English and Thai", () => {
    expect(looksLikeChedi("Wat Chedi Luang Stupa")).toBe(true);
    expect(looksLikeChedi("Phra That Wat Phra Sing")).toBe(true);
    expect(looksLikeChedi("พระธาตุเจดีย์")).toBe(true);
    expect(looksLikeChedi("เจดีย์")).toBe(true);
  });

  it("does not mistake an ordinary building for a tower", () => {
    expect(looksLikeChedi("Mettasuksa School")).toBe(false);
    expect(looksLikeChedi("Pra Wihan Luang")).toBe(false);
    expect(looksLikeChedi(null)).toBe(false);
  });
});

function shoelace(ring: Ring): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}

function centroid(ring: Ring): [number, number] {
  // The closing vertex is a repeat of the first, so it must not be
  // counted twice or the centroid drifts toward that corner.
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}


describe("mapped temple height conservation", () => {
  it("keeps small outbuildings at their supplied height when no roof is drawn", () => {
    const result = composeCompound({ boundary: OLD_CITY_COMPOUND, interiors: [
      { ring: rectRing(98.975, 18.7933, 20, 14), height: 8, heightSource: "osm", name: "viharn" },
      { ring: rectRing(98.97525, 18.7928, 5, 4), height: 3, heightSource: "osm", name: "cell" },
    ] });
    const cell = result.parts.find(part => part.origin === "measured" && part.height === 3);
    expect(cell).toBeDefined();
  });
  it("subtracts roof rise from measured side halls rather than adding storeys", () => {
    const inputs = [
      { ring: rectRing(98.975, 18.793, 28, 18), height: 8, heightSource: "osm" as const, name: "viharn" },
      { ring: rectRing(98.97465, 18.793, 20, 12), height: 10, heightSource: "osm" as const, name: "school" },
      { ring: rectRing(98.97535, 18.793, 20, 12), height: 12, heightSource: "osm" as const, name: "school" },
      { ring: rectRing(98.975, 18.79335, 20, 12), height: 14, heightSource: "osm" as const, name: "school" },
      { ring: rectRing(98.975, 18.79265, 20, 12), height: 16, heightSource: "osm" as const, name: "school" },
    ];
    const result = composeCompound({ boundary: OLD_CITY_COMPOUND, interiors: inputs });
    const sides = result.parts.filter(part => part.origin === "measured" && part.kind === "side_hall");
    expect(sides.length).toBeGreaterThan(0);
    for (const side of sides) {
      const roof = result.roofs.find(candidate => candidate.category === "side_hall" && Math.abs(candidate.eaves - side.height) < 0.001);
      expect(roof).toBeDefined();
      expect(inputs.some(input => Math.abs(input.height - roof!.eaves - roof!.rise) < 0.001)).toBe(true);
    }
  });
});
