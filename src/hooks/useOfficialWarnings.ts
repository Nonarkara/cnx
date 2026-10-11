"use client";

// TMD official warnings (/api/cnx/official-warnings) for the watch board and
// the map. Both mount this hook; one module-level request serves both, so the
// feed is read once per 10-minute cycle however many surfaces show it.

import { useEffect, useState } from "react";
import { fetchJsonOrNull } from "../lib/client-requests";
import type { OfficialWarningsResponse } from "../lib/cnx/tmd-cap-core";

const ENDPOINT = "/api/cnx/official-warnings";
const REFRESH_MS = 10 * 60_000;
/** Requests younger than this are shared between components. */
const SHARE_MS = 60_000;

let shared: { at: number; request: Promise<OfficialWarningsResponse | null> } | null = null;

function load(): Promise<OfficialWarningsResponse | null> {
  if (!shared || Date.now() - shared.at > SHARE_MS) shared = { at: Date.now(), request: fetchJsonOrNull<OfficialWarningsResponse>(ENDPOINT) };
  return shared.request;
}

/** Test seam. */
export function __resetOfficialWarningsForTests(): void {
  shared = null;
}

/** Null until a read lands (the row then says "unavailable"); a failed refresh keeps the last answer, whose age stamp keeps counting. */
export function useOfficialWarnings(): OfficialWarningsResponse | null {
  const [data, setData] = useState<OfficialWarningsResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = () => void load().then((d) => { if (!cancelled && d) setData(d); });
    tick();
    const interval = window.setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);
  return data;
}
