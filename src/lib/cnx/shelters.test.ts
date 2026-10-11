import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyOfficialLocations,
  OFFICIAL_HEADER,
  parseOfficialLocations,
  VERIFY_HEADER,
} from "../../../scripts/build-cnx-shelters.mjs";
import { inChiangMaiProvince } from "./province-boundary";
import {
  CNX_DISTRICTS,
  haversineKm,
  isSheltersFile,
  nearestShelters,
  normaliseAmphoe,
  precisionLabel,
  sameAmphoe,
  SHELTER_PRECISIONS,
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
    counts: { total: shelters.length, official: 0, place: shelters.length, tambon: 0, amphoe: 0, none: 0 },
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

  it("accepts an official point only with verifiedBy and verifiedAt", () => {
    const official = shelter({ precision: "official", basis: "official", osm: null, matchedName: null });
    expect(isSheltersFile(file([{ ...official, verifiedBy: "อำเภอจอมทอง", verifiedAt: "2026-10-20" }]))).toBe(true);
    expect(isSheltersFile(file([official]))).toBe(false);
    expect(isSheltersFile(file([{ ...official, verifiedBy: "", verifiedAt: "2026-10-20" }]))).toBe(false);
    expect(isSheltersFile(file([{ ...official, verifiedBy: "x", verifiedAt: "2026-10-20", lat: null, lon: null }]))).toBe(false);
  });

  it("rejects an unknown tambonCheck", () => {
    expect(isSheltersFile(file([{ ...shelter(), tambonCheck: "probably" } as unknown as Shelter]))).toBe(false);
    expect(isSheltersFile(file([shelter({ tambonCheck: "unverified" })]))).toBe(true);
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
    for (const p of SHELTER_PRECISIONS) {
      expect(precisionLabel[p].th.length).toBeGreaterThan(0);
      expect(precisionLabel[p].en.length).toBeGreaterThan(0);
    }
  });

  it("labels officially confirmed points", () => {
    expect(precisionLabel.official).toEqual({ th: "พิกัดยืนยันโดยหน่วยงาน", en: "officially verified location" });
  });
});

describe("official corrections (data/shelter-locations.csv)", () => {
  const header = OFFICIAL_HEADER.join(",");
  const row = (over: Partial<Record<(typeof OFFICIAL_HEADER)[number], string>> = {}) => {
    const r: Record<string, string> = {
      id: "cm-shelter-001",
      nameTh: "หอประชุมที่ว่าการอำเภอจอมทอง",
      lat: "18.4321",
      lon: "98.6712",
      source: "สำรวจภาคสนาม",
      verifiedBy: "ที่ทำการปกครองอำเภอจอมทอง",
      verifiedAt: "2026-10-20",
      ...over,
    };
    return OFFICIAL_HEADER.map((k: string) => r[k]).join(",");
  };
  const ok = { inProvince: () => true, inDistrict: () => true };

  it("the committed file is valid (header only until an office sends points)", () => {
    const parsed = parseOfficialLocations(readFileSync("data/shelter-locations.csv", "utf8"));
    expect(parsed.errors).toEqual([]);
  });

  it("parses a good row and tolerates an Excel BOM", () => {
    const parsed = parseOfficialLocations(`\uFEFF${header}\r\n${row({ id: "cm-shelter-004" })}\r\n`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ id: "cm-shelter-004", lat: 18.4321, lon: 98.6712 });
  });

  it("reports bad ids, coordinates, missing verifier, bad dates, repeats and wrong headers", () => {
    const bad = parseOfficialLocations(
      [
        header,
        row({ id: "4" }),
        row({ id: "cm-shelter-001", lat: "abc" }),
        row({ id: "cm-shelter-002", verifiedBy: "" }),
        row({ id: "cm-shelter-003", verifiedAt: "20/10/2569" }),
        row({ id: "cm-shelter-005" }),
        row({ id: "cm-shelter-005" }),
      ].join("\n"),
    );
    expect(bad.rows.map((r: { id: string }) => r.id)).toEqual(["cm-shelter-005"]);
    expect(bad.errors).toHaveLength(5);
    expect(parseOfficialLocations("id,lat,lon\n").errors).toHaveLength(1);
  });

  it("prefers the official point over any geocode and drops the OSM trail", () => {
    const geocoded = [
      shelter({ id: "cm-shelter-001", basis: "osm-building", tambonCheck: "unverified", duplicateOf: "cm-shelter-000" }),
      shelter({ id: "cm-shelter-002" }),
    ];
    const parsed = parseOfficialLocations(`${header}\n${row()}`);
    const { shelters, errors } = applyOfficialLocations(geocoded, parsed.rows, ok);
    expect(errors).toEqual([]);
    expect(shelters[0]).toMatchObject({
      id: "cm-shelter-001",
      precision: "official",
      basis: "official",
      lat: 18.4321,
      lon: 98.6712,
      osm: null,
      matchedName: null,
      verifiedBy: "ที่ทำการปกครองอำเภอจอมทอง",
      verifiedAt: "2026-10-20",
      duplicateOf: "cm-shelter-000",
    });
    expect(shelters[0].tambonCheck).toBeUndefined();
    expect(shelters[1]).toEqual(geocoded[1]);
    expect(geocoded[0].precision).toBe("place"); // input not mutated
    expect(isSheltersFile(file(shelters))).toBe(true);
  });

  it("refuses a row for an unknown id, a renamed shelter, or a point outside the province or district", () => {
    const geocoded = [shelter({ id: "cm-shelter-001" })];
    const apply = (r: string, checks = ok) => applyOfficialLocations(geocoded, parseOfficialLocations(`${header}\n${r}`).rows, checks);
    expect(apply(row({ id: "cm-shelter-999" })).errors[0]).toMatch(/no such shelter/);
    expect(apply(row({ nameTh: "วัดอื่น" })).errors[0]).toMatch(/nameTh/);
    expect(apply(row(), { ...ok, inProvince: () => false }).errors[0]).toMatch(/outside Chiang Mai/);
    expect(apply(row(), { ...ok, inDistrict: () => false }).errors[0]).toMatch(/outside อำเภอจอมทอง/);
    expect(apply(row(), { ...ok, inDistrict: () => false }).shelters[0].precision).toBe("place");
  });
});

describe("public/data/cnx/shelters.json", () => {
  const data: unknown = JSON.parse(readFileSync("public/data/cnx/shelters.json", "utf8"));

  it("validates", () => {
    expect(isSheltersFile(data)).toBe(true);
  });

  it("counts add up", () => {
    const f = data as SheltersFile;
    expect(f.counts.total).toBe(f.shelters.length);
    expect(SHELTER_PRECISIONS.reduce((n, p) => n + f.counts[p], 0)).toBe(f.counts.total);
    for (const p of SHELTER_PRECISIONS) {
      expect(f.shelters.filter((s) => s.precision === p)).toHaveLength(f.counts[p]);
    }
  });

  it("building-level points say how they were found and never contradict an OSM ตำบล polygon", () => {
    const f = data as SheltersFile;
    const places = f.shelters.filter((s) => s.precision === "place");
    expect(places.filter((s) => s.basis !== "osm-building" || !s.tambonCheck).map((s) => s.id)).toEqual([]);
    expect(places.filter((s) => s.tambonCheck === "outside").map((s) => s.id)).toEqual([]);
  });

  it("building-level points are not stacked: at most 2 distinct rows share one coordinate", () => {
    // Approximate (tambon/amphoe) points share a subdistrict or district
    // point by design; exact points may coincide only when two rows name
    // the same building (e.g. วัดท่าตอน and ศาลาวัดท่าตอน).
    const MAX_SHARED_EXACT = 2;
    const f = data as SheltersFile;
    const groups = new Map<string, Shelter[]>();
    for (const s of f.shelters) {
      if (s.lat === null || s.duplicateOf) continue;
      const k = `${s.lat},${s.lon}`;
      groups.set(k, [...(groups.get(k) ?? []), s]);
    }
    const shared = [...groups.values()].filter((g) => g.length > 1);
    const exactStacks = shared.filter((g) => g.some((s) => s.precision === "place" || s.precision === "official"));
    const tooMany = exactStacks.filter((g) => g.filter((s) => s.precision === "place" || s.precision === "official").length > MAX_SHARED_EXACT);
    expect(tooMany.map((g) => g.map((s) => s.id))).toEqual([]);
    // Every stacked group of approximate points is labelled approximate.
    for (const g of shared.filter((x) => !exactStacks.includes(x))) {
      expect(g.every((s) => s.precision === "tambon" || s.precision === "amphoe")).toBe(true);
    }
  });

  it("every located shelter is inside Chiang Mai province", () => {
    const f = data as SheltersFile;
    const outside = f.shelters.filter((s) => s.lat !== null && s.lon !== null && !inChiangMaiProvince(s.lon, s.lat));
    expect(outside.map((s) => s.id)).toEqual([]);
  });

  it("shelters-to-verify.csv lists every non-official, non-repeated shelter", () => {
    const f = data as SheltersFile;
    const lines = readFileSync("public/data/cnx/shelters-to-verify.csv", "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
    expect(lines[0]).toBe(VERIFY_HEADER.join(","));
    expect(lines.length - 1).toBe(f.shelters.filter((s) => s.precision !== "official" && !s.duplicateOf).length);
  });

  it("ids are unique and every shelter's district is a known Chiang Mai district", () => {
    const f = data as SheltersFile;
    expect(new Set(f.shelters.map((s) => s.id)).size).toBe(f.shelters.length);
    const known = new Set(Object.keys(CNX_DISTRICTS));
    expect(f.shelters.filter((s) => !known.has(normaliseAmphoe(s.amphoeTh))).map((s) => s.amphoeTh)).toEqual([]);
  });
});
