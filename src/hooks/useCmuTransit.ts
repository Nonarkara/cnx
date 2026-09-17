"use client";

// Client-side hook for CMU's live shuttle-bus MQTT feed. Runs entirely
// in the browser — see lib/cnx/cmu-transit.ts for why. Dynamically
// imports `mqtt` so it never touches the server bundle (the package
// pulls in Node stream/TLS shims that Next's client webpack build
// doesn't need to see).

import { useEffect, useRef, useState } from "react";
import {
  CMU_TRANSIT_WS_URL,
  CMU_TRANSIT_TOPIC,
  CMU_BUS_STALE_MS,
  parseCmuTransitMessage,
  type CmuBusPosition,
} from "../lib/cnx/cmu-transit";

export function useCmuTransitBuses(enabled: boolean): CmuBusPosition[] {
  const [buses, setBuses] = useState<Map<string, CmuBusPosition>>(new Map());
  const busesRef = useRef(buses);
  busesRef.current = buses;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let client: import("mqtt").MqttClient | null = null;

    (async () => {
      try {
        const mqtt = await import("mqtt");
        if (cancelled) return;
        client = mqtt.connect(CMU_TRANSIT_WS_URL, {
          clientId: `cnx-dashboard-${Math.random().toString(16).slice(2)}`,
          reconnectPeriod: 3000,
          connectTimeout: 15_000,
        });
        client.on("connect", () => {
          client?.subscribe(CMU_TRANSIT_TOPIC, { qos: 0 });
        });
        client.on("message", (_topic: string, payload: Uint8Array) => {
          const parsed = parseCmuTransitMessage(payload.toString());
          if (!parsed) return;
          const next = new Map(busesRef.current);
          next.set(parsed.bus, parsed);
          busesRef.current = next;
          setBuses(next);
        });
        client.on("error", (e: Error) => {
          console.warn(`[cmu-transit] mqtt error: ${e.message}`);
        });
      } catch (e) {
        console.warn(`[cmu-transit] failed to load mqtt client: ${(e as Error).message}`);
      }
    })();

    // Drop buses we haven't heard from in a while (driver logged off,
    // GPS lost) so the map doesn't show a frozen ghost bus forever.
    const pruneId = window.setInterval(() => {
      const cutoff = Date.now() - CMU_BUS_STALE_MS;
      const next = new Map(
        [...busesRef.current].filter(([, b]) => b.updatedAt >= cutoff),
      );
      if (next.size !== busesRef.current.size) {
        busesRef.current = next;
        setBuses(next);
      }
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(pruneId);
      client?.end(true);
    };
  }, [enabled]);

  return enabled ? [...buses.values()] : [];
}
