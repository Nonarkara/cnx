// CNX FIRMS — tests against the payload a LIVE map-key actually returns.
//
// WHY THIS FILE EXISTS
//
// fires.ts shipped with one test built from an ARCHIVED FIRMS CSV. The
// live /api/area/csv endpoint (VIIRS_SNPP_NRT) is a different shape in two
// columns that matter:
//
//   confidence   archived -> a 0-100 integer.  NRT -> the letter n/l/h.
//                `+cells[idx.confidence]` on "n" yields NaN, so every
//                hotspot came back confidence: null on a field typed
//                `number`. The panel showed "unknown confidence" for
//                every single detection while looking otherwise healthy.
//
//   satellite    archived -> "SUOMI-NPP".   NRT -> a single letter
//                (S/N/J/M). The old cast put "N" through the
//                FireHotspot union, so a value the type system called
//                impossible reached the UI and the plume weighting.
//
// Neither showed up because the live path had never run: FIRMS_MAP_KEY
// has been unset in production since this dashboard shipped. These tests
// use a byte-shape copied from the real NRT response so the bugs cannot
// come back the day the key is provisioned.

import { describe, expect, it, vi, afterEach } from "vitest";
import { normaliseSatellite, parseConfidence, parseFirmsCsv, fetchFirmsInBbox } from "./fires";

const HEADER =
  "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight";

/** Exactly what /api/area/csv/<KEY>/VIIRS_SNPP_NRT/... returns. */
const NRT_CSV = [
  HEADER,
  "18.8000,98.9800,342.53,0.39,0.53,2026-09-30,0454,N,VIIRS,n,2.0,318.20,14.30,D",
  "19.1500,99.4000,325.10,0.40,0.60,2026-09-30,0454,N,VIIRS,h,2.0,301.00,4.10,D",
  "18.4000,98.5000,331.00,0.38,0.55,2026-09-30,0512,S,VIIRS,l,2.0,305.00,9.90,D",
].join("\n");

const BOX = { west: 98, south: 18, east: 100, north: 20 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  process.env.FIRMS_MAP_KEY = "";
});

describe("parseConfidence", () => {
  it("maps the NRT letters rather than producing NaN", () => {
    expect(parseConfidence("n")).toBe(65);
    expect(parseConfidence("l")).toBe(30);
    expect(parseConfidence("h")).toBe(95);
    expect(Number.isNaN(parseConfidence("n"))).toBe(false);
  });

  it("still accepts the archived numeric form", () => {
    expect(parseConfidence("90")).toBe(90);
    expect(parseConfidence("")).toBe(0);
    expect(parseConfidence(undefined)).toBe(0);
  });
});

describe("normaliseSatellite", () => {
  it("expands the NRT single-letter codes", () => {
    expect(normaliseSatellite("N")).toBe("NOAA-20");
    expect(normaliseSatellite("S")).toBe("SUOMI-NPP");
    expect(normaliseSatellite("J")).toBe("NOAA-21");
    expect(normaliseSatellite("T")).toBe("TERRA");
    expect(normaliseSatellite("A")).toBe("AQUA");
  });

  it("passes full archived names through unchanged", () => {
    expect(normaliseSatellite("SUOMI-NPP")).toBe("SUOMI-NPP");
    expect(normaliseSatellite("NOAA-20")).toBe("NOAA-20");
    expect(normaliseSatellite("NOAA-21")).toBe("NOAA-21");
  });

  it("never returns a raw single letter into the typed union", () => {
    const allowed = ["SUOMI-NPP", "NOAA-20", "NOAA-21", "TERRA", "AQUA"];
    for (const raw of ["N", "S", "J", "T", "A", "?", "", undefined]) {
      expect(allowed).toContain(normaliseSatellite(raw));
    }
  });
});

describe("parseFirmsCsv against a live NRT payload", () => {
  it("gives every hotspot a numeric confidence and a real satellite name", () => {
    const rows = parseFirmsCsv(NRT_CSV, BOX);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(typeof r.confidence).toBe("number");
      expect(Number.isNaN(r.confidence)).toBe(false);
      expect(["SUOMI-NPP", "NOAA-20", "NOAA-21", "TERRA", "AQUA"]).toContain(r.satellite);
    }
    // The regression itself: "n" must not become null.
    expect(rows.every((r) => r.confidence !== null)).toBe(true);
  });

  it("orders confidence by the NRT letter it was given", () => {
    const [noaa20Low, noaa20High, snpp] = parseFirmsCsv(NRT_CSV, BOX);
    expect(noaa20Low?.confidence).toBe(65); // n
    expect(noaa20High?.confidence).toBe(95); // h
    expect(snpp?.confidence).toBe(30); // l
  });

  it("keeps reading FRP so plume weighting still works", () => {
    const rows = parseFirmsCsv(NRT_CSV, BOX);
    expect(rows.map((r) => r.frp)).toEqual([14.3, 4.1, 9.9]);
  });

  it("still drops points outside the requested box", () => {
    const inside = parseFirmsCsv(NRT_CSV, { west: 98.9, south: 18.7, east: 99, north: 19 });
    expect(inside).toHaveLength(1);
    expect(inside[0]?.longitude).toBeCloseTo(98.98);
  });
});

describe("fetchFirmsInBbox failure handling", () => {
  const stub = (impl: (input: RequestInfo | URL) => Response | Promise<Response>) =>
    vi.stubGlobal("fetch", vi.fn(impl));

  it("returns null with no key and makes no request", async () => {
    process.env.FIRMS_MAP_KEY = "";
    const calls: string[] = [];
    stub(() => {
      calls.push("called");
      return new Response(NRT_CSV, { status: 200 });
    });
    expect(await fetchFirmsInBbox(BOX)).toBeNull();
    expect(calls).toEqual([]);
  });

  it("requests a two-day window, not one day", async () => {
    // A one-day window anchored to UTC returns a valid EMPTY body for
    // hours each day while the province runs on UTC+7, which is
    // indistinguishable from "no fires anywhere" and reads as a false
    // all-clear on a haze board.
    process.env.FIRMS_MAP_KEY = "TESTKEY";
    const urls: string[] = [];
    stub((input) => {
      urls.push(String(input));
      return Promise.resolve(new Response(NRT_CSV, { status: 200 }));
    });
    await fetchFirmsInBbox(BOX);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/2/");
    expect(urls[0]).not.toContain("/1/");
  });

  it("treats an empty published pass as unknown, never as a clear sky", async () => {
    process.env.FIRMS_MAP_KEY = "TESTKEY";
    stub(() => Promise.resolve(new Response("", { status: 200 })));
    expect(await fetchFirmsInBbox(BOX)).toBeNull();
  });

  it("falls back on a bad key instead of reporting zero fires", async () => {
    process.env.FIRMS_MAP_KEY = "BAD";
    stub(() => Promise.resolve(new Response("Invalid MAP_KEY.", { status: 400 })));
    expect(await fetchFirmsInBbox(BOX)).toBeNull();
  });

  it("falls back when FIRMS answers a quota error with HTTP 200", async () => {
    // FIRMS returns -1 / error text in the body with a 200 status for some
    // rejection paths, so a status check alone is not enough.
    process.env.FIRMS_MAP_KEY = "TESTKEY";
    stub(() => Promise.resolve(new Response("-1", { status: 200 })));
    expect(await fetchFirmsInBbox(BOX)).toBeNull();
  });

  it("falls back on rate limiting", async () => {
    process.env.FIRMS_MAP_KEY = "TESTKEY";
    stub(() => Promise.resolve(new Response("", { status: 429 })));
    expect(await fetchFirmsInBbox(BOX)).toBeNull();
  });

  it("returns real detections when the pass is healthy", async () => {
    process.env.FIRMS_MAP_KEY = "TESTKEY";
    stub(() => Promise.resolve(new Response(NRT_CSV, { status: 200 })));
    const rows = await fetchFirmsInBbox(BOX);
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(3);
  });
});

describe("NRT archive rotation", () => {
  const H = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight";
  const today = new Date().toISOString().slice(0, 10);
  const row = `18.8,98.98,342.53,0.39,0.53,${today},0454,N,VIIRS,n,2.0,318.20,14.30,D`;
  const BOX2 = { west: 98, south: 18, east: 100, north: 20 };

  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); process.env.FIRMS_MAP_KEY = ""; });

  it("falls through to a later archive when the first is retired", async () => {
    // NASA returns HTTP 200 with the body "Invalid source." for a retired
    // archive — not an error status. A hardcoded source name therefore goes
    // dark silently the day FIRMS renames one.
    process.env.FIRMS_MAP_KEY = "K";
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      if (String(input).includes("VIIRS_SNPP_NRT")) return new Response("Invalid source.", { status: 200 });
      return new Response([H, row].join("\n"), { status: 200 });
    }));
    const rows = await fetchFirmsInBbox(BOX2);
    expect(rows).toHaveLength(1);
    expect(urls[0]).toContain("VIIRS_SNPP_NRT");
    expect(urls[1]).not.toContain("VIIRS_SNPP_NRT");
  });

  it("stops immediately on a bad key rather than burning quota on every archive", async () => {
    // The key is validated BEFORE the source, so a bad key produces the
    // identical answer for all three archives. Retrying would triple the
    // transactions against an already-rejected key.
    process.env.FIRMS_MAP_KEY = "BAD";
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => { calls += 1; return new Response("Invalid MAP_KEY.", { status: 400 }); }));
    expect(await fetchFirmsInBbox(BOX2)).toBeNull();
    expect(calls).toBe(1);
  });

  it("stops on a quota 429 for the same reason", async () => {
    process.env.FIRMS_MAP_KEY = "K";
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => { calls += 1; return new Response("", { status: 429 }); }));
    expect(await fetchFirmsInBbox(BOX2)).toBeNull();
    expect(calls).toBe(1);
  });

  it("names the problem when every archive is retired", async () => {
    process.env.FIRMS_MAP_KEY = "K";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Invalid source.", { status: 200 })));
    // Read the reason from the SAME module instance that did the fetch —
    // lastFirmsFailure is module-level, and afterEach resetModules would
    // hand back a fresh copy with a null reason.
    const { fetchFirmsInBbox: call, firmsFailureReason } = await import("./fires");
    expect(await call(BOX2)).toBeNull();
    expect(firmsFailureReason()).toMatch(/every known NRT archive/);
  });

  it("still returns a live zero when a healthy archive answers with no rows", async () => {
    // The wet-season case: NASA answers clearly, there is simply no fire.
    process.env.FIRMS_MAP_KEY = "K";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(H, { status: 200 })));
    expect(await fetchFirmsInBbox(BOX2)).toEqual([]);
  });
});
