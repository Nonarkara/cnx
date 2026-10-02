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
  // "Just now" is decided on the exact value, not the rounded one —
  // otherwise 30 s rounds up to "1 min ago" and a genuinely live reading
  // looks like it has been sitting there a minute.
  if (ms < 60_000) return "just now";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  // Round to nearest unit, never truncate downward. Truncating 90 min to
  // "1 h ago" makes a reading half an hour fresher than it is, which is
  // the one direction a staleness indicator must never err in.
  if (min < 120) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr} h ago`;
  return `${Math.round(hr / 24)} d ago`;
}

export interface AgeVerdict {
  /** What to say after the source name. `null` means: say nothing yet. */
  text: string | null;
  tone: "opacity-70" | "text-[#f59e0b]";
}

/**
 * The wording rules, as a pure function so they can be tested without a
 * DOM. Extracted because the first version of this lived inline in the
 * component, which meant the one case I most wanted to pin — "no clock
 * yet" — had no test at all, and shipped a lie to every hydrated panel.
 */
export function ageVerdict(
  observedAt: string | number | null | undefined,
  now: number | null,
  staleAfterMs: number,
  missing = "no observation",
): AgeVerdict {
  const hasObservation = observedAt !== null && observedAt !== undefined && observedAt !== "";

  // No clock yet (server render, pre-hydration). We know whether an
  // observation exists; we do not know how old it is. Make no claim.
  if (now === null) return { text: null, tone: "opacity-70" };
  if (!hasObservation) return { text: missing, tone: "opacity-70" };

  const ms = ageMs(observedAt, now);
  if (ms === null) return { text: "timestamp unreadable", tone: "opacity-70" };
  // Publisher clock skew. "in 4 h" would be absurd; name the skew.
  if (ms < 0) return { text: "timestamp is in the future", tone: "text-[#f59e0b]" };
  if (ms > staleAfterMs) return { text: `stale · ${humanAge(ms)}`, tone: "text-[#f59e0b]" };
  return { text: humanAge(ms), tone: "opacity-70" };
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

  const { text, tone } = ageVerdict(observedAt, now, staleAfterMs, missing);

  if (text === null) {
    return <span className={`font-mono text-[9px] tracking-[0.08em] ${tone} ${className}`.trim()}>{source}</span>;
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
 *  that has one. Typed as a plain string rather than `keyof T`, because a
 *  caller legitimately asks for a field the element type doesn't declare
 *  — and that is precisely the case worth returning `null` for. */
export function newest<T>(
  items: T[] | undefined | null,
  key: string = "observedAt",
): string | number | null {
  if (!items || items.length === 0) return null;
  let best: number | null = null;
  let raw: string | number | null = null;
  for (const it of items) {
    const t = it == null ? undefined : ((it as Record<string, unknown>)[key] as string | number | null | undefined);
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
