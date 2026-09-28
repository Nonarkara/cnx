// Citizen / local-media haze reports — pure topic detection and place
// matching, no I/O. Imported by the relay (scripts/citizen-reports.mjs)
// under Node's native TypeScript stripping, so: no imports, erasable
// types only.
//
// A post is kept when it mentions haze, smoke, PM2.5 or burning. It is
// pinned only when it names a place in the Chiang Mai gazetteer
// (public/data/cnx/gazetteer.json, built from OpenStreetMap); the pin sits
// on that place's centroid and carries its precision, so a district-level
// mention is never drawn as if it were a street address.

export type PlaceKind = "landmark" | "neighbourhood" | "subdistrict" | "district";

export interface GazetteerEntry {
  nameTh: string;
  nameEn: string;
  lat: number;
  lon: number;
  kind: PlaceKind;
  aliases: string[];
}

export interface PlacedMention {
  nameTh: string;
  nameEn: string;
  lat: number;
  lon: number;
  kind: PlaceKind;
  /** Rough radius the true location falls within, in km. */
  precisionKm: number;
  /** The text that matched. */
  matched: string;
}

export type ReportSource = "reddit" | "news";

export interface RawPost {
  id: string;
  source: ReportSource;
  title: string;
  body: string;
  url: string;
  publishedAt: string;
}

export interface CitizenReport {
  id: string;
  source: ReportSource;
  title: string;
  url: string;
  publishedAt: string;
  terms: string[];
  place: PlacedMention | null;
}

const PRECISION_KM: Record<PlaceKind, number> = {
  landmark: 1,
  neighbourhood: 1.5,
  subdistrict: 5,
  district: 15,
};

const SPECIFICITY: Record<PlaceKind, number> = { landmark: 3, neighbourhood: 2, subdistrict: 1, district: 0 };

const TERMS_TH = ["ฝุ่น", "หมอกควัน", "ควันไฟ", "ไฟป่า", "เผาป่า", "การเผา", "ค่าฝุ่น", "แสบตา", "แสบจมูก", "มลพิษทางอากาศ"];
const TERMS_EN = [
  "smoke",
  "smoky",
  "haze",
  "hazy",
  "smog",
  "pm2.5",
  "pm 2.5",
  "pm25",
  "air quality",
  "aqi",
  "burning season",
  "wildfire",
  "forest fire",
  "crop burning",
  "air purifier",
];

/** Returns the haze-related terms found, empty when the post is off-topic. */
export function detectHazeTerms(text: string): string[] {
  const lower = text.toLowerCase();
  const found = TERMS_TH.filter((t) => text.includes(t));
  for (const t of TERMS_EN) {
    const re = new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
    if (re.test(lower)) found.push(t);
  }
  return found;
}

const THAI = /[฀-๿]/;

function aliasMatches(textLower: string, text: string, alias: string): boolean {
  if (THAI.test(alias)) return text.includes(alias);
  const a = alias.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${a}([^a-z0-9]|$)`).test(textLower);
}

/** Place named in the text. The longest matching alias wins; between
 *  different aliases of equal length the finer place wins. When several
 *  places share the very same name (บ้านจอมทอง vs อำเภอจอมทอง) the text
 *  can't tell them apart, so the coarsest wins — an honest, wider pin. */
export function matchPlace(text: string, gazetteer: GazetteerEntry[]): PlacedMention | null {
  const lower = text.toLowerCase();
  let best: { entry: GazetteerEntry; alias: string } | null = null;
  for (const entry of gazetteer) {
    for (const alias of entry.aliases) {
      if (!aliasMatches(lower, text, alias)) continue;
      const sameName = best !== null && alias.toLowerCase() === best.alias.toLowerCase();
      const better =
        !best ||
        alias.length > best.alias.length ||
        (alias.length === best.alias.length &&
          (sameName
            ? SPECIFICITY[entry.kind] < SPECIFICITY[best.entry.kind]
            : SPECIFICITY[entry.kind] > SPECIFICITY[best.entry.kind]));
      if (better) best = { entry, alias };
    }
  }
  if (!best) return null;
  const { entry, alias } = best;
  return {
    nameTh: entry.nameTh,
    nameEn: entry.nameEn,
    lat: entry.lat,
    lon: entry.lon,
    kind: entry.kind,
    precisionKm: PRECISION_KM[entry.kind],
    matched: alias,
  };
}

const CHIANG_MAI = /เชียงใหม่|chiang\s?mai/i;

/** Null when the post is not about haze — or, for news (searched
 *  nationally), not about Chiang Mai: it must name the province or a
 *  place in it. Reddit r/chiangmai posts are local by construction. */
export function toCitizenReport(post: RawPost, gazetteer: GazetteerEntry[]): CitizenReport | null {
  const text = `${post.title}\n${post.body}`;
  const terms = detectHazeTerms(text);
  if (terms.length === 0) return null;
  const place = matchPlace(text, gazetteer);
  if (post.source === "news" && !place && !CHIANG_MAI.test(text)) return null;
  return {
    id: post.id,
    source: post.source,
    title: post.title.slice(0, 300),
    url: post.url,
    publishedAt: post.publishedAt,
    terms,
    place,
  };
}
