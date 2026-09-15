"use client";

// The CNX war-room page.
//
// Three things live on one page:
//   1. The map, full bleed, with the flight overlay (planes flying
//      across Chiang Mai's airspace in real time).
//   2. The flight analysis panel — top countries, plane sizes, live
//      counts — anchored to the right edge of the screen, sized so
//      the map keeps its real estate.
//   3. The top bar, identity + manual, anchored to the top.
//
// Polling /api/cnx/flights every 30 s is enough for a wall display
// and a sixth of the upstream-credit cost of 10 s polling.

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import CNXTopBar from "../../components/CNX/CNXTopBar";
import FlightPanel from "../../components/CNX/FlightPanel";
import type { FetchResult } from "../../lib/cnx/opensky";

const CNXMap = dynamic(() => import("../../components/CNX/CNXMap"), { ssr: false });

const POLL_MS = 30_000;

export default function CNXPage() {
  const [snapshot, setSnapshot] = useState<FetchResult>({
    fetchedAt: 0,
    observedAt: 0,
    airborne: [],
    ground: [],
    degraded: true,
    error: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/cnx/flights", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as FetchResult;
        if (!cancelled) setSnapshot(data);
      } catch (e) {
        if (!cancelled) {
          setSnapshot((s) => ({ ...s, degraded: true, error: (e as Error).message }));
        }
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <main className="flex h-screen w-screen flex-col bg-[var(--bg)]">
      <CNXTopBar />
      <div className="flex flex-1 overflow-hidden">
        <section className="relative flex-1">
          <CNXMap flights={snapshot.airborne} />
        </section>
        <section className="hidden w-[280px] shrink-0 border-l border-[var(--line)] md:block">
          <FlightPanel snapshot={snapshot} />
        </section>
      </div>
    </main>
  );
}
