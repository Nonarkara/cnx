// NASA AERONET sun photometer at the Chiang Mai Meteorological Station —
// ground-truth aerosol optical depth, the reference that satellite AOD is
// validated against. Daily averages, Version 3 Level 1.5 (cloud-screened,
// not final calibration, can still change). Keyless.

const SITE = "Chiang_Mai_Met_Sta";
const LOOKBACK_DAYS = 30;

export interface AeronetDay {
  date: string;
  aod500: number;
  /** Ångström exponent 440–870 nm: >1 means fine particles (smoke). */
  angstrom440_870: number | null;
}

export interface AeronetResponse {
  generatedAt: string;
  site: string;
  level: "1.5";
  latest: AeronetDay | null;
  days: AeronetDay[];
  note: string;
}

const val = (s: string | undefined): number | null => {
  const n = Number(s);
  return Number.isFinite(n) && n > -999 ? n : null;
};

/** Parses AERONET's print_web_data_v3 CSV (daily averages). */
export function parseAeronetDaily(text: string): AeronetDay[] {
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith("AERONET_Site,"));
  if (headerIdx < 0) return [];
  const header = lines[headerIdx].split(",");
  const iDate = header.indexOf("Date(dd:mm:yyyy)");
  const iAod = header.indexOf("AOD_500nm");
  const iAng = header.indexOf("440-870_Angstrom_Exponent");
  const days: AeronetDay[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    const cols = line.split(",");
    const aod = val(cols[iAod]);
    const [d, m, y] = (cols[iDate] ?? "").split(":");
    if (aod === null || !y) continue;
    days.push({ date: `${y}-${m}-${d}`, aod500: Math.round(aod * 1000) / 1000, angstrom440_870: iAng >= 0 ? val(cols[iAng]) : null });
  }
  return days;
}

let cache: { at: number; data: AeronetResponse } | null = null;
const TTL_MS = 60 * 60_000;

export async function fetchCnxAeronet(): Promise<AeronetResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const end = new Date();
  const start = new Date(end.getTime() - LOOKBACK_DAYS * 86_400_000);
  const q = new URLSearchParams({
    site: SITE,
    AOD15: "1",
    AVG: "20",
    if_no_html: "1",
    year: String(start.getUTCFullYear()),
    month: String(start.getUTCMonth() + 1),
    day: String(start.getUTCDate()),
    year2: String(end.getUTCFullYear()),
    month2: String(end.getUTCMonth() + 1),
    day2: String(end.getUTCDate()),
  });
  let days: AeronetDay[] = [];
  try {
    const res = await fetch(`https://aeronet.gsfc.nasa.gov/cgi-bin/print_web_data_v3?${q}`, { signal: AbortSignal.timeout(20_000) });
    if (res.ok) days = parseAeronetDaily(await res.text());
  } catch {
    days = [];
  }
  const data: AeronetResponse = {
    generatedAt: new Date().toISOString(),
    site: SITE,
    level: "1.5",
    latest: days.at(-1) ?? null,
    days,
    note:
      days.length > 0
        ? "Daily-average AOD at 500 nm from NASA AERONET, Level 1.5 (cloud-screened, provisional calibration). Cloudy days have no reading."
        : "AERONET returned no Chiang Mai readings for the last 30 days (instrument offline, cloudy, or the service did not answer).",
  };
  cache = { at: Date.now(), data };
  return data;
}
