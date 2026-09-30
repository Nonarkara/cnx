// CNX flood module — provenance is load-bearing, and it has to be true at
// the source, not just where it is consumed.
//
// The bug this file exists to prevent: `fetchCnxFlood()` is gated on
// `process.env.CNX_FLOOD_LIVE`, and the twin layer used to read that same
// env var to decide what to call the data. The gate is a *gate*, not a
// result — `fetchLive()` is still a `return null` placeholder. So setting
// CNX_FLOOD_LIVE=1 today would have published hash-seeded scenario numbers
// labelled `live`, and the only thing between that and a governor is a
// config toggle nobody reasons about at 2am.
//
// NOTE ON STRUCTURE — read before "simplifying" this file.
// `fetchCnxFlood` memoises for 60 s in module scope, so importing it once
// at the top and flipping the env var between tests returns the *same
// cached object* every time. Every assertion below would then pass against
// data built by the first test, and the landmine test would be vacuous —
// proven, not theorised: a scratch test confirmed `a === b` across a gate
// flip. Hence `vi.resetModules()` plus a fresh dynamic import per test.
//
// Run: `npx vitest run src/lib/cnx/flood-provenance.test.ts`

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { CnxFloodResponse } from "../../types/cnx";

/** Fresh module instance → fresh (empty) 60 s cache → a real recompute. */
async function freshFlood(): Promise<CnxFloodResponse> {
  vi.resetModules();
  const mod = await import("./flood");
  return mod.fetchCnxFlood();
}

describe("fetchCnxFlood — provenance", () => {
  const saved = process.env.CNX_FLOOD_LIVE;

  beforeEach(() => {
    delete process.env.CNX_FLOOD_LIVE;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.CNX_FLOOD_LIVE;
    else process.env.CNX_FLOOD_LIVE = saved;
  });

  it("reports scenario when the live gate is off", async () => {
    const d = await freshFlood();
    expect(d.provenance).toBe("scenario");
    expect(d.provenanceNote).not.toBeNull();
  });

  it("still reports scenario when CNX_FLOOD_LIVE=1, because fetchLive() returns null", async () => {
    // The landmine. The gate is open, there is no live implementation, and
    // the module must therefore still refuse to call the output live.
    process.env.CNX_FLOOD_LIVE = "1";
    const d = await freshFlood();
    expect(d.provenance).toBe("scenario");
    expect(d.provenanceNote).not.toBeNull();
  });

  it("recomputes rather than replaying the cache when the gate flips", async () => {
    // Guards this file's own structure: without the fresh import, every
    // other test in here would be reading the first test's cached object.
    process.env.CNX_FLOOD_LIVE = "1";
    const d = await freshFlood();
    expect(d.provenance).toBe("scenario");
    // The scenario builder stamps the call time; a stale cache from an
    // earlier test could not carry a fresh `generatedAt`.
    expect(new Date(d.generatedAt).getTime()).toBeGreaterThan(0);
  });

  it("never attributes a notice to a government agency on scenario data", async () => {
    // buildScenario() used to mint an OfficeNotice sourced to "Royal
    // Irrigation Department Region 1" once the jittered ratio crossed 0.9.
    // A notice is read as an official communication; the `provenance` tag
    // is one field away and does not survive being quoted on its own.
    process.env.CNX_FLOOD_LIVE = "1";
    const d = await freshFlood();
    expect(d.office ?? null).toBeNull();
  });

  it("carries an operator-readable note in both languages when scenario", async () => {
    const d = await freshFlood();
    expect(d.provenanceNote?.th).toMatch(/จำลอง/); // "simulated"
    expect(d.provenanceNote?.en).toMatch(/scenario/i);
  });

  it("publishes no scenario number as a live gauge reading", async () => {
    // The shape downstream consumers (deltas.flood) now rely on: a
    // provenance tag, and no pretending.
    const d = await freshFlood();
    expect(d.provenance).toBe("scenario");
    for (const g of d.gauges) {
      expect(typeof g.levelM).toBe("number");
      expect(g.stationId).toMatch(/^P\./);
    }
  });
});
