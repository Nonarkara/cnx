// ICAO airport code → origin country/city, for classifying arrivals
// at Chiang Mai (VTCC) as domestic vs. international and attributing
// overseas visitors to a country.
//
// Thai airports all use the "VT" ICAO prefix, so domestic-vs-
// international is a simple prefix check — no lookup table needed for
// that part. This table only needs to cover airports that actually
// operate (or have recently operated) scheduled routes into CNX, so
// it's short by design; an unlisted ICAO still counts correctly as
// international, just with country "Unknown".

export interface AirportInfo {
  city: string;
  country: string;
}

export const AIRPORTS: Record<string, AirportInfo> = {
  // China — CNX's largest international market by far.
  ZGGG: { city: "Guangzhou", country: "China" },
  ZSPD: { city: "Shanghai", country: "China" },
  ZSSS: { city: "Shanghai", country: "China" },
  ZUUU: { city: "Chengdu", country: "China" },
  ZUCK: { city: "Chongqing", country: "China" },
  ZPPP: { city: "Kunming", country: "China" },
  ZLXY: { city: "Xi'an", country: "China" },
  ZHHH: { city: "Wuhan", country: "China" },
  ZGSZ: { city: "Shenzhen", country: "China" },
  ZBAA: { city: "Beijing", country: "China" },
  ZBAD: { city: "Beijing", country: "China" },

  // Hong Kong / Taiwan / Macau
  VHHH: { city: "Hong Kong", country: "Hong Kong" },
  RCTP: { city: "Taipei", country: "Taiwan" },
  VMMC: { city: "Macau", country: "Macau" },

  // South Korea
  RKSI: { city: "Seoul (Incheon)", country: "South Korea" },
  RKPC: { city: "Jeju", country: "South Korea" },
  RKPK: { city: "Busan", country: "South Korea" },

  // Japan
  RJAA: { city: "Tokyo (Narita)", country: "Japan" },
  RJTT: { city: "Tokyo (Haneda)", country: "Japan" },
  RJBB: { city: "Osaka", country: "Japan" },
  RJGG: { city: "Nagoya", country: "Japan" },

  // Southeast Asia
  WSSS: { city: "Singapore", country: "Singapore" },
  WMKK: { city: "Kuala Lumpur", country: "Malaysia" },
  VVNB: { city: "Hanoi", country: "Vietnam" },
  VVTS: { city: "Ho Chi Minh City", country: "Vietnam" },
  VDPP: { city: "Phnom Penh", country: "Cambodia" },
  VYYY: { city: "Yangon", country: "Myanmar" },
  RPLL: { city: "Manila", country: "Philippines" },
  WBSB: { city: "Bandar Seri Begawan", country: "Brunei" },

  // India / South Asia
  VIDP: { city: "New Delhi", country: "India" },
  VECC: { city: "Kolkata", country: "India" },

  // Middle East / long-haul (via connection or charter)
  OTHH: { city: "Doha", country: "Qatar" },
  OMDB: { city: "Dubai", country: "UAE" },

  // Europe / Russia (charter — winter high season)
  UUEE: { city: "Moscow", country: "Russia" },
  UWWW: { city: "Samara", country: "Russia" },
};

/** True if an ICAO code belongs to a Thai airport (all start "VT"). */
export function isThaiAirport(icao: string | null | undefined): boolean {
  return !!icao && icao.toUpperCase().startsWith("VT");
}

export function lookupAirport(icao: string | null | undefined): AirportInfo {
  if (!icao) return { city: "Unknown", country: "Unknown" };
  return AIRPORTS[icao.toUpperCase()] ?? { city: icao.toUpperCase(), country: "Unknown" };
}
