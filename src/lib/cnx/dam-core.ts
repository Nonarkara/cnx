// Reservoir storage for the Ping basin — pure, import-free (the relay runs it
// under Node type-stripping, unbundled; see scripts/check-relay-imports.mjs).
//
// Source: ThaiWater v3 `…/thaiwater30/analyst/dam` (keyless, public). The
// `public/dam*` paths 404 (probed 2026-10-11); `analyst/dam` answers 200 with
// four arrays — dam_daily (large dams, RID and EGAT), dam_medium (RID medium
// reservoirs), dam_hourly and dam_small_tele. This board reads two of them:
//
//   large  — dam_daily rows in the Ping basin (basin_code 6): แม่งัดสมบูรณ์ชล
//            and แม่กวงอุดมธารา in Chiang Mai, ภูมิพล downstream in Tak.
//   medium — dam_medium rows in Chiang Mai (province_code 50).
//
// Things the feed does that the code below has to undo:
//   - Every large dam can appear twice: an RID row dated today and an EGAT
//     row dated yesterday whose `dam_storage_percent` is 0 while storage is
//     251 MCM. Rows are deduplicated per dam (dam_oldcode), newest report
//     first, RID before EGAT on a tie. The published percentage is used when
//     it is positive; a 0 or missing one is recomputed from storage ÷ normal
//     storage rather than shown as an empty reservoir.
//   - Medium reservoirs that have never reported carry `dam_date` 1970-01-01
//     and null storage; one last reported in 2021. A report older than
//     DAM_MAX_AGE_DAYS is dropped, not shown as today.
//   - Units: storage in million m³ (MCM); inflow, release and spill are MCM
//     per day (the RID daily report). ThaiWater's percent is of NORMAL
//     storage (ระดับเก็บกักปกติ), and it exceeds 100 when a reservoir is above
//     it — that is real, not a parse error.

export type DamKind = "large" | "medium";
export type DamBand = "over" | "near-full" | "high" | "normal" | "unknown";
export type DamSeverity = "good" | "watch" | "alert" | "unknown";

/** What the relay ships per reservoir — a field subset of ThaiWater's row. */
export interface DamRow {
  id: string;
  kind: DamKind;
  nameTh: string;
  nameEn: string;
  provinceTh: string;
  amphoeTh: string;
  lat: number;
  lon: number;
  /** RID report day, "YYYY-MM-DD" (Asia/Bangkok). */
  date: string;
  storageMcm: number;
  normalMcm: number | null;
  maxMcm: number | null;
  /** ThaiWater's own % of normal storage, null when absent or 0. */
  upstreamPct: number | null;
  inflowMcm: number | null;
  releaseMcm: number | null;
  spillMcm: number | null;
  agency: string;
}

export interface DamStation extends DamRow {
  /** Storage as % of normal storage — the figure RID publishes. */
  pctNormal: number | null;
  /** Storage as % of maximum storage, where the dam publishes one. */
  pctMax: number | null;
  band: DamBand;
  severity: DamSeverity;
  /** Whole days between the report day and today in Bangkok. */
  ageDays: number;
  spilling: boolean;
}

export interface DamSummary {
  generatedAt: string;
  large: DamStation[];
  medium: DamStation[];
  /** Over or near normal storage, large and medium, fullest first. */
  nearFull: DamStation[];
  spilling: DamStation[];
  newestDate: string | null;
  /** Rows dropped because their report is older than maxAgeDays (or future-dated). */
  dropped: number;
  maxAgeDays: number;
}

export const DAM_MAX_AGE_DAYS = 2;
/** The relay pushes hourly; three hours without a push means it is down. */
export const DAM_RELAY_MAX_AGE_MS = 3 * 3_600_000;
export const DAM_SOURCE_URL = "https://api-v3.thaiwater.net/api/v1/thaiwater30/analyst/dam";
const PING_BASIN_CODE = 6;
const CHIANG_MAI = "50";
const MAX_PLAUSIBLE_MCM = 30_000;
const MAX_PLAUSIBLE_FLOW_MCM_DAY = 3_000;
const DAY_MS = 86_400_000;
const BKK_OFFSET_MS = 7 * 3_600_000;

/** A real calendar day as Bangkok midnight (ms); Date.parse alone accepts Feb 30. */
export function damReportTime(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = Date.parse(`${date}T00:00:00+07:00`);
  if (!Number.isFinite(t) || new Date(t + BKK_OFFSET_MS).toISOString().slice(0, 10) !== date) return null;
  return t;
}

/** Whole days from the report day to today, both in Bangkok. Negative = future. */
export function damAgeDays(date: string, nowMs: number): number | null {
  const t = damReportTime(date);
  if (t === null) return null;
  const today = Math.floor((nowMs + BKK_OFFSET_MS) / DAY_MS);
  const day = Math.floor((t + BKK_OFFSET_MS) / DAY_MS);
  return today - day;
}

export function damBand(pctNormal: number | null): DamBand {
  if (pctNormal === null) return "unknown";
  if (pctNormal >= 100) return "over";
  if (pctNormal >= 90) return "near-full";
  if (pctNormal >= 80) return "high";
  return "normal";
}

const SEVERITY: Record<DamBand, DamSeverity> = { over: "alert", "near-full": "watch", high: "watch", normal: "good", unknown: "unknown" };

type Bilingual = { th?: unknown; en?: unknown };
type Raw = {
  dam_date?: unknown;
  dam_storage?: unknown;
  dam_storage_percent?: unknown;
  dam_inflow?: unknown;
  dam_released?: unknown;
  dam_spilled?: unknown;
  dam?: { id?: unknown; dam_oldcode?: unknown; dam_name?: Bilingual; dam_lat?: unknown; dam_long?: unknown; max_storage?: unknown; normal_storage?: unknown };
  agency?: { agency_shortname?: { en?: unknown } };
  basin?: { basin_code?: unknown };
  geocode?: { province_code?: unknown; province_name?: Bilingual; amphoe_name?: Bilingual };
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const flow = (v: unknown) => {
  const n = num(v);
  return n === null || n < 0 || n > MAX_PLAUSIBLE_FLOW_MCM_DAY ? null : n;
};
const positive = (v: unknown) => {
  const n = num(v);
  return n === null || n <= 0 ? null : n;
};

/**
 * Documented corrections to the publisher's English romanisation, keyed by
 * the Thai name — which the feed gets right.
 *
 * ThaiWater's `analyst/dam` ships TWO records for Mae Ngat:
 *   { en: "Mae Ngud", th: "แม่งัดสมบูรณ์ชล" }   ← newer, wins our dedupe
 *   { en: "MAE NGAT DAM", th: "แม่งัด" }        ← older
 * The first is simply wrong: there is no Mae Ngud dam, and this board
 * already says "แม่งัด" everywhere else (About, the flood rule, the
 * verdict copy). Rendering the publisher's misspelling would put a dam
 * that does not exist on a governor's flood desk.
 *
 * This is a LABEL correction only — no number is touched — and it is
 * disclosed in the response `note` rather than passed off as the
 * publisher's own spelling. If ThaiWater fixes it upstream, this map
 * becomes redundant and can be deleted.
 */
export const UPSTREAM_EN_CORRECTIONS: Readonly<Record<string, string>> = {
  "แม่งัดสมบูรณ์ชล": "Mae Ngat",
};

/** Prefer the corrected romanisation; otherwise pass the publisher's through. */
function correctEnglishName(nameTh: string, nameEn: string): string {
  return UPSTREAM_EN_CORRECTIONS[nameTh] ?? nameEn;
}

/** ThaiWater dam row → DamRow, or null when it is not a usable reading. */
export function compactDamRow(raw: Raw, kind: DamKind): DamRow | null {
  const dam = raw?.dam;
  if (!dam) return null;
  const storage = num(raw.dam_storage);
  const lat = num(dam.dam_lat);
  const lon = num(dam.dam_long);
  const date = str(raw.dam_date).slice(0, 10);
  const nameTh = str(dam.dam_name?.th);
  if (storage === null || storage < 0 || storage > MAX_PLAUSIBLE_MCM || !nameTh) return null;
  if (lat === null || lat < -90 || lat > 90 || lon === null || lon < -180 || lon > 180) return null;
  if (damReportTime(date) === null) return null;
  const pct = positive(raw.dam_storage_percent);
  return {
    id: `${kind}:${str(String(dam.dam_oldcode ?? "")) || String(dam.id ?? nameTh)}`,
    kind,
    nameTh,
    nameEn: correctEnglishName(nameTh, str(dam.dam_name?.en)),
    provinceTh: str(raw.geocode?.province_name?.th),
    amphoeTh: str(raw.geocode?.amphoe_name?.th),
    lat,
    lon,
    date,
    storageMcm: Math.round(storage * 100) / 100,
    normalMcm: positive(dam.normal_storage),
    maxMcm: positive(dam.max_storage),
    upstreamPct: pct !== null && pct <= 300 ? Math.round(pct * 100) / 100 : null,
    inflowMcm: flow(raw.dam_inflow),
    releaseMcm: flow(raw.dam_released),
    spillMcm: flow(raw.dam_spilled),
    agency: str(raw.agency?.agency_shortname?.en),
  };
}

/** Newest report first; on the same day, RID's row before EGAT's. */
function better(a: DamRow, b: DamRow): DamRow {
  if (a.date !== b.date) return a.date > b.date ? a : b;
  if (a.agency === "RID" && b.agency !== "RID") return a;
  if (b.agency === "RID" && a.agency !== "RID") return b;
  return a;
}

/** The `analyst/dam` envelope → Ping-basin large dams + Chiang Mai medium reservoirs. */
export function selectDamRows(envelope: { data?: { dam_daily?: unknown; dam_medium?: unknown } } | null | undefined): DamRow[] {
  const data = envelope?.data;
  const daily = Array.isArray(data?.dam_daily) ? (data?.dam_daily as Raw[]) : [];
  const medium = Array.isArray(data?.dam_medium) ? (data?.dam_medium as Raw[]) : [];
  const large = new Map<string, DamRow>();
  for (const raw of daily) {
    if (Number(raw?.basin?.basin_code) !== PING_BASIN_CODE) continue;
    const row = compactDamRow(raw, "large");
    if (!row) continue;
    const prev = large.get(row.id);
    large.set(row.id, prev ? better(prev, row) : row);
  }
  const mediumRows = new Map<string, DamRow>();
  for (const raw of medium) {
    if (String(raw?.geocode?.province_code) !== CHIANG_MAI) continue;
    const row = compactDamRow(raw, "medium");
    if (!row) continue;
    const prev = mediumRows.get(row.id);
    mediumRows.set(row.id, prev ? better(prev, row) : row);
  }
  return [...large.values(), ...mediumRows.values()];
}

/** % of normal storage: RID's published figure, else storage ÷ normal storage, else unknown. */
export function pctOfNormal(r: Pick<DamRow, "storageMcm" | "normalMcm" | "upstreamPct">): number | null {
  if (r.upstreamPct !== null) return Math.round(r.upstreamPct * 10) / 10;
  if (r.normalMcm) return Math.round((r.storageMcm / r.normalMcm) * 1000) / 10;
  return null;
}

export function toDamStation(r: DamRow, ageDays: number): DamStation {
  const pctNormal = pctOfNormal(r);
  const band = damBand(pctNormal);
  return {
    ...r,
    pctNormal,
    pctMax: r.maxMcm ? Math.round((r.storageMcm / r.maxMcm) * 1000) / 10 : null,
    band,
    severity: SEVERITY[band],
    ageDays,
    spilling: (r.spillMcm ?? 0) > 0,
  };
}

const byFullest = (a: DamStation, b: DamStation) => (b.pctNormal ?? -1) - (a.pctNormal ?? -1);

/** Current reports only, graded. A stale report is dropped, never shown as today's. */
export function summariseDams(rows: DamRow[], nowMs: number = Date.now()): DamSummary {
  let dropped = 0;
  const stations: DamStation[] = [];
  for (const r of rows) {
    const age = damAgeDays(r.date, nowMs);
    if (age === null || age < 0 || age > DAM_MAX_AGE_DAYS) {
      dropped += 1;
      continue;
    }
    stations.push(toDamStation(r, age));
  }
  const large = stations.filter((s) => s.kind === "large").sort(byFullest);
  const medium = stations.filter((s) => s.kind === "medium").sort(byFullest);
  const nearFull = stations.filter((s) => s.band === "over" || s.band === "near-full").sort(byFullest);
  const newestDate = stations.reduce<string | null>((n, s) => (n === null || s.date > n ? s.date : n), null);
  return {
    generatedAt: new Date(nowMs).toISOString(),
    large,
    medium,
    nearFull,
    spilling: stations.filter((s) => s.spilling),
    newestDate,
    dropped,
    maxAgeDays: DAM_MAX_AGE_DAYS,
  };
}

export const DAM_BAND_TH: Record<DamBand, string> = {
  over: "เกินระดับเก็บกักปกติ",
  "near-full": "ใกล้เต็ม",
  high: "น้ำมาก",
  normal: "ต่ำกว่า 80%",
  unknown: "ไม่ทราบความจุ",
};

export const DAM_BAND_EN: Record<DamBand, string> = {
  over: "Above normal storage",
  "near-full": "Near full",
  high: "High",
  normal: "Below 80%",
  unknown: "Capacity unknown",
};
