import { describe, it, expect } from "vitest";
import {
  minAreaRect,
  gableRise,
  chooseRoofKind,
  cityRoof,
  convexHull,
  GABLE_MAX_LEVELS,
  UNTAGGED_GABLE_MAX_AREA_M2,
} from "./roof";
import { metresPerDegreeLon } from "./geo";

const M_LAT = 110574;
const M_LON = metresPerDegreeLon(18.7883);

/** A rectangle as a lon/lat ring, centred on the given point. */
function rectRing(lon: number, lat: number, widthM: number, heightM: number): [number, number][] {
  const halfW = widthM / 2 / M_LON;
  const halfH = heightM / 2 / M_LAT;
  return [
    [lon - halfW, lat - halfH],
    [lon + halfW, lat - halfH],
    [lon + halfW, lat + halfH],
    [lon - halfW, lat + halfH],
    [lon - halfW, lat - halfH],
  ];
}

describe("minAreaRect", () => {
  it("measures a rectangle", () => {
    const r = minAreaRect(rectRing(98.9863, 18.7883, 20, 10));
    expect(r).not.toBeNull();
    expect(r!.length).toBeCloseTo(20, 1);
    expect(r!.width).toBeCloseTo(10, 1);
  });

  it("puts the ridge along the long side", () => {
    const wide = minAreaRect(rectRing(98.9863, 18.7883, 30, 8));
    expect(wide!.length).toBeGreaterThan(wide!.width);
    const tall = minAreaRect(rectRing(98.9863, 18.7883, 8, 30));
    expect(tall!.length).toBeGreaterThan(tall!.width);
  });

  it("finds the bearing of a rotated rectangle", () => {
    // A 20 × 10 rectangle turned 30° clockwise from north.
    const lon = 98.9863;
    const lat = 18.7883;
    const bearing = (30 * Math.PI) / 180;
    const dir = { x: Math.sin(bearing), y: Math.cos(bearing) };
    const perp = { x: -dir.y, y: dir.x };
    const corners: [number, number][] = ([
      [-10, -5],
      [10, -5],
      [10, 5],
      [-10, 5],
    ] as [number, number][]).map(([u, v]) => [
      lon + (dir.x * u + perp.x * v) / M_LON,
      lat + (dir.y * u + perp.y * v) / M_LAT,
    ]);
    const ring = [...corners, corners[0]];
    const r = minAreaRect(ring);
    expect(r).not.toBeNull();
    expect(r!.length).toBeCloseTo(20, 0);
    expect(r!.width).toBeCloseTo(10, 0);
    // The bearing is clockwise from north.
    const deg = (r!.rotation * 180) / Math.PI;
    expect(Math.abs(deg - 30)).toBeLessThan(2);
  });

  it("refuses a broken ring rather than inventing a rectangle", () => {
    expect(minAreaRect([])).toBeNull();
    expect(minAreaRect([[98.9, 18.7]])).toBeNull();
    expect(
      minAreaRect([
        [Number.NaN, 18.7],
        [98.9, Number.NaN],
        [98.91, 18.71],
      ]),
    ).toBeNull();
  });

  it("refuses a ring with no area", () => {
    const line: [number, number][] = [
      [98.9863, 18.7883],
      [98.9864, 18.7883],
      [98.9865, 18.7883],
      [98.9863, 18.7883],
    ];
    expect(minAreaRect(line)).toBeNull();
  });
});

describe("convexHull", () => {
  it("drops the points inside the hull", () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0.5, y: 0.5 },
    ]);
    expect(hull.length).toBe(4);
  });
});

describe("chooseRoofKind", () => {
  it("gives a house a gable", () => {
    expect(chooseRoofKind({ type: "house", levels: 2, areaM2: 120 }).kind).toBe("gable");
    expect(chooseRoofKind({ type: "detached", levels: null, areaM2: 90 }).kind).toBe("gable");
    expect(chooseRoofKind({ type: "terrace", levels: 3, areaM2: 200 }).kind).toBe("gable");
  });

  it("gives a block a flat roof", () => {
    expect(chooseRoofKind({ type: "apartments", levels: 8, areaM2: 900 }).kind).toBe("flat");
    expect(chooseRoofKind({ type: "industrial", levels: null, areaM2: 4000 }).kind).toBe("flat");
    expect(chooseRoofKind({ type: "warehouse", levels: null, areaM2: 3000 }).kind).toBe("flat");
  });

  it("refuses a gable above the storey limit, even for a house", () => {
    expect(
      chooseRoofKind({ type: "house", levels: GABLE_MAX_LEVELS + 1, areaM2: 120 }).kind,
    ).toBe("flat");
  });

  it("judges an untagged building by its footprint", () => {
    expect(chooseRoofKind({ type: "yes", levels: null, areaM2: 120 }).kind).toBe("gable");
    expect(chooseRoofKind({ type: null, levels: null, areaM2: 120 }).kind).toBe("gable");
    expect(
      chooseRoofKind({ type: "yes", levels: null, areaM2: UNTAGGED_GABLE_MAX_AREA_M2 + 1 }).kind,
    ).toBe("flat");
  });

  it("says why", () => {
    const why = chooseRoofKind({ type: "apartments", levels: 8, areaM2: 900 });
    expect(why.reason).toContain("apartments");
  });
});

describe("gableRise", () => {
  it("rises with the span", () => {
    expect(gableRise(10)).toBeGreaterThan(gableRise(5));
  });

  it("stays within its bounds", () => {
    expect(gableRise(0.5)).toBeGreaterThanOrEqual(1.1);
    expect(gableRise(500)).toBeLessThanOrEqual(5);
  });
});

describe("cityRoof", () => {
  it("carves the roof out of the building's height", () => {
    const r = cityRoof({ ring: rectRing(98.9863, 18.7883, 12, 8), height: 9, type: "house" });
    expect(r).not.toBeNull();
    const { roof } = r!;
    // The wall is what is left, and the ridge lands back on the height
    // OSM gave. Nothing is invented and nothing is lost.
    expect(roof.eaves + roof.rise).toBeCloseTo(roof.total, 6);
    expect(roof.total).toBeCloseTo(9, 6);
    expect(roof.eaves).toBeLessThan(9);
  });

  it("gives a house a gable and a block a flat cap", () => {
    const house = cityRoof({ ring: rectRing(98.9863, 18.7883, 12, 8), height: 9, type: "house" });
    expect(house!.roof.kind).toBe("gable");
    expect(house!.roof.rise).toBeGreaterThan(1);
    const block = cityRoof({ ring: rectRing(98.9863, 18.7883, 60, 40), height: 12, type: "apartments" });
    expect(block!.roof.kind).toBe("flat");
    expect(block!.roof.rise).toBeLessThan(0.5);
  });

  it("never lets the roof eat the whole building", () => {
    const low = cityRoof({ ring: rectRing(98.9863, 18.7883, 12, 8), height: 2, type: "house" });
    expect(low).not.toBeNull();
    expect(low!.roof.eaves).toBeGreaterThan(0);
    expect(low!.roof.eaves + low!.roof.rise).toBeLessThanOrEqual(2.0001);
  });

  it("refuses a building with no height and a ring with no area", () => {
    expect(cityRoof({ ring: rectRing(98.9863, 18.7883, 12, 8), height: 0 })).toBeNull();
    const line: [number, number][] = [
      [98.9863, 18.7883],
      [98.9864, 18.7883],
      [98.9865, 18.7883],
      [98.9863, 18.7883],
    ];
    expect(cityRoof({ ring: line, height: 9 })).toBeNull();
  });

  it("overhangs the wall a little, as a roof does", () => {
    const r = cityRoof({ ring: rectRing(98.9863, 18.7883, 12, 8), height: 9, type: "house" });
    expect(r!.roof.length).toBeGreaterThan(12);
    expect(r!.roof.width).toBeGreaterThan(8);
  });
});

describe("roof audit regressions", () => {
  it("keeps the enclosing rectangle centred when its north-south side is longest", () => {
    const fit = minAreaRect(rectRing(98.9863, 18.7883, 8, 30))!;
    expect(fit.centre[0]).toBeCloseTo(98.9863, 7);
    expect(fit.centre[1]).toBeCloseTo(18.7883, 7);
  });
  it("does not put a flat cap below ground on a very low footprint", () => {
    const fit = cityRoof({ ring: rectRing(98.9863, 18.7883, 8, 6), height: 0.1, type: "roof" })!;
    expect(fit.roof.eaves).toBeGreaterThan(0);
    expect(fit.roof.eaves + fit.roof.rise).toBeCloseTo(0.1);
  });
});
