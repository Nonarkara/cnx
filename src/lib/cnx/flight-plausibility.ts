// An aviation board must not draw an altitude that cannot be an altitude.
//
// `toState` (adsb.lol) accepted any value where `typeof x === "number"`,
// and `parseState` (OpenSky) accepted any finite one. Neither bounded
// altitude, ground speed, vertical rate or track. Every downstream guard
// is null-shaped or comparative, so a NaN slipped through all of them:
//
//   CNXMap.tsx  getColor    `alt >= 10_000` is false for NaN, `alt >= 6_000`
//                            is false for NaN → a NaN-altitude aircraft
//                            renders in the *low* colour band, visually
//                            indistinguishable from one genuinely at 800 ft.
//   CNXMap.tsx  tail        `f.velocity <= 0` is false for NaN, so the guard
//                            passes and the tail endpoint becomes
//                            [lon - NaN, lat - NaN].
//   CNXApp      visitors    the snapshot feeds summariseVisitors, so a bad
//                            record moves a headline civic number, not just
//                            a dot on a map.
//
// This is the same defect river-level.ts had: an unchecked number became an
// authoritative one. It gets the same treatment, with one deliberate
// difference in how the drop is handled — see below.
//
// ── Why NULL the measurement instead of REJECTING the aircraft ──────────
//
// The river rule is REJECT-never-clamp: a river level is *the layer*, so an
// unreadable level must not be replaced with a plausible-looking one. A
// flight record is not a single number — it is an identity (hex, callsign,
// registration, country) attached to a position. Deleting the whole record
// because one of five measurements is corrupt would remove an aircraft that
// is genuinely on radar from the map AND from the visitor count. That is an
// omission error, and omission errors are as fatal here as commission ones.
//
// So the split is:
//   • position  — no finite, in-range coordinate, so the aircraft cannot be
//                 placed at all. REJECT the record and count it. (Being
//                 out of AREA is a separate question, answered by `inBbox`
//                 at the call site, not by a plausibility screen.)
//   • altitude / speed / vertical rate / track — the aircraft stays; the
//                 unusable measurement becomes null, which every renderer
//                 already draws as "unknown" rather than as a value.
//                 Count it.
//
// Either way the count is published on the response as `quality`. Nothing is
// dropped silently: "not enough data" must never read as a clean number.
//
// These bounds REJECT or NULL. They never clamp or repair — substituting a
// value invents a measurement nobody made.

import type { FlightState } from "./opensky";

/**
 * Bounds below are garbage filters, not operating envelopes. They are set
 * far outside anything the sources have ever produced so they cannot blank a
 * real aircraft, and they catch sentinel/datum failures (-9999, 999999,
 * 1e30, NaN, unit slips).
 *
 * Measured over both live upstreams on 2026-10-13 (26 ticks at 20 s, 109
 * distinct aircraft records, 0 upstream failures, 0 non-finite values in any
 * field). Run against this real population the screen REJECTS 0 records:
 *
 *   baro altitude    139 – 7,323 m    (bound -300 .. 25,000)  3.4× headroom
 *   ground speed     0.5 – 192 m/s                            4.2× headroom
 *   vertical rate    -7.8 – 23.4 m/s   (bound -60 .. 60)   2.6–7.7× headroom
 *   true track       0 – 340.4°                                1.06× headroom
 *
 * Track is the tightest ratio and it is still safe: 340.4° is the largest
 * value the field can hold by definition, so headroom there is not "3× the
 * worst real value" — there simply is no larger real value to be 3× of. Its
 * bound is the definition of the field, not a guess about traffic.
 *
 * The altitude ceiling is set from aviation, not from that sample: FL600
 * (18,288 m) is the highest flight level in use and Concorde's 59,050 ft
 * (18,000 m) is the highest sustained airliner altitude ever recorded, so
 * 25,000 m sits above any real aircraft with room for barometric-vs-true
 * altitude error, which is bounded by surface-pressure extremes and is a few
 * percent at cruise.
 */

/** On-ground aircraft legitimately report 0 m; -300 catches -9999 without
 *  ever deleting a low-flying aircraft in a province whose floor is ~70 m. */
export const PLAUSIBLE_ALTITUDE_MIN_M = -300;
/** ~82,000 ft. Above FL600, above any baro-vs-true error, far below garbage. */
export const PLAUSIBLE_ALTITUDE_MAX_M = 25_000;
/** Negative ground speed is receiver noise, not flight. */
export const PLAUSIBLE_GROUND_SPEED_MIN_M_S = -50;
/** Mach 2.4 — 4.2× the fastest aircraft ever seen in this box. */
export const PLAUSIBLE_GROUND_SPEED_MAX_M_S = 800;
/** ~11,800 ft/min, about 2× the fastest emergency descent. */
export const PLAUSIBLE_VERTICAL_RATE_MAX_M_S = 60;
/** Degrees true is [0, 360). */
export const PLAUSIBLE_TRACK_MAX_DEG = 360;

export type FlightFault =
  | "position"
  | "altitude"
  | "groundSpeed"
  | "verticalRate"
  | "track";

/**
 * Fault keys do not all match their FlightState field name, so the mapping
 * is stated rather than left to be inferred from a payload:
 *
 *   position   ← latitude / longitude   (rejected — nothing to draw)
 *   altitude   ← baroAltitude
 *   groundSpeed ← velocity              (both upstreams mean ground speed;
 *                                       adsb.lol calls the raw field `gs`)
 *   verticalRate ← verticalRate
 *   track      ← trueTrack
 */

export const FLIGHT_FAULTS: readonly FlightFault[] = [
  "position",
  "altitude",
  "groundSpeed",
  "verticalRate",
  "track",
];

/** Published on the response so an operator can see what was withheld. */
export interface FlightQuality {
  /** Records removed entirely because they had no drawable position. */
  rejected: number;
  /** Records kept, with at least one measurement nulled. */
  nulled: number;
  /** Per-fault totals, so the number is attributable, not just present. */
  faults: Partial<Record<FlightFault, number>>;
}

function usable(v: number | null | undefined, min: number, max: number): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

/**
 * Which measurements on this record cannot be used. Returns an empty array
 * for a fully usable record.
 *
 * `position` here means only "not a finite, in-range coordinate" — this
 * module deliberately knows nothing about the CNX bbox, because opensky.ts
 * owns that and importing it back would be a cycle. Whether a position is
 * *inside the board's area* is `inBbox`'s job, applied on both the direct
 * and the KV read path.
 */
export function flightFaults(s: FlightState): FlightFault[] {
  const faults: FlightFault[] = [];

  if (
    !usable(s.latitude, -90, 90) ||
    !usable(s.longitude, -180, 180)
  ) {
    faults.push("position");
  }

  if (s.baroAltitude !== null && !usable(s.baroAltitude, PLAUSIBLE_ALTITUDE_MIN_M, PLAUSIBLE_ALTITUDE_MAX_M)) {
    faults.push("altitude");
  }
  if (
    s.velocity !== null &&
    !usable(s.velocity, PLAUSIBLE_GROUND_SPEED_MIN_M_S, PLAUSIBLE_GROUND_SPEED_MAX_M_S)
  ) {
    faults.push("groundSpeed");
  }
  if (s.verticalRate !== null && !usable(s.verticalRate, -PLAUSIBLE_VERTICAL_RATE_MAX_M_S, PLAUSIBLE_VERTICAL_RATE_MAX_M_S)) {
    faults.push("verticalRate");
  }
  // Degrees true is [0, 360) — 360 is excluded because it is 0 mis-encoded.
  if (s.trueTrack !== null && !(typeof s.trueTrack === "number" && Number.isFinite(s.trueTrack) && s.trueTrack >= 0 && s.trueTrack < PLAUSIBLE_TRACK_MAX_DEG)) {
    faults.push("track");
  }

  return faults;
}

function emptyQuality(): FlightQuality {
  return { rejected: 0, nulled: 0, faults: {} };
}

/**
 * Screens a batch of states. Returns the drawable records plus a count of
 * what was withheld — the count is the whole point; a silent shrink in the
 * aircraft total reads as "the sky cleared".
 *
 * This function does not bucket. Bucketing is the caller's, because both
 * call sites already own it: `split()` buckets fresh upstream states by
 * `onGround`, and the KV read path re-buckets a stored payload that was
 * bucketed by the relay. Neither wants a helper deciding buckets for it, and
 * `onGround` is the upstream's claim about an aircraft rather than something
 * a plausibility screen gets to reinterpret.
 */
export function screenFlights(states: FlightState[]): { kept: FlightState[]; quality: FlightQuality } {
  const kept: FlightState[] = [];
  const quality = emptyQuality();

  for (const s of states) {
    const faults = flightFaults(s);
    if (faults.length === 0) {
      kept.push(s);
      continue;
    }
    for (const f of faults) {
      quality.faults[f] = (quality.faults[f] ?? 0) + 1;
    }
    if (faults.includes("position")) {
      quality.rejected++;
      continue;
    }
    quality.nulled++;
    kept.push({
      ...s,
      baroAltitude: faults.includes("altitude") ? null : s.baroAltitude,
      velocity: faults.includes("groundSpeed") ? null : s.velocity,
      verticalRate: faults.includes("verticalRate") ? null : s.verticalRate,
      trueTrack: faults.includes("track") ? null : s.trueTrack,
    });
  }

  return { kept, quality };
}