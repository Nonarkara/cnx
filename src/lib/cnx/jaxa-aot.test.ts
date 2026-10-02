// JAXA GCOM-C AOT — catalogue resolution.
//
// These tests pin the two things that are easy to get wrong and expensive
// to discover late: which longitude band a province falls in, and that a
// missing pass is reported as a missing pass.
//
// The no-observation sentinel is not tested here because it is not ours to
// interpret — it is read from the Item's own `je:rasters` declaration. What
// is tested is that we never invent one.
//
// Run: `npx vitest run src/lib/cnx/jaxa-aot.test.ts

import { describe, expect, it, vi } from "vitest";
import { bandForLon, itemPathFor, resolveAotItem, JAXA_AOT_NODATA, JAXA_AOT_SCALE } from "./jaxa-aot";

const CNX_LON = 98.98;

describe("bandForLon — the eastern/western split is the only non-date part", () => {
  it("puts Chiang Mai in the eastern band", () => {
    expect(bandForLon(CNX_LON)).toBe("E000.00-E180.00");
  });

  it("splits on the sign, and sends exactly 0 east", () => {
    // The catalogue's bands are [0,180] and [-180,0]. Zero belongs to the
    // eastern one because the band name is E000.00-E180.00 inclusive at 0.
    expect(bandForLon(0)).toBe("E000.00-E180.00");
    expect(bandForLon(-0.1)).toBe("W180.00-E000.00");
    expect(bandForLon(179.9)).toBe("E000.00-E180.00");
    expect(bandForLon(-179.9)).toBe("W180.00-E000.00");
  });
});

describe("itemPathFor — the walk is deterministic from the date", () => {
  it("produces the five hops the catalogue actually serves", () => {
    expect(itemPathFor("2026-09-29", CNX_LON)).toBe(
      "2026-09/29/0/E000.00-E180.00/S90.00-N90.00.json",
    );
  });

  it("changes only the band when the longitude changes hemisphere", () => {
    const east = itemPathFor("2026-09-29", 98.98);
    const west = itemPathFor("2026-09-29", -98.98);
    expect(east).not.toBe(west);
    expect(west).toContain("W180.00-E000.00");
  });
});

describe("resolveAotItem — a missing pass is a missing pass", () => {
  const goodItem = {
    type: "Feature",
    properties: {
      start_datetime: "2026-09-28T23:59:49.190000Z",
      end_datetime: "2026-09-30T00:02:20.400000Z",
      platform: "GCOM-C",
      instrument: "SGLI",
      license: "proprietary",
    },
    assets: {
      AROT: {
        // Relative on purpose: every flat shortcut 404s because of this.
        href: "./E000.00-S90.00-E180.00-N90.00-AROT.tiff",
        "je:rasters": {
          dn: { data_type: "uint16", min: 10.0, max: 50000.0, nodata: 65535.0, error: [65535.0] },
          dn2value: { slope: 9.999999747378752e-05, offset: 0.0 },
        },
      },
    },
  };

  const stub = (body: unknown, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("resolves a relative href against the Item, which is the whole trick", async () => {
    const { item } = await resolveAotItem("2026-09-29", CNX_LON, stub(goodItem));
    expect(item).not.toBeNull();
    expect(item!.cogUrl).toBe(
      "https://s3.ap-northeast-1.wasabisys.com/je-pds/cog/v1/" +
        "JAXA.G-Portal_GCOM-C.SGLI_standard.L3-AROT.daytime.v3_global_daily/" +
        "2026-09/29/0/E000.00-E180.00/E000.00-S90.00-E180.00-N90.00-AROT.tiff",
    );
    expect(item!.cogUrl).not.toContain("./");
  });

  it("carries the observation window, not the request time", () => {
    return resolveAotItem("2026-09-29", CNX_LON, stub(goodItem)).then(({ item }) => {
      expect(item!.observedFrom).toBe("2026-09-28T23:59:49.190000Z");
      expect(item!.observedTo).toBe("2026-09-30T00:02:20.400000Z");
      expect(item!.platform).toBe("GCOM-C");
      // The licence travels with the data, so a caller cannot forget it.
      expect(item!.license).toBe("proprietary");
    });
  });

  it("reports a date outside the product's extent as unknown, not a clear sky", async () => {
    // Checked live and worth recording: every date from 2018-01-01 onward
    // DOES resolve, because GCOM-C SGLI is a daily global product. So the
    // absence case is *not* a missing day — it is 65535 pixels inside a
    // scene that exists, which is the cloud-swath problem. The temporal
    // guard is only for dates before the record starts.
    const { item, reason } = await resolveAotItem(
      "2017-12-31",
      CNX_LON,
      (async () => new Response("not found", { status: 404 })) as unknown as typeof fetch,
    );
    expect(item).toBeNull();
    expect(reason).toMatch(/no GCOM-C pass/i);
  });

  it("refuses to invent a href when the collection placeholder leaks through", async () => {
    // collection.json carries assets.AROT.href === "N/A" and item_assets null.
    // Reaching that state means the walk stopped short, and the correct
    // answer is "I do not have it", not a guess at a filename.
    const { item, reason } = await resolveAotItem("2026-09-29", CNX_LON, stub({ assets: { AROT: { href: "N/A" } } }));
    expect(item).toBeNull();
    expect(reason).toMatch(/no resolved asset href/i);
  });

  it("treats a transport failure as unknown rather than throwing", async () => {
    const { item, reason } = await resolveAotItem(
      "2026-09-29",
      CNX_LON,
      (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    );
    expect(item).toBeNull();
    expect(reason).toMatch(/unreachable/i);
  });
});

describe("fetchLatestAotItem — walks back before it reports absence", () => {
  const goodItem = {
    type: "Feature",
    properties: {
      start_datetime: "2026-09-28T23:59:49.190000Z",
      end_datetime: "2026-09-30T00:02:20.400000Z",
      platform: "GCOM-C",
      instrument: "SGLI",
      license: "proprietary",
    },
    assets: {
      AROT: {
        href: "./E000.00-S90.00-E180.00-N90.00-AROT.tiff",
        "je:rasters": {
          dn: { data_type: "uint16", min: 10.0, max: 50000.0, nodata: 65535.0, error: [65535.0] },
          dn2value: { slope: 9.999999747378752e-05, offset: 0.0 },
        },
      },
    },
  };

  /** The module caches for 30 min, so each case needs a fresh module instance. */
  async function freshFetchLatest() {
    vi.resetModules();
    const mod = await import("./jaxa-aot");
    return mod.fetchLatestAotItem;
  }

  const NOW = new Date("2026-10-02T12:00:00Z");
  const dateDaysAgo = (n: number) =>
    new Date(new Date(NOW).setUTCDate(new Date(NOW).getUTCDate() - n)).toISOString().slice(0, 10);
  // Catalogue URLs carry the date as `YYYY-MM/DD`, not dashed ISO — the
  // stubs below must match the path form or the 404s never happen.
  const pathDate = (iso: string) => `${iso.slice(0, 7)}/${iso.slice(8, 10)}`;

  it("reports today's item when the catalogue carries it", async () => {
    const urls: string[] = [];
    const stub = (async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return new Response(JSON.stringify(goodItem), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await (await freshFetchLatest())(98.98, stub, NOW);
    expect(res.provenance).toBe("live");
    expect(res.resolvedFor).toBe(dateDaysAgo(0));
    expect(res.walkedBackDays).toBe(0);
    expect(res.item!.license).toBe("proprietary");
    expect(urls).toHaveLength(1);
  });

  it("walks back when today's pass is not up yet, and says how far", async () => {
    // Today 404s (the daytime pass publishes with a lag); yesterday resolves.
    // Reporting today's 404 as "no data" is the FIRMS header-only failure —
    // the walk exists so that does not happen.
    const stub = (async (url: RequestInfo | URL) => {
      return String(url).includes(pathDate(dateDaysAgo(0)))
        ? new Response("not found", { status: 404 })
        : new Response(JSON.stringify(goodItem), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await (await freshFetchLatest())(98.98, stub, NOW);
    expect(res.provenance).toBe("live");
    expect(res.resolvedFor).toBe(dateDaysAgo(1));
    expect(res.walkedBackDays).toBe(1);
  });

  it("crosses the month boundary, where the real lag lives", async () => {
    // Verified live 2 October 2026: 2026-10/catalog.json answered 404 on
    // day 2 of the month while 2026-09-30 resolved — every date in an
    // unpublished month 404s regardless of recency. The walk must cross
    // into the previous month and keep going, and report how far it went.
    const stub = (async (url: RequestInfo | URL) => {
      const u = String(url);
      return u.includes("2026-10/")
        ? new Response("not found", { status: 404 })
        : new Response(JSON.stringify(goodItem), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await (await freshFetchLatest())(98.98, stub, NOW);
    expect(res.provenance).toBe("live");
    expect(res.resolvedFor).toBe(dateDaysAgo(2));
    expect(res.walkedBackDays).toBe(2);
  });

  it("eleven clear days are absence, reported as absence — not zero, not a clear sky", async () => {
    const stub = (async () => new Response("not found", { status: 404 })) as unknown as typeof fetch;
    const res = await (await freshFetchLatest())(98.98, stub, NOW);
    expect(res.provenance).toBe("unavailable");
    expect(res.item).toBeNull();
    expect(res.reason).toMatch(/no GCOM-C pass published in the last 11 days/);
  });

  it("an unreachable catalogue is not a clear week", async () => {
    // The walk's own last words carry through: a transport failure and a
    // genuine absence are different states, and flattening them into one
    // sentence would tell operators the satellite is quiet when the
    // catalogue simply did not answer.
    const stub = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const res = await (await freshFetchLatest())(98.98, stub, NOW);
    expect(res.provenance).toBe("unavailable");
    expect(res.reason).toMatch(/unreachable/);
    expect(res.reason).not.toMatch(/no GCOM-C pass/);
  });
});

describe("the sentinel is declared, not chosen", () => {
  it("uses the values JAXA publishes", () => {
    // dn 10..50000 × 1e-4 = 0.001..5.0, and 65535 means "no observation".
    //
    // The slope is 1e-4, not 1e-5. Getting that wrong by a factor of ten
    // is not a rounding error: it turns a hazy AOT of 0.8 into 0.08, which
    // reads as pristine air on a board whose job is to warn. Asserted
    // against the arithmetic rather than copied from a comment.
    expect(JAXA_AOT_NODATA).toBe(65535);
    expect(JAXA_AOT_SCALE).toBeCloseTo(1e-4, 9);
    expect(JAXA_AOT_SCALE * 50000).toBeCloseTo(5.0, 6);
    expect(JAXA_AOT_SCALE * 10).toBeCloseTo(0.001, 6);
  });

  it("lands a realistic AOT where a realistic AOT should land", () => {
    // The GIBS MODIS layer currently reports 0.24 for the city. GCOM-C at
    // 500 nm should agree to within a factor, not land an order of
    // magnitude away. This is the cross-check that catches a bad scale.
    const aotForDn = (dn: number) => dn * JAXA_AOT_SCALE;
    expect(aotForDn(2400)).toBeCloseTo(0.24, 6);
  });
});
