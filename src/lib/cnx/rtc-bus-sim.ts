// Schedule-driven simulation of the RTC Chiang Mai City Bus airport lines.
// Not live GPS: each bus leaves the airport at its published departure time,
// drives the OSM route at a constant speed, lays over at the far terminus,
// then drives the return route back. Paths come from
// scripts/fetch-rtc-bus-lines.mjs → public/data/cnx/rtc-bus-lines.json.

export interface RtcLine {
  id: string;
  ref: string;
  name: string;
  from: string;
  to: string;
  colour: string;
  lengthKm: number;
  pathSource: string;
  /** [lon, lat] */
  path: [number, number][];
  cumKm: number[];
  stops: { name: string; km: number }[];
}

export interface RtcLinesFile {
  meta: { source: string; generatedAt: string };
  lines: RtcLine[];
}

export interface SimBus {
  id: string;
  ref: string;
  colour: string;
  lon: number;
  lat: number;
  /** degrees clockwise from north */
  bearing: number;
  status: "outbound" | "layover" | "inbound";
  departedAt: string;
  kmDone: number;
  kmTotal: number;
}

/** Assumed average running speed, within the 30–50 km/h city range. */
export const SIM_SPEED_KMH = 35;
export const LAYOVER_MIN = 5;
const BANGKOK_OFFSET_MIN = 7 * 60;

/** Departures from Chiang Mai Airport (Asia/Bangkok), per the operator's
 *  printed timetable. Edit here when RTC publishes a new schedule. */
export const RTC_AIRPORT_DEPARTURES: Record<string, string[]> = {
  "24A": ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"],
  "24B": ["07:30", "08:30", "09:30", "10:30", "11:30", "12:30", "13:30", "14:30", "15:30", "16:30", "17:30", "18:30"],
  "24C": ["06:45", "09:15", "11:35", "13:45", "16:05", "18:20"],
};

export const RTC_LINE_COLOURS: Record<string, string> = {
  "24A": "#e53935",
  "24B": "#fbc02d",
  "24C": "#43a047",
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function bearingDeg([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Position along a line after `km` kilometres, clamped to the ends. */
export function pointAtKm(line: RtcLine, km: number): { lon: number; lat: number; bearing: number } {
  const { path, cumKm } = line;
  const target = Math.max(0, Math.min(km, cumKm[cumKm.length - 1]));
  let lo = 0;
  let hi = cumKm.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumKm[mid] <= target) lo = mid;
    else hi = mid;
  }
  const seg = cumKm[hi] - cumKm[lo];
  const t = seg > 0 ? (target - cumKm[lo]) / seg : 0;
  const a = path[lo];
  const b = path[hi];
  return {
    lon: a[0] + (b[0] - a[0]) * t,
    lat: a[1] + (b[1] - a[1]) * t,
    bearing: bearingDeg(a, b),
  };
}

function isFromAirport(line: RtcLine): boolean {
  return /airport/i.test(line.from);
}

/** Buses on the road at `now`. A trip that started before midnight and is
 *  still running is included via the previous day's minute offset. */
export function simulateRtcBuses(lines: RtcLine[], now: Date, speedKmh = SIM_SPEED_KMH): SimBus[] {
  const minuteOfDay = (now.getTime() / 60_000 + BANGKOK_OFFSET_MIN) % 1440;
  const buses: SimBus[] = [];
  for (const [ref, departures] of Object.entries(RTC_AIRPORT_DEPARTURES)) {
    const outbound = lines.find((l) => l.ref === ref && isFromAirport(l));
    const inbound = lines.find((l) => l.ref === ref && !isFromAirport(l));
    if (!outbound || !inbound) continue;
    const outMin = (outbound.lengthKm / speedKmh) * 60;
    const inMin = (inbound.lengthKm / speedKmh) * 60;
    const tripMin = outMin + LAYOVER_MIN + inMin;
    const colour = RTC_LINE_COLOURS[ref] ?? outbound.colour;

    for (const dep of departures) {
      let elapsed = minuteOfDay - toMinutes(dep);
      if (elapsed < 0) elapsed += 1440;
      if (elapsed > tripMin) continue;

      const base = { id: `${ref}-${dep}`, ref, colour, departedAt: dep };
      if (elapsed <= outMin) {
        const km = (elapsed / 60) * speedKmh;
        buses.push({ ...base, ...pointAtKm(outbound, km), status: "outbound", kmDone: km, kmTotal: outbound.lengthKm });
      } else if (elapsed <= outMin + LAYOVER_MIN) {
        buses.push({ ...base, ...pointAtKm(outbound, outbound.lengthKm), status: "layover", kmDone: outbound.lengthKm, kmTotal: outbound.lengthKm });
      } else {
        const km = ((elapsed - outMin - LAYOVER_MIN) / 60) * speedKmh;
        buses.push({ ...base, ...pointAtKm(inbound, km), status: "inbound", kmDone: km, kmTotal: inbound.lengthKm });
      }
    }
  }
  return buses;
}
