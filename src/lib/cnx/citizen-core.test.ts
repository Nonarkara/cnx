import { describe, expect, it } from "vitest";
import { detectHazeTerms, matchPlace, toCitizenReport, type GazetteerEntry, type RawPost } from "./citizen-core";

const GAZ: GazetteerEntry[] = [
  { nameTh: "อำเภอหางดง", nameEn: "Hang Dong District", lat: 18.68, lon: 98.92, kind: "district", aliases: ["หางดง", "Hang Dong"] },
  { nameTh: "ดอยสุเทพ", nameEn: "Doi Suthep", lat: 18.8, lon: 98.92, kind: "landmark", aliases: ["ดอยสุเทพ", "Doi Suthep"] },
  { nameTh: "อำเภอสันทราย", nameEn: "San Sai District", lat: 18.85, lon: 99.04, kind: "district", aliases: ["สันทราย", "San Sai"] },
  { nameTh: "ตำบลสันทรายน้อย", nameEn: "San Sai Noi", lat: 18.84, lon: 99.05, kind: "subdistrict", aliases: ["สันทรายน้อย", "San Sai Noi"] },
];

describe("detectHazeTerms", () => {
  it("finds Thai and English haze vocabulary", () => {
    expect(detectHazeTerms("ฝุ่นหนามาก มองไม่เห็นดอยสุเทพ")).toContain("ฝุ่น");
    expect(detectHazeTerms("The smoke is terrible today, AQI 180")).toEqual(expect.arrayContaining(["smoke", "aqi"]));
  });

  it("ignores off-topic posts and partial-word matches", () => {
    expect(detectHazeTerms("Best khao soi near Nimman?")).toEqual([]);
    expect(detectHazeTerms("Any chaqi tea shops?")).toEqual([]);
    expect(detectHazeTerms("The restaurant caught fire")).toEqual([]);
  });
});

describe("matchPlace", () => {
  it("prefers the longest (most specific) name", () => {
    expect(matchPlace("ควันไฟที่สันทรายน้อยตั้งแต่เช้า", GAZ)?.nameEn).toBe("San Sai Noi");
  });

  it("matches English names on word boundaries, case-insensitively", () => {
    const p = matchPlace("can't even see doi suthep from the old city", GAZ);
    expect(p).toMatchObject({ kind: "landmark", precisionKm: 1 });
  });

  it("reports district-level precision for district mentions", () => {
    expect(matchPlace("Hang Dong is smoky", GAZ)?.precisionKm).toBe(15);
  });

  it("falls back to the coarsest place when several share the same name", () => {
    const gaz: GazetteerEntry[] = [
      { nameTh: "บ้านจอมทอง", nameEn: "Ban Chomthong", lat: 18.1, lon: 98.1, kind: "neighbourhood", aliases: ["จอมทอง"] },
      { nameTh: "อำเภอจอมทอง", nameEn: "Chom Thong District", lat: 18.4, lon: 98.6, kind: "district", aliases: ["จอมทอง"] },
    ];
    expect(matchPlace("ส่งมอบเครื่องกรองอากาศ รพ.จอมทอง", gaz)?.nameEn).toBe("Chom Thong District");
  });

  it("returns null when no known place is named", () => {
    expect(matchPlace("so much smoke everywhere", GAZ)).toBeNull();
  });
});

describe("toCitizenReport", () => {
  const post: RawPost = { id: "r1", source: "reddit", title: "Haze over Hang Dong", body: "", url: "https://example.org", publishedAt: "2026-03-01T00:00:00Z" };

  it("keeps haze posts with their place", () => {
    expect(toCitizenReport(post, GAZ)?.place?.nameEn).toBe("Hang Dong District");
  });

  it("drops national news that never mentions Chiang Mai", () => {
    const news = { ...post, source: "news" as const, title: "Chickens in Malaysia lay fewer eggs — is haze to blame?" };
    expect(toCitizenReport(news, GAZ)).toBeNull();
    expect(toCitizenReport({ ...news, title: "PM2.5 ฝุ่นเชียงใหม่พุ่ง" }, GAZ)).not.toBeNull();
  });

  it("drops posts that are not about haze", () => {
    expect(toCitizenReport({ ...post, title: "Coworking in Hang Dong?" }, GAZ)).toBeNull();
  });
});
