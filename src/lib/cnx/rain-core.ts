// Measured 24-hour rainfall at ThaiWater rain gauges in Chiang Mai — pure,
// import-free (the relay runs it under Node type-stripping).
//
// Why it is on the board: river gauges see a flood once it reaches the
// river. Flash floods in Chiang Mai's hill catchments (Mae Rim, Chom Thong,
// Mae Taeng, Mae Chaem) start as very heavy rain on slopes far from any
// river gauge — on 2026-10-05 one station logged 94.5 mm while P.1 sat
// 2.7 m below its bank and the news rail carried a flash flood at Mae Sa.
//
// Bands are the Thai Meteorological Department's 24-hour rainfall classes:
// light 0.1–10.0, moderate 10.1–35.0, heavy 35.1–90.0, very heavy ≥ 90.1 mm.

export type RainBand = "none" | "light" | "moderate" | "heavy" | "very-heavy";

/** What the relay ships per station — a field subset of ThaiWater's row. */
export interface RainRow {
  id: string;
  rain24h: number;
  /** ThaiWater's local time, "YYYY-MM-DD HH:mm" (Asia/Bangkok). */
  at: string;
  station: string;
  amphoeTh: string;
  amphoeEn: string;
  tambonTh: string;
  lat: number;
  lon: number;
  agency: string;
}

export interface RainStation extends RainRow {
  band: RainBand;
  observedAt: string;
}

export interface RainSummary {
  generatedAt: string;
  stations: RainStation[];
  /** Stations with a current reading, by band. */
  bands: Record<RainBand, number>;
  wettest: RainStation | null;
  /** Districts with heavy or very heavy rain, wettest first. */
  districts: { th: string; en: string; max: number; band: RainBand; stations: number }[];
  /** Readings older than this were dropped as not current. */
  maxAgeHours: number;
}

/** Plausible 24-hour totals; above this a gauge is faulty, not wet. */
const MAX_PLAUSIBLE_MM = 500;
export const RAIN_MAX_AGE_HOURS = 6;

export function rainBand(mm: number): RainBand {
  if (mm >= 90.1) return "very-heavy";
  if (mm >= 35.1) return "heavy";
  if (mm >= 10.1) return "moderate";
  if (mm >= 0.1) return "light";
  return "none";
}

const RANK: Record<RainBand, number> = { none: 0, light: 1, moderate: 2, heavy: 3, "very-heavy": 4 };

type Raw = {
  id?: unknown;
  rain_24h?: unknown;
  rainfall_datetime?: unknown;
  agency?: { agency_shortname?: { en?: unknown } };
  geocode?: { province_code?: unknown; amphoe_name?: { th?: unknown; en?: unknown }; tumbon_name?: { th?: unknown } };
  station?: { tele_station_name?: { th?: unknown }; tele_station_lat?: unknown; tele_station_long?: unknown };
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** ThaiWater rain_24h row → RainRow, or null when it is not a usable Chiang Mai reading. */
export function compactRainRow(raw: Raw): RainRow | null {
  if (str(raw?.geocode?.province_code) !== "50") return null;
  const mm = num(raw.rain_24h);
  const lat = num(raw.station?.tele_station_lat);
  const lon = num(raw.station?.tele_station_long);
  const at = str(raw.rainfall_datetime);
  if (mm === null || mm < 0 || mm > MAX_PLAUSIBLE_MM || lat === null || lon === null || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(at)) return null;
  return {
    id: String(raw.id ?? `${lat},${lon}`),
    rain24h: Math.round(mm * 10) / 10,
    at: at.slice(0, 16),
    station: str(raw.station?.tele_station_name?.th),
    amphoeTh: str(raw.geocode?.amphoe_name?.th),
    amphoeEn: str(raw.geocode?.amphoe_name?.en).replace(/ District$/, ""),
    tambonTh: str(raw.geocode?.tumbon_name?.th),
    lat,
    lon,
    agency: str(raw.agency?.agency_shortname?.en),
  };
}

/** Current readings, banded and summarised. Old readings are dropped, not shown as now. */
export function summariseRain(rows: RainRow[], nowMs: number = Date.now()): RainSummary {
  const stations: RainStation[] = rows.flatMap((r) => {
    const t = Date.parse(`${r.at.replace(" ", "T")}:00+07:00`);
    if (!Number.isFinite(t) || nowMs - t > RAIN_MAX_AGE_HOURS * 3_600_000 || t - nowMs > 10 * 60_000) return [];
    return [{ ...r, band: rainBand(r.rain24h), observedAt: new Date(t).toISOString() }];
  });
  const bands: Record<RainBand, number> = { none: 0, light: 0, moderate: 0, heavy: 0, "very-heavy": 0 };
  for (const s of stations) bands[s.band] += 1;
  const byDistrict = new Map<string, RainStation[]>();
  for (const s of stations) if (s.amphoeTh) byDistrict.set(s.amphoeTh, [...(byDistrict.get(s.amphoeTh) ?? []), s]);
  const districts = [...byDistrict.entries()]
    .map(([th, list]) => {
      const max = Math.max(...list.map((s) => s.rain24h));
      return { th, en: list[0].amphoeEn, max, band: rainBand(max), stations: list.length };
    })
    .filter((d) => RANK[d.band] >= RANK.heavy)
    .sort((a, b) => b.max - a.max);
  const wettest = stations.reduce<RainStation | null>((w, s) => (!w || s.rain24h > w.rain24h ? s : w), null);
  return {
    generatedAt: new Date(nowMs).toISOString(),
    stations: [...stations].sort((a, b) => b.rain24h - a.rain24h),
    bands,
    wettest,
    districts,
    maxAgeHours: RAIN_MAX_AGE_HOURS,
  };
}

export const RAIN_BAND_TH: Record<RainBand, string> = {
  none: "ไม่มีฝน",
  light: "ฝนเล็กน้อย",
  moderate: "ฝนปานกลาง",
  heavy: "ฝนหนัก",
  "very-heavy": "ฝนหนักมาก",
};
