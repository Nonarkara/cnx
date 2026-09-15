// CNX heritage overlay — curated top heritage sites in Chiang Mai.
//
// Sources: Wikidata (P31 = Q178561 / temple) bbox'd to the CNX bbox,
// joined with curated brief descriptions from TAT's
// "100 Places to Visit in Chiang Mai" pamphlet and the Chiang Mai
// city cultural office listings.
//
// Until a Wikidata SPARQL endpoint is wired, the list is the curated
// scenario set. The OSM heritage fetch
// (`scripts/fetch-heritage-osm-cnx.mjs`) extends this with Buddhist
// temples from the Overpass API for the Old City moat ring.

import type { CnxHeritageSite } from "../../types/cnx";

const HERITAGE: CnxHeritageSite[] = [
  // ── Old City moat ring ────────────────────────────────────────
  {
    id: "wat-phra-singh",
    name: "Wat Phra Singh",
    nameTh: "วัดพระสิงห์",
    category: "temple",
    longitude: 98.9867,
    latitude: 18.7895,
    builtYear: 1345,
    brief: "14th-century Lanna temple housing the Phra Singh Buddha; the city's spiritual centre.",
    visitingHours: "Daily 06:00–20:00",
  },
  {
    id: "wat-chedi-luang",
    name: "Wat Chedi Luang",
    nameTh: "วัดเจดีย์หลวง",
    category: "temple",
    longitude: 98.9871,
    latitude: 18.7917,
    builtYear: 1391,
    brief: "14th-century brick chedi, half-shattered by the 1545 earthquake; once held the Emerald Buddha.",
    visitingHours: "Daily 06:00–18:00",
  },
  {
    id: "wat-suan-dok",
    name: "Wat Suan Dok",
    nameTh: "วัดสวนดอก",
    category: "temple",
    longitude: 98.9717,
    latitude: 18.7957,
    builtYear: 1370,
    brief: "14th-century monastery; whitewashed chedis hold the ashes of Lanna kings.",
    visitingHours: "Daily 06:00–21:00",
  },
  {
    id: "wat-phra-that-doi-suthep",
    name: "Wat Phra That Doi Suthep",
    nameTh: "วัดพระธาตุดอยสุเทพ",
    category: "temple",
    longitude: 98.9215,
    latitude: 18.8048,
    builtYear: 1383,
    brief: "Iconic gilded chedi on the mountain above the city; 309-step naga staircase.",
    visitingHours: "Daily 06:00–20:00",
  },
  // ── Outer heritage ────────────────────────────────────────────
  {
    id: "wat-umong",
    name: "Wat Umong",
    nameTh: "วัดอุโมงค์",
    category: "temple",
    longitude: 98.9573,
    latitude: 18.7704,
    builtYear: 1296,
    brief: "13th-century forest monastery; tunnels dug under a forested hill, quiet meditation retreat.",
    visitingHours: "Daily 06:00–20:00",
  },
  {
    id: "wat-jet-yot",
    name: "Wat Jet Yot",
    nameTh: "วัดเจ็ดยอด",
    category: "temple",
    longitude: 98.9787,
    latitude: 18.8046,
    builtYear: 1455,
    brief: "Seven-spire temple of the Lanna era; site of the 1976 World Fellowship of Buddhists.",
    visitingHours: "Daily 06:00–18:00",
  },
  {
    id: "doi-suthep-pui",
    name: "Doi Suthep–Pui National Park",
    nameTh: "อุทยานแห่งชาติดอยสุเทพ–ปุย",
    category: "natural",
    longitude: 98.9215,
    latitude: 18.8089,
    builtYear: 1981,
    brief: "261 km² mountain park north of the city; Doi Suthep summit at 1,676 m.",
    visitingHours: "Daily 06:00–18:00",
  },
  {
    id: "doi-inthanon",
    name: "Doi Inthanon National Park",
    nameTh: "อุทยานแห่งชาติดอยอินทนนท์",
    category: "natural",
    longitude: 98.4867,
    latitude: 18.5883,
    builtYear: 1972,
    brief: "Thailand's highest peak at 2,565 m; Hmong and Karen villages in the lower valleys.",
    visitingHours: "Daily 05:30–18:00",
  },
  {
    id: "mok-fa-waterfall",
    name: "Mok Fa Waterfall",
    nameTh: "น้ำตกหมอแป๊ะ",
    category: "natural",
    longitude: 98.6289,
    latitude: 18.5394,
    brief: "11-tier cascade deep inside Doi Inthanon NP; popular with weekday visitors.",
    visitingHours: "Daily 06:00–18:00",
  },
  {
    id: "mueang-on-cave",
    name: "Mueang On Cave",
    nameTh: "ถ้ำเมืองออน",
    category: "natural",
    longitude: 99.1845,
    latitude: 18.8412,
    brief: "Underground stream cave 60 km SE of the city; stalactite cathedral at the back.",
    visitingHours: "Daily 08:00–17:00",
  },
  // ── City gates (Chiang Mai's walled-old-town) ──────────────────
  {
    id: "tha-phae-gate",
    name: "Tha Phae Gate",
    nameTh: "ประตูท่าแพ",
    category: "city-wall",
    longitude: 98.9933,
    latitude: 18.7909,
    builtYear: 1296,
    brief: "Eastern gate of King Mangrai's 1296 city wall; the city's most photographed corner.",
  },
  {
    id: "chang-phueak-gate",
    name: "Chang Phueak Gate",
    nameTh: "ประตูช้างเผือก",
    category: "city-wall",
    longitude: 98.9783,
    latitude: 18.7994,
    builtYear: 1296,
    brief: "Northern gate; named after the white elephants that once entered the city for coronations.",
  },
];

let cache: { at: number; data: { generatedAt: string; sites: CnxHeritageSite[] } } | null = null;
const TTL_MS = 24 * 60 * 60_000;

export async function fetchCnxHeritage() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const data = {
    generatedAt: new Date().toISOString(),
    sites: HERITAGE,
  };
  cache = { at: Date.now(), data };
  return data;
}