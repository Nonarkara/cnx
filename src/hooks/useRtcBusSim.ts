"use client";

import { useEffect, useState } from "react";
import { simulateRtcBuses, type RtcLine, type SimBus } from "../lib/cnx/rtc-bus-sim";

const TICK_MS = 2_000;

/** Re-runs the schedule simulation every couple of seconds so buses glide. */
export function useRtcBusSim(lines: RtcLine[], enabled: boolean): SimBus[] {
  const [buses, setBuses] = useState<SimBus[]>([]);

  useEffect(() => {
    if (!enabled || lines.length === 0) {
      setBuses([]);
      return;
    }
    const tick = () => setBuses(simulateRtcBuses(lines, new Date()));
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [lines, enabled]);

  return buses;
}
