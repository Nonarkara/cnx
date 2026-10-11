// CNX flood module — provenance is load-bearing, and it has to be true at
// the source, not just where it is consumed.
//
// History: the module once served hash-seeded scenario numbers as the
// DEFAULT payload of the flood panel, gated on CNX_FLOOD_LIVE whose live
// branch was a `return null` placeholder. Since 2026-10-11 the default
// carries no figures at all, and the scenario exists only behind an
// explicit `?scenario=<id>` drill, labelled as one. These tests pin both
// halves, at the module and at the route.
//
// Run: `npx vitest run src/lib/cnx/flood-provenance.test.ts`

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fetchCnxFlood, isDrillId, DRILL_LABEL } from "./flood";
import { GET } from "../../app/api/cnx/flood/route";
import type { CnxFloodResponse } from "../../types/cnx";

async function getRoute(query = ""): Promise<CnxFloodResponse> {
  const res = await GET(new Request(`https://cnx.test/api/cnx/flood${query}`));
  expect(res.status).toBe(200);
  return (await res.json()) as CnxFloodResponse;
}

describe("fetchCnxFlood — no scenario without ?scenario", () => {
  const saved = process.env.CNX_FLOOD_LIVE;
  beforeEach(() => {
    delete process.env.CNX_FLOOD_LIVE;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.CNX_FLOOD_LIVE;
    else process.env.CNX_FLOOD_LIVE = saved;
  });

  it("returns no figures and says where the live parts are", async () => {
    const d = await fetchCnxFlood();
    expect(d.provenance).toBe("unavailable");
    expect(d.gauges).toEqual([]);
    expect(d.rainfall).toEqual([]);
    expect(d.reservoirs).toEqual([]);
    expect(d.pingCapacityFraction).toBeUndefined();
    expect(d.drill ?? null).toBeNull();
    expect(d.provenanceNote?.en).toMatch(/river-level.*rain.*dam/);
  });

  it("ignores the retired CNX_FLOOD_LIVE gate — it can no longer mint 'live'", async () => {
    process.env.CNX_FLOOD_LIVE = "1";
    const d = await fetchCnxFlood();
    expect(d.provenance).toBe("unavailable");
    expect(d.gauges).toEqual([]);
  });

  it("treats a malformed scenario id as no scenario", async () => {
    for (const bad of ["", "../etc", "A".repeat(10), "x".repeat(60), "<script>"]) {
      expect(isDrillId(bad)).toBe(false);
      expect((await fetchCnxFlood(bad)).provenance).toBe("unavailable");
    }
  });
});

describe("fetchCnxFlood — drill mode", () => {
  it("labels the scenario as a drill in both languages", async () => {
    const d = await fetchCnxFlood("monsoon-flood-watch");
    expect(d.provenance).toBe("scenario");
    expect(d.drill).toEqual({ id: "monsoon-flood-watch", ...DRILL_LABEL });
    expect(d.drill?.th).toMatch(/ซ้อมแผน/);
    expect(d.drill?.en).toMatch(/DRILL/);
    expect(d.provenanceNote?.th).toMatch(/จำลอง/);
    expect(d.provenanceNote?.en).toMatch(/not measured/);
    expect(d.gauges.length).toBeGreaterThan(0);
  });

  it("rehearses high water only for the flood drill", async () => {
    const flood = await fetchCnxFlood("monsoon-flood-watch");
    const calm = await fetchCnxFlood("stable-winter-day");
    expect(flood.pingCapacityFraction ?? 0).toBeGreaterThan(0.75);
    expect(calm.pingCapacityFraction ?? 1).toBeLessThan(0.7);
  });

  it("never attributes a notice to a government agency on drill data", async () => {
    const d = await fetchCnxFlood("monsoon-flood-watch");
    expect(d.office ?? null).toBeNull();
  });
});

describe("GET /api/cnx/flood", () => {
  it("serves no scenario numbers without ?scenario", async () => {
    const d = await getRoute();
    expect(d.provenance).toBe("unavailable");
    expect(d.gauges).toEqual([]);
    expect(d.reservoirs).toEqual([]);
  });

  it("reads ?scenario= (the audit found it dropped) and labels the drill", async () => {
    const d = await getRoute("?scenario=monsoon-flood-watch");
    expect(d.provenance).toBe("scenario");
    expect(d.drill?.id).toBe("monsoon-flood-watch");
    expect(d.drill?.th).toBe(DRILL_LABEL.th);
  });
});
