// ICAO aircraft type designator → approximate passenger capacity.
//
// OpenSky Network returns the aircraft's type code (e.g. "A320", "B738")
// per-icao24 lookup. The mapping below covers the widebody and
// narrowbody types that fly into Chiang Mai (CNX), the regional
// turboprops (ATR, Dash 8), and the rare heavy visitors (A380, B747).
// The values are nominal seat counts, not exact configurations — a
// low-cost A320 carries more, a business-config A320 carries less.
// Use the bucket, not the number, for the dashboard's claims.

export type PlaneSize = "regional" | "narrow" | "wide" | "heavy";

export interface AircraftSpec {
  /** ICAO type designator (matches OpenSky `typecode` field). */
  typecode: string;
  /** Approximate max passenger count for the type. */
  seats: number;
  /** Display bucket. */
  size: PlaneSize;
  /** Short name for tooltips. */
  label: string;
}

const AIRCRAFT: Record<string, AircraftSpec> = {
  // Heavy (4-aisle, >350 seats)
  A380: { typecode: "A380", seats: 555, size: "heavy", label: "A380" },
  A388: { typecode: "A388", seats: 555, size: "heavy", label: "A380-800" },
  B744: { typecode: "B744", seats: 416, size: "heavy", label: "747-400" },
  B748: { typecode: "B748", seats: 410, size: "heavy", label: "747-8" },
  B747: { typecode: "B747", seats: 416, size: "heavy", label: "747" },
  A340: { typecode: "A340", seats: 380, size: "heavy", label: "A340" },

  // Widebody (twin-aisle, 250-350 seats)
  B777: { typecode: "B777", seats: 350, size: "wide", label: "777" },
  B788: { typecode: "B788", seats: 290, size: "wide", label: "787-8" },
  B789: { typecode: "B789", seats: 330, size: "wide", label: "787-9" },
  B78X: { typecode: "B78X", seats: 350, size: "wide", label: "787-10" },
  A350: { typecode: "A350", seats: 325, size: "wide", label: "A350" },
  A359: { typecode: "A359", seats: 350, size: "wide", label: "A350-900" },
  A330: { typecode: "A330", seats: 290, size: "wide", label: "A330" },
  A332: { typecode: "A332", seats: 250, size: "wide", label: "A330-200" },
  A333: { typecode: "A333", seats: 290, size: "wide", label: "A330-300" },
  A338: { typecode: "A338", seats: 250, size: "wide", label: "A330-800neo" },
  A339: { typecode: "A339", seats: 300, size: "wide", label: "A330-900neo" },
  A35K: { typecode: "A35K", seats: 370, size: "wide", label: "A350-1000" },
  B772: { typecode: "B772", seats: 310, size: "wide", label: "777-200" },
  B77W: { typecode: "B77W", seats: 360, size: "wide", label: "777-300ER" },
  B763: { typecode: "B763", seats: 250, size: "wide", label: "767-300" },

  // Narrowbody (single-aisle, 130-220 seats)
  B738: { typecode: "B738", seats: 189, size: "narrow", label: "737-800" },
  B739: { typecode: "B739", seats: 220, size: "narrow", label: "737-900" },
  B38M: { typecode: "B38M", seats: 200, size: "narrow", label: "737 MAX 8" },
  B39M: { typecode: "B39M", seats: 210, size: "narrow", label: "737 MAX 9" },
  B752: { typecode: "B752", seats: 200, size: "narrow", label: "757-200" },
  B753: { typecode: "B753", seats: 240, size: "narrow", label: "757-300" },
  A20N: { typecode: "A20N", seats: 180, size: "narrow", label: "A320neo" },
  A21N: { typecode: "A21N", seats: 220, size: "narrow", label: "A321neo" },
  A320: { typecode: "A320", seats: 180, size: "narrow", label: "A320" },
  A321: { typecode: "A321", seats: 220, size: "narrow", label: "A321" },
  A319: { typecode: "A319", seats: 144, size: "narrow", label: "A319" },
  A318: { typecode: "A318", seats: 132, size: "narrow", label: "A318" },
  BCS1: { typecode: "BCS1", seats: 125, size: "narrow", label: "A220-100" },
  BCS3: { typecode: "BCS3", seats: 150, size: "narrow", label: "A220-300" },

  // Regional (turboprop / small jet, <100 seats)
  AT72: { typecode: "AT72", seats: 78, size: "regional", label: "ATR 72" },
  AT76: { typecode: "AT76", seats: 78, size: "regional", label: "ATR 72-600" },
  DH8D: { typecode: "DH8D", seats: 80, size: "regional", label: "Dash 8 Q400" },
  AT45: { typecode: "AT45", seats: 50, size: "regional", label: "ATR 42" },
  SB20: { typecode: "SB20", seats: 50, size: "regional", label: "Saab 2000" },
  E170: { typecode: "E170", seats: 78, size: "regional", label: "E170" },
  E190: { typecode: "E190", seats: 106, size: "regional", label: "E190" },
  CRJ9: { typecode: "CRJ9", seats: 90, size: "regional", label: "CRJ-900" },
  CRJX: { typecode: "CRJX", seats: 100, size: "regional", label: "CRJ-1000" },
};

/** Look up aircraft spec by ICAO typecode. Returns a generic narrow fallback. */
export function lookupAircraft(typecode: string | undefined | null): AircraftSpec {
  if (!typecode) return defaultNarrow();
  const spec = AIRCRAFT[typecode.trim().toUpperCase()];
  if (spec) return spec;
  // Conservative fallback: assume narrow if we don't know. This is
  // a passenger-cap claim, not a safety claim — being wrong by a
  // category is acceptable; being wrong by an order of magnitude
  // is not. The bucket default is therefore narrow (the most common
  // CNX traffic type).
  return { typecode: typecode.trim().toUpperCase(), seats: 160, size: "narrow", label: typecode.trim().toUpperCase() };
}

function defaultNarrow(): AircraftSpec {
  return { typecode: "?", seats: 160, size: "narrow", label: "Narrow (unknown)" };
}

/** All size buckets ordered large → small for legends. */
export const PLANE_SIZES: PlaneSize[] = ["heavy", "wide", "narrow", "regional"];

export function colorForSize(size: PlaneSize): [number, number, number] {
  switch (size) {
    case "heavy":   return [184, 134, 11];   // Doi Suthep gold — heavy is the dramatic arrival
    case "wide":    return [29, 41, 81];     // Lanna blue — widebody is the steady intercontinental workhorse
    case "narrow":  return [29, 41, 81];     // Lanna blue, lighter
    case "regional":return [180, 160, 120];  // Muted neutral — turboprops are background
  }
}

export const PLANE_SIZE_LABEL: Record<PlaneSize, string> = {
  heavy: "Heavy (4-aisle)",
  wide: "Widebody (twin-aisle)",
  narrow: "Narrowbody",
  regional: "Regional",
};
