// Types + comparison for public/data/cnx/burn-season.json (built by
// scripts/build-cnx-burn-season.mjs from HII's Tamroypao open CSVs).

export interface BurnMonth {
  month: string; // YYYYMM
  farmRai: { paddy: number; sugarcane: number; mixed: number; corn: number } | null;
  forestRai: number | null;
  hotspots: number | null;
  pm25Avg: number | null;
  pm25DaysOver: number | null;
}

export interface BurnSeason {
  labelBE: number;
  from: string;
  to: string;
  months: BurnMonth[];
  totals: { farmRai: number; forestRai: number; totalRai: number; hotspots: number; monthsWithData: number };
}

export interface BurnDistrict {
  code: string;
  th: string;
  en: string;
  farmRai: number;
  forestRai: number;
  totalRai: number;
}

export interface BurnSeasonDoc {
  generatedAt: string;
  source: string;
  unit: string;
  caveat: string;
  seasons: BurnSeason[];
  districtsLatest: BurnDistrict[];
}

const pct = (now: number, before: number): number | null => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/** Calendar month (MM) → value, so seasons line up Nov…Apr. */
const byMonth = <T,>(s: BurnSeason, f: (m: BurnMonth) => T | null) =>
  new Map(s.months.map((m) => [m.month.slice(4), f(m)] as const).filter((e): e is readonly [string, T] => e[1] !== null));

export interface SeasonComparison {
  farmPct: number | null;
  forestPct: number | null;
  totalPct: number | null;
  /** Hotspots summed only over months both seasons report — HII's files
   *  for some months are missing, and an uneven sum is not a comparison. */
  hotspots: { latest: number; prior: number; months: string[]; pct: number | null };
  /** Same rule for days over the PM2.5 standard. */
  pm25DaysOver: { latest: number; prior: number; months: string[] };
}

export function compareSeasons(latest: BurnSeason, prior: BurnSeason): SeasonComparison {
  const like = <T extends number>(f: (m: BurnMonth) => T | null) => {
    const a = byMonth(latest, f);
    const b = byMonth(prior, f);
    const months = [...a.keys()].filter((k) => b.has(k));
    return { latest: months.reduce((s, k) => s + (a.get(k) ?? 0), 0), prior: months.reduce((s, k) => s + (b.get(k) ?? 0), 0), months };
  };
  const hs = like((m) => m.hotspots);
  return {
    farmPct: pct(latest.totals.farmRai, prior.totals.farmRai),
    forestPct: pct(latest.totals.forestRai, prior.totals.forestRai),
    totalPct: pct(latest.totals.totalRai, prior.totals.totalRai),
    hotspots: { ...hs, pct: pct(hs.latest, hs.prior) },
    pm25DaysOver: like((m) => m.pm25DaysOver),
  };
}
