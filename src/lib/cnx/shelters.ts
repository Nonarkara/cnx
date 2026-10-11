// Chiang Mai temporary flood shelters (ศูนย์พักพิงชั่วคราวจังหวัดเชียงใหม่).
// Data: public/data/cnx/shelters.json, built by scripts/build-cnx-shelters.mjs
// from the สำนักงานจังหวัดเชียงใหม่ list on chiangmai.gdcatalog.go.th, with
// coordinates from OpenStreetMap Nominatim (ODbL). The official list has no
// coordinates — `precision` says how each point was found, and a null
// lat/lon means no location could be verified (never guessed).
//
// Import-free on purpose so server code, client code and scripts can share it.

export type ShelterPrecision = "place" | "tambon" | "amphoe" | "none";

export interface Shelter {
  id: string;
  nameTh: string;
  amphoeTh: string;
  tambonTh: string | null;
  /** People it can host; null when the list leaves it blank or non-numeric. */
  capacity: number | null;
  electricity: boolean | null;
  water: boolean | null;
  /** Toilet count as published (the list prints 0 for many rows). */
  toilets: number | null;
  lat: number | null;
  lon: number | null;
  precision: ShelterPrecision;
  /** OSM display name of the feature the point came from. */
  matchedName: string | null;
  /** OSM element, e.g. "way/123". */
  osm: string | null;
  /** Set when the official list repeats an earlier row verbatim. */
  duplicateOf?: string;
}

export interface SheltersFile {
  generatedAt: string;
  source: { publisher: string; datasetUrl: string; resourceUrl: string; fetchedAt: string | null };
  geocoder: string;
  counts: { total: number; place: number; tambon: number; amphoe: number; none: number };
  shelters: Shelter[];
}

export interface ShelterWithDistance extends Shelter {
  lat: number;
  lon: number;
  distanceKm: number;
}

export const precisionLabel: Record<ShelterPrecision, { th: string; en: string }> = {
  place: { th: "ตำแหน่งจากแผนที่ OSM", en: "mapped location (OSM)" },
  tambon: { th: "ประมาณ — กลางตำบล", en: "approximate — subdistrict centre" },
  amphoe: { th: "ประมาณ — ระดับอำเภอ", en: "approximate — district level" },
  none: { th: "ไม่ทราบพิกัด", en: "location unknown" },
};

// ------------------------------------------------------------ districts

/** All 25 Chiang Mai districts: Thai name → English spellings seen in the wild. */
export const CNX_DISTRICTS: Readonly<Record<string, readonly string[]>> = {
  เมืองเชียงใหม่: ["Mueang Chiang Mai", "Muang Chiang Mai", "Mueang", "Muang"],
  จอมทอง: ["Chom Thong"],
  แม่แจ่ม: ["Mae Chaem", "Mae Jam"],
  เชียงดาว: ["Chiang Dao"],
  ดอยสะเก็ด: ["Doi Saket"],
  แม่แตง: ["Mae Taeng", "Mae Tang"],
  แม่ริม: ["Mae Rim"],
  สะเมิง: ["Samoeng", "Samerng"],
  ฝาง: ["Fang"],
  แม่อาย: ["Mae Ai"],
  พร้าว: ["Phrao", "Prao"],
  สันป่าตอง: ["San Pa Tong", "San Patong"],
  สันกำแพง: ["San Kamphaeng", "San Kamphaen"],
  สันทราย: ["San Sai"],
  หางดง: ["Hang Dong"],
  ฮอด: ["Hot", "Hod"],
  ดอยเต่า: ["Doi Tao"],
  อมก๋อย: ["Omkoi", "Om Koi"],
  สารภี: ["Saraphi", "Sarapee"],
  เวียงแหง: ["Wiang Haeng"],
  ไชยปราการ: ["Chai Prakan", "Chaiprakarn", "Chai Prakarn"],
  แม่วาง: ["Mae Wang"],
  แม่ออน: ["Mae On"],
  ดอยหล่อ: ["Doi Lo", "Doi Loh"],
  กัลยาณิวัฒนา: ["Galyani Vadhana", "Kalyani Vadhana", "Kanlayaniwatthana"],
};

const latinKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

const EN_TO_TH: ReadonlyMap<string, string> = new Map(
  Object.entries(CNX_DISTRICTS).flatMap(([th, ens]) => ens.map((en) => [latinKey(en), th] as const)),
);

/**
 * Canonical district key: the Thai name without "อำเภอ"/"อ." prefix.
 * "อ.จอมทอง", "อำเภอจอมทอง", "จอมทอง", "Chom Thong", "Chom Thong District"
 * and "Amphoe Chom Thong" all become "จอมทอง". Unknown names are returned
 * cleaned (prefix/suffix stripped, spaces removed) so they still compare.
 */
export function normaliseAmphoe(name: string): string {
  const t = name.normalize("NFC").trim();
  if (/[a-z]/i.test(t)) {
    const stripped = t.replace(/^(amphoe|amphur)\s+/i, "").replace(/\s+(district|amphoe)$/i, "");
    return EN_TO_TH.get(latinKey(stripped)) ?? latinKey(stripped);
  }
  const th = t.replace(/\s+/g, "").replace(/^(อำเภอ|อ\.)/, "");
  return th === "เมือง" ? "เมืองเชียงใหม่" : th;
}

export function sameAmphoe(a: string, b: string): boolean {
  return normaliseAmphoe(a) === normaliseAmphoe(b);
}

// -------------------------------------------------------------- queries

/** Shelters in one district, largest capacity first (unknown capacity last). */
export function sheltersInDistrict(list: readonly Shelter[], amphoe: string): Shelter[] {
  const key = normaliseAmphoe(amphoe);
  return list
    .filter((s) => normaliseAmphoe(s.amphoeTh) === key)
    .sort((a, b) => (b.capacity ?? -1) - (a.capacity ?? -1));
}

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The n closest shelters to (lon, lat) as the crow flies. Shelters without
 * coordinates are skipped; check `precision` before presenting a distance
 * as exact — tambon/amphoe points are approximate.
 */
export function nearestShelters(list: readonly Shelter[], lon: number, lat: number, n = 3): ShelterWithDistance[] {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || n <= 0) return [];
  return list
    .filter((s): s is Shelter & { lat: number; lon: number } => s.lat !== null && s.lon !== null)
    .map((s) => ({ ...s, distanceKm: haversineKm(lon, lat, s.lon, s.lat) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, n);
}

// ------------------------------------------------------------ validator

const PRECISIONS: ReadonlySet<string> = new Set(["place", "tambon", "amphoe", "none"]);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));
const isBoolOrNull = (v: unknown) => v === null || typeof v === "boolean";
const isStrOrNull = (v: unknown) => v === null || typeof v === "string";

export function isShelter(v: unknown): v is Shelter {
  if (!isObj(v)) return false;
  if (typeof v.id !== "string" || typeof v.nameTh !== "string" || typeof v.amphoeTh !== "string") return false;
  if (!isStrOrNull(v.tambonTh) || !isStrOrNull(v.matchedName) || !isStrOrNull(v.osm)) return false;
  if (!isNumOrNull(v.capacity) || !isNumOrNull(v.toilets)) return false;
  if (!isBoolOrNull(v.electricity) || !isBoolOrNull(v.water)) return false;
  if (typeof v.precision !== "string" || !PRECISIONS.has(v.precision)) return false;
  if (!isNumOrNull(v.lat) || !isNumOrNull(v.lon)) return false;
  // Coordinates come as a pair, and only "none" may lack them.
  if ((v.lat === null) !== (v.lon === null)) return false;
  if ((v.lat === null) !== (v.precision === "none")) return false;
  if (v.duplicateOf !== undefined && typeof v.duplicateOf !== "string") return false;
  return true;
}

export function isSheltersFile(v: unknown): v is SheltersFile {
  if (!isObj(v) || typeof v.generatedAt !== "string" || typeof v.geocoder !== "string") return false;
  const src = v.source;
  if (!isObj(src) || typeof src.publisher !== "string" || typeof src.datasetUrl !== "string") return false;
  if (typeof src.resourceUrl !== "string" || !isStrOrNull(src.fetchedAt)) return false;
  const c = v.counts;
  if (!isObj(c) || !["total", "place", "tambon", "amphoe", "none"].every((k) => typeof c[k] === "number")) return false;
  return Array.isArray(v.shelters) && v.shelters.every(isShelter);
}
