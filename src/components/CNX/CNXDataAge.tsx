// CNX — data age stamp.
//
// Written because the one thing a war room must never do is show a number
// without saying how old it is. A panel that renders "17 µg/m³" and
// nothing else is indistinguishable from one rendering a reading from
// four hours ago, and during an event those are not the same sentence.
//
// Three rules, and they are the whole component:
//
//   1. Age the OBSERVATION, not the response. `generatedAt` is when the
//      Worker rebuilt the JSON; it is fresh every poll even when the
//      upstream has been dark for hours. A stamp on `generatedAt` is
//      worse than no stamp, because it converts an unknown into a
//      reassurance.
//   2. No observation, no age. Never fall back to "now", never render
//      0m, and never spin. "no observation" is a complete answer and a
//      true one.
//   3. Past the threshold it says so, in amber, and stays legible. The
//      reader decides what to do about it.
//
// Why it exists: reviewing a rival crowd-sourced flood tool, the sharpest
// criticism was that a dead sensor gives you an infinite spinner rather
// than "ข้อมูลไม่พอ". CNX had the same hole in a different shape — honest
// provenance on every number, and no statement anywhere of how old the
// measurement underneath it was.

"use client";

import { useEffect, useState } from "react";

function ageMs(observedAt: string | number | null | undefined, now: number): number | null {
  if (observedAt === null || observedAt === undefined) return null;
  const t = typeof observedAt === "number" ? observedAt : Date.parse(observedAt);
  if (!Number.isFinite(t)) return null;
  return now - t;
}

function humanAge(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr} h ago`;
  return `${Math.floor(hr / 24)} d ago`;
}

export interface DataAgeProps {
  /** Observation time — an ISO string or epoch ms. Null/undefined means
   *  "we have no reading", and that is rendered, not hidden. */
  observedAt?: string | number | null;
  /** Source name shown in the stamp. */
  source: string;
  /** Past this, the stamp turns amber. Defaults to 3 h, the DustBoy
   *  batch rule this project has used since the stale-feed incident. */
  staleAfterMs?: number;
  /** Overrides the missing-observation wording. */
  missing?: string;
  className?: string;
}

export function DataAge({
  observedAt,
  source,
  staleAfterMs = 3 * 3_600_000,
  missing,
  className = "",
}: DataAgeProps) {
  // Re-render on a timer so "4 min ago" does not freeze at whatever it
  // said when the panel mounted. A stamp that stops counting is a second
  // way of lying about age.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Before mount we have no clock, so we know an observation exists or it
  // doesn't, but not how old it is. Say only what is true.
  const ms = now === null ? null : ageMs(observedAt, now);
  const hasObservation = observedAt !== null && observedAt !== undefined && observedAt !== "";

  let text: string;
  let tone: string;
  if (!hasObservation) {
    text = missing ?? "no observation";
    tone = "opacity-70";
  } else if (ms === null) {
    text = "timestamp unreadable";
    tone = "opacity-70";
  } else if (ms < 0) {
    // Clock skew between us and the publisher. Saying "in 4 h" would be
    // absurd; saying so is the honest reading of a future timestamp.
    text = "timestamp is in the future";
    tone = "text-[#f59e0b]";
  } else if (ms > staleAfterMs) {
    text = humanAge(ms);
    tone = "text-[#f59e0b]";
  } else {
    text = humanAge(ms);
    tone = "opacity-70";
  }

  return (
    <span className={`font-mono text-[9px] tracking-[0.08em] ${tone} ${className}`.trim()}>
      {source} · {text}
    </span>
  );
}

/** Newest observation in a list of things that may carry one. `null` when
 *  the list is empty — an empty feed is not a fresh feed.
 *
 *  `key` exists because feeds disagree on the field name: gauge rows
 *  carry `observedAt`, Google's status feed carries `issuedTime`. Guessing
 *  one name for both would silently render "no observation" on a panel
 *  that has one. */
export function newest<T>(
  items: T[] | undefined | null,
  key: keyof T & string = "observedAt",
): string | number | null {
  if (!items || items.length === 0) return null;
  let best: number | null = null;
  let raw: string | number | null = null;
  for (const it of items) {
    const t = it?.[key] as string | number | null | undefined;
    if (t === null || t === undefined || t === "") continue;
    const ms = typeof t === "number" ? t : Date.parse(t);
    if (!Number.isFinite(ms)) continue;
    if (best === null || ms > best) {
      best = ms;
      raw = t;
    }
  }
  return raw;
}
