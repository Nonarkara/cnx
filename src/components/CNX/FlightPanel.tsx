"use client";

// Flight panel — the "analysis of how many tourists coming in
// according to the sizes of the planes and the place of origins".
//
// Reads the same snapshot the map draws, but breaks it down by origin
// country and plane-size bucket. OpenSky already returns the
// origin_country per state. Plane size comes from a static ICAO type
// designator → seats table; we look up the typecode once per icao24
// via OpenSky's /api/aircraft and cache it forever (the aircraft
// registration's typecode never changes).
//
// The first cut renders the country breakdown and the size breakdown.
// The full feature — per-day, per-month trend lines — comes in a
// later commit.

import { useEffect, useMemo, useState } from "react";
import { lookupAircraft, PLANE_SIZES, type PlaneSize } from "../../lib/cnx/aircraft";
import type { FetchResult, FlightState } from "../../lib/cnx/opensky";

interface PanelProps {
  snapshot: FetchResult;
}

const TYPE_LOOKUP_URL = "/api/cnx/aircraft";

/** Per-aircraft typecode cache (client side). One fetch per icao24, ever. */
const typecodeCache = new Map<string, string | undefined>();

export default function FlightPanel({ snapshot }: PanelProps) {
  const typecodeByIcao = useTypecodeLookup(snapshot.airborne);
  const { countryRows, sizeRows, totalSeats, onGround } = useMemo(() => {
    const byCountry = new Map<string, { flights: number; seats: number }>();
    const bySize = new Map<PlaneSize, { count: number; seats: number }>();
    let totalSeats = 0;
    for (const f of snapshot.airborne) {
      const tc = typecodeByIcao.get(f.icao24);
      const spec = lookupAircraft(tc);
      totalSeats += spec.seats;
      const country = f.originCountry || "Unknown";
      let c = byCountry.get(country);
      if (!c) {
        c = { flights: 0, seats: 0 };
        byCountry.set(country, c);
      }
      c.flights += 1;
      c.seats += spec.seats;
      let s = bySize.get(spec.size);
      if (!s) {
        s = { count: 0, seats: 0 };
        bySize.set(spec.size, s);
      }
      s.count += 1;
      s.seats += spec.seats;
    }
    return {
      countryRows: [...byCountry.entries()].sort((a, b) => b[1].flights - a[1].flights),
      sizeRows: PLANE_SIZES.map((s) => ({ size: s, ...(bySize.get(s) ?? { count: 0, seats: 0 }) })),
      totalSeats,
      onGround: snapshot.ground.length,
    };
  }, [snapshot, typecodeByIcao]);

  return (
    <aside className="flex h-full w-full flex-col gap-3 overflow-y-auto bg-[var(--bg-surface)] p-3 text-[11px]">
      <header>
        <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
          Chiang Mai · live
        </div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-[28px] font-bold leading-none text-[#1d2951]">
            {snapshot.airborne.length}
          </span>
          <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--dim)]">
            {snapshot.airborne.length === 1 ? "airborne" : "airborne"}
          </span>
        </div>
        <div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-[var(--dim)]">
          ≈ {totalSeats.toLocaleString("th-TH")} seats · {onGround.toLocaleString("th-TH")} on ground
        </div>
      </header>

      <section>
        <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
          ต้นทาง · origin country
        </div>
        <ul className="mt-1 space-y-1">
          {countryRows.slice(0, 8).map(([country, v]) => (
            <li key={country} className="flex items-center justify-between gap-2 border-b border-dotted border-[var(--line)] py-1">
              <span className="truncate text-[var(--ink)]">{country}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-[9px] text-[var(--dim)]">≈ {v.seats.toLocaleString("th-TH")}</span>
                <span className="font-bold tabular-nums text-[#1d2951]">{v.flights}</span>
              </span>
            </li>
          ))}
          {countryRows.length === 0 && (
            <li className="py-1 text-[var(--dim)]">No airborne flights right now</li>
          )}
        </ul>
      </section>

      <section>
        <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
          ขนาดเครื่อง · plane size
        </div>
        <ul className="mt-1 space-y-1">
          {sizeRows.map((row) => (
            <li key={row.size} className="flex items-center justify-between gap-2 border-b border-dotted border-[var(--line)] py-1">
              <span className="text-[var(--ink)]">{labelForSize(row.size)}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-[9px] text-[var(--dim)]">≈ {row.seats.toLocaleString("th-TH")}</span>
                <span className="font-bold tabular-nums text-[#1d2951]">{row.count}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-auto text-[9px] uppercase tracking-[0.14em] text-[var(--dim)]">
        Source: OpenSky Network · refreshed every ~30 s
      </footer>
    </aside>
  );
}

function labelForSize(size: PlaneSize): string {
  switch (size) {
    case "heavy":    return "Heavy (4-aisle)";
    case "wide":     return "Widebody";
    case "narrow":   return "Narrowbody";
    case "regional": return "Regional";
  }
}

/** React hook: returns a Map<icao24, typecode> for every airborne
    flight in the snapshot. Cache lives across renders and across the
    lifetime of the page. Each unknown icao24 triggers one /api/cnx/aircraft
    fetch (which costs 1 OpenSky credit) and the result is remembered. */
function useTypecodeLookup(flights: FlightState[]): Map<string, string | undefined> {
  const [, setTick] = useState(0);
  const known = useMemo(() => {
    const out = new Map<string, string | undefined>();
    for (const f of flights) {
      if (typecodeCache.has(f.icao24)) {
        out.set(f.icao24, typecodeCache.get(f.icao24));
      }
    }
    return out;
  }, [flights]);

  useEffect(() => {
    const unknown = flights.filter((f) => !typecodeCache.has(f.icao24));
    if (unknown.length === 0) return;
    const icao24s = [...new Set(unknown.map((f) => f.icao24))];
    // Batch up to 20 at a time — OpenSky's /api/aircraft accepts comma-
    // separated icao24s. Anonymous tier: 1 credit per call, so keep
    // batches small.
    const batchSize = 20;
    const batches: string[][] = [];
    for (let i = 0; i < icao24s.length; i += batchSize) {
      batches.push(icao24s.slice(i, i + batchSize));
    }
    (async () => {
      for (const batch of batches) {
        try {
          const res = await fetch(`${TYPE_LOOKUP_URL}?icao24=${encodeURIComponent(batch.join(","))}`);
          if (!res.ok) continue;
          const json = (await res.json()) as { aircraft?: Array<{ icao24: string; typecode?: string }> };
          for (const a of json.aircraft ?? []) {
            typecodeCache.set(a.icao24, a.typecode);
          }
          // Cache unknowns as "no data" so we don't re-fetch on next poll.
          for (const id of batch) {
            if (!typecodeCache.has(id)) typecodeCache.set(id, undefined);
          }
          setTick((t) => t + 1);
        } catch {
          // Silent: the next poll will retry.
        }
      }
    })();
  }, [flights]);

  return known;
}
