// Representative IANA timezone per country — used to show "what time
// is it right now for today's top visitor-origin countries" in the
// top bar. One zone per country is a simplification (China and the
// US span multiple official/practical zones); pick the zone that
// covers the country's main population/travel-hub center, which is
// what matters for a "is it morning or night for them" read.

export const COUNTRY_TIMEZONE: Record<string, string> = {
  China: "Asia/Shanghai",
  Japan: "Asia/Tokyo",
  "South Korea": "Asia/Seoul",
  Singapore: "Asia/Singapore",
  Malaysia: "Asia/Kuala_Lumpur",
  India: "Asia/Kolkata",
  Taiwan: "Asia/Taipei",
  "Hong Kong": "Asia/Hong_Kong",
  Thailand: "Asia/Bangkok",
  Vietnam: "Asia/Ho_Chi_Minh",
  Myanmar: "Asia/Yangon",
  Laos: "Asia/Vientiane",
  Philippines: "Asia/Manila",
  Indonesia: "Asia/Jakarta",
  UAE: "Asia/Dubai",
  Qatar: "Asia/Qatar",
  Turkey: "Europe/Istanbul",
  Germany: "Europe/Berlin",
  "United Kingdom": "Europe/London",
  France: "Europe/Paris",
  Russia: "Europe/Moscow",
  Australia: "Australia/Sydney",
  "United States": "America/Los_Angeles",
};

export interface CountryClock {
  country: string;
  timezone: string;
  /** Minutes east of UTC — used to sort earliest → latest. */
  utcOffsetMinutes: number;
  /** e.g. "14:32" in the country's local time. */
  localTime: string;
}

/** UTC offset in minutes for a given IANA zone, at the given instant. */
function utcOffsetMinutes(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Build a sorted (earliest → latest local time) clock list for a set
 *  of countries, skipping any without a known timezone mapping. */
export function clocksForCountries(countries: string[], at: Date = new Date()): CountryClock[] {
  const clocks: CountryClock[] = [];
  for (const country of countries) {
    const timezone = COUNTRY_TIMEZONE[country];
    if (!timezone) continue;
    const localTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(at);
    clocks.push({ country, timezone, utcOffsetMinutes: utcOffsetMinutes(timezone, at), localTime });
  }
  return clocks.sort((a, b) => a.utcOffsetMinutes - b.utcOffsetMinutes);
}
