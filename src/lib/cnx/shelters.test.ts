import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inChiangMaiProvince } from "./province-boundary";
import {
  CNX_DISTRICTS,
  haversineKm,
  isSheltersFile,
  nearestShelters,
  normaliseAmphoe,
  precisionLabel,
  sameAmphoe,
  sheltersInDistrict,
  type Shelter,
  type SheltersFile,
} from "./shelters";

function shelter(over: Partial<Shelter> = {}): Shelter {
  return {
    id: "s1",
    nameTh: "หอประชุมที่ว่าการอำเภอจอมทอง",
    amphoeTh: "จอมทอง",
    tambonTh: "บ้านหลวง",
    capacity: 300,
    electricity: true,
    water: true,
    toilets: 10,
    lat: 18.43,
    lon: 98.67,
    precision: "place",
    matchedName: "ที่ว่าการอำเภอจอมทอง",
    osm: "way/1",
    ...over,
  };
}

function file(shelters: Shelter[]): SheltersFile {
  return {
    generatedAt: "2026-10-11T00:00:00.000Z",
    source: { publisher: "สำนักงานจังหวัดเชียงใหม่", datasetUrl: "https://x", resourceUrl: "https://y", fetchedAt: null },
    geocoder: "OpenStreetMap Nominatim (ODbL)",
    counts: { total: shelters.length, place: shelters.length, tambon: 0, amphoe: 0, none: 0 },
    shelters,
  };
}

describe("isSheltersFile", () => {
  it("accepts a well-formed file", () => {
    expect(isSheltersFile(file([shelter(), shelter({ id: "s2", lat: null, lon: null, precision: "none", osm: null, matchedName: null })]))).toBe(true);
  });

  it("rejects non-objects and missing fields", () => {
    expect(isSheltersFile(null)).toBe(false);
    expect(isSheltersFile([])).toBe(false);
    expect(isSheltersFile({ ...file([]), shelters: undefined })).toBe(false);
  });

  it("rejects a shelter with an unknown precision", () => {
    expect(isSheltersFile(file([{ ...shelter(), precision: "guess" } as unknown as Shelter]))).toBe(false);
  });

  it("rejects half coordinates and located 'none' / unlocated 'place' rows", () => {
    expect(isSheltersFile(file([shelter({ lon: null })]))).toBe(false);
    expect(isSheltersFile(file([shelter({ precision: "none" })]))).toBe(false);
    expect(isSheltersFile(file([shelter({ lat: null, lon: null })]))).toBe(false);
  });

  it("rejects capacity given as a string", () => {
    expect(isSheltersFile(file([{ ...shelter(), capacity: "300" } as unknown as Shelter]))).toBe(false);
  });
});

describe("normaliseAmphoe / sameAmphoe", () => {
  it.each([
    ["อ.จอมทอง", "จอมทอง"],
    ["อำเภอจอมทอง", "จอมทอง"],
    ["จอมทอง", "จอมทอง"],
    ["Chom Thong", "จอมทอง"],
    ["Chom Thong District", "จอมทอง"],
    ["Amphoe Chom Thong", "จอมทอง"],
    ["Mueang Chiang Mai District", "เมืองเชียงใหม่"],
    ["อำเภอเมือง", "เมืองเชียงใหม่"],
    ["Omkoi", "อมก๋อย"],
    ["Om Koi District", "อมก๋อย"],
    ["Galyani Vadhana", "กัลยาณิวัฒนา"],
  ])("%s → %s", (input, expected) => {
    expect(normaliseAmphoe(input)).toBe(expected);
  });

  it("covers all 25 Chiang Mai districts", () => {
    expect(Object.keys(CNX_DISTRICTS)).toHaveLength(25);
  });

  it("does not equate different districts", () => {
    expect(sameAmphoe("แม่ริม", "Mae Rim District")).toBe(true);
    expect(sameAmphoe("แม่ริม", "Mae Taeng")).toBe(false);
  });
});

describe("sheltersInDistrict", () => {
  const list = [
    shelter({ id: "a", capacity: 300 }),
    shelter({ id: "b", capacity: 500 }),
    shelter({ id: "c", capacity: null }),
    shelter({ id: "d", amphoeTh: "ฮอด", capacity: 9999 }),
  ];

  it("filters by any spelling of the district and sorts by capacity desc, unknown last", () => {
    expect(sheltersInDistrict(list, "Chom Thong District").map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(sheltersInDistrict(list, "อ.จอมทอง").map((s) => s.id)).toEqual(["b", "a", "c"]);
  });

  it("does not mutate the input list", () => {
    const before = list.map((s) => s.id);
    sheltersInDistrict(list, "จอมทอง");
    expect(list.map((s) => s.id)).toEqual(before);
  });
});

describe("nearestShelters", () => {
  // Tha Phae Gate, old city
  const here = { lon: 98.9932, lat: 18.7877 };
  const list = [
    shelter({ id: "far", lon: 98.67, lat: 18.43 }),
    shelter({ id: "near", lon: 98.99, lat: 18.79 }),
    shelter({ id: "mid", lon: 98.95, lat: 18.91 }),
    shelter({ id: "unknown", lon: null, lat: null, precision: "none" }),
  ];

  it("orders by distance and reports km", () => {
    const out = nearestShelters(list, here.lon, here.lat, 3);
    expect(out.map((s) => s.id)).toEqual(["near", "mid", "far"]);
    expect(out[0].distanceKm).toBeLessThan(1);
    expect(out[0].distanceKm).toBeLessThan(out[1].distanceKm);
  });

  it("skips shelters without coordinates", () => {
    const out = nearestShelters(list, here.lon, here.lat, 10);
    expect(out.map((s) => s.id)).not.toContain("unknown");
    expect(out).toHaveLength(3);
  });

  it("returns nothing for bad input", () => {
    expect(nearestShelters(list, Number.NaN, here.lat, 3)).toEqual([]);
    expect(nearestShelters(list, here.lon, here.lat, 0)).toEqual([]);
  });

  it("haversine is about 111 km per degree of latitude", () => {
    expect(haversineKm(99, 18, 99, 19)).toBeCloseTo(111.2, 0);
  });
});

describe("precisionLabel", () => {
  it("has Thai and English wording for every precision", () => {
    for (const p of ["place", "tambon", "amphoe", "none"] as const) {
      expect(precisionLabel[p].th.length).toBeGreaterThan(0);
      expect(precisionLabel[p].en.length).toBeGreaterThan(0);
    }
  });
});

describe("public/data/cnx/shelters.json", () => {
  const data: unknown = JSON.parse(readFileSync("public/data/cnx/shelters.json", "utf8"));

  it("validates", () => {
    expect(isSheltersFile(data)).toBe(true);
  });

  it("counts add up", () => {
    const f = data as SheltersFile;
    const { total, place, tambon, amphoe, none } = f.counts;
    expect(total).toBe(f.shelters.length);
    expect(place + tambon + amphoe + none).toBe(total);
    for (const p of ["place", "tambon", "amphoe", "none"] as const) {
      expect(f.shelters.filter((s) => s.precision === p)).toHaveLength(f.counts[p]);
    }
  });

  it("every located shelter is inside Chiang Mai province", () => {
    const f = data as SheltersFile;
    const outside = f.shelters.filter((s) => s.lat !== null && s.lon !== null && !inChiangMaiProvince(s.lon, s.lat));
    expect(outside.map((s) => s.id)).toEqual([]);
  });

  it("ids are unique and every shelter's district is a known Chiang Mai district", () => {
    const f = data as SheltersFile;
    expect(new Set(f.shelters.map((s) => s.id)).size).toBe(f.shelters.length);
    const known = new Set(Object.keys(CNX_DISTRICTS));
    expect(f.shelters.filter((s) => !known.has(normaliseAmphoe(s.amphoeTh))).map((s) => s.amphoeTh)).toEqual([]);
  });
});
