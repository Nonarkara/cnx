// CNX fires — the FIRMS parser and the live fetch.
//
// These tests exist because the live path had never run. FIRMS_MAP_KEY was
// unset from the day this dashboard shipped, so `fetchFirmsInBbox` had never
// executed against a real response, and the module was written against an
// archived CSV. The three defects that produced were all of the same shape:
// **a value we could not read came out as the most reassuring value we
// could have printed.** Confidence `n` → NaN; satellite `"N"` → an
// impossible cast; brightness missing → severity `"good"`.
//
// The rule the whole file defends: an unreadable value must never read as
// a quiet one. Every test below asserts the loud direction as well as the
// quiet one, because a guard that only ever fires one way is decoration.
//
// Run: `npx vitest run src/lib/cnx/fires.test.ts

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { parseFirmsCsv, parseConfidence } from "./fires";

const BBOX = { west: 96, south: 16, east: 102, north: 22 };

const FULL_HEADER =
  "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight";

/** A row stamped `hoursAgo` before now, so the 24 h filter is testable. */
function row(hoursAgo: number, opts: { bright?: string; conf?: string; sat?: string } = {}) {
  const d = new Date(Date.now() - hoursAgo * 3_600_000);
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 13) + d.toISOString().slice(14, 16);
  return [
    "18.80",
    "98.98",
    opts.bright ?? "352.10",
    "0.4",
    "0.4",
    date,
    time,
    opts.sat ?? "S",
    "VIIRS",
    opts.conf ?? "n",
    "2.0NRT",
    "300.0",
    "8.4",
    "D",
  ].join(",");
}

function csv(...rows: string[]): string {
  return [FULL_HEADER, ...rows].join("\n");
}

describe("parseFirmsCsv — an unreadable value must not read as a quiet one", () => {
  it("reports unknown severity when the source carries no brightness column", () => {
    // LANDSAT ships no brightness or FRP column at all. `cells[-1]` is
    // undefined, `+undefined` is NaN, and NaN fails every rung of the
    // severity ladder — which used to land it on "good".
    const noBright = [
      "latitude,longitude,scan,track,acq_date,acq_time,satellite,instrument,confidence,version",
      "18.80,98.98,0.4,0.4,2026-09-30,1234,S,VIIRS,n,2.0NRT",
    ].join("\n");
    const [hotspot] = parseFirmsCsv(noBright, BBOX);
    expect(hotspot.severity).toBe("unknown");
    expect(hotspot.brightness).toBeNull();
    expect(hotspot.severity).not.toBe("good");
  });

  it("reports unknown severity when the brightness cell is empty", () => {
    const [hotspot] = parseFirmsCsv(csv(row(1, { bright: "" })), BBOX);
    expect(hotspot.severity).toBe("unknown");
    expect(hotspot.brightness).toBeNull();
  });

  it("still grades a real brightness on both sides of the boundary", () => {
    // The other direction — the guard must not have disabled the grading.
    const cool = parseFirmsCsv(csv(row(1, { bright: "300.0" })), BBOX)[0];
    const hot = parseFirmsCsv(csv(row(1, { bright: "365.0" })), BBOX)[0];
    expect(cool.severity).toBe("good");
    expect(cool.brightness).toBe(300);
    expect(hot.severity).toBe("critical");
    expect(hot.brightness).toBe(365);
  });
});

describe("parseConfidence / normaliseSatellite — the NRT shapes", () => {
  it("reads the VIIRS categorical tokens, not a numeric parse", () => {
    // NASA: "For VIIRS, the confidence values are set to low, nominal, and
    // high." A bare numeric parse of "n" is NaN.
    expect(parseConfidence("n")).toBeGreaterThan(0);
    expect(Number.isNaN(parseConfidence("n"))).toBe(false);
    expect(parseConfidence("l")).toBeLessThan(parseConfidence("n"));
    expect(parseConfidence("n")).toBeLessThan(parseConfidence("h"));
  });

  it("still accepts an archived numeric confidence", () => {
    expect(parseConfidence("80")).toBe(80);
  });

  it("never returns NaN for any unparseable cell", () => {
    for (const cell of ["", "  ", "?", "low", "H"]) {
      expect(Number.isFinite(parseConfidence(cell)), `cell ${JSON.stringify(cell)}`).toBe(true);
    }
  });

  it("normalises NRT satellite letters to the declared union", () => {
    // "N" reaches the UI and the plume weighting on the archived path.
    const [hotspot] = parseFirmsCsv(csv(row(1, { sat: "N" })), BBOX);
    expect(["NOAA-20", "NOAA-21", "SUOMI-NPP", "TERRA", "AQUA"]).toContain(hotspot.satellite);
  });
});

describe("fetchFirmsInBbox — unknown, clear, and detections are three states", () => {
  const savedKey = process.env.FIRMS_MAP_KEY;

  beforeEach(() => {
    process.env.FIRMS_MAP_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedKey === undefined) delete process.env.FIRMS_MAP_KEY;
    else process.env.FIRMS_MAP_KEY = savedKey;
  });

  function stubFirms(body: string, ok = true, status = 200) {
    vi.stubGlobal("fetch", async () => new Response(body, { status }));
    if (!ok) vi.stubGlobal("fetch", async () => new Response(body, { status }));
  }

  it("reports unknown when the pass has not been published (header only)", async () => {
    // Not "the sky is clear" — we do not know yet.
    stubFirms(FULL_HEADER);
    const { fetchFirmsInBbox } = await import("./fires");
    expect(await fetchFirmsInBbox(BBOX)).toBeNull();
  });

  it("reports a live, genuinely empty 24 h when yesterday had fire and today does not", async () => {
    // The state a blanket "empty → null" cannot express, and the one that
    // matters in burn season. This is a real answer, not a missing one.
    stubFirms(csv(row(40)));
    const { fetchFirmsInBbox } = await import("./fires");
    expect(await fetchFirmsInBbox(BBOX)).toEqual([]);
  });

  it("keeps detections inside the reported 24 h window", async () => {
    // The fetch asks for 2 days so an empty body can be told from a
    // published one, but the operator is shown a 24-hour number — so the
    // 48-hour tail must be dropped here or the label lies.
    stubFirms(csv(row(1), row(40)));
    const { fetchFirmsInBbox } = await import("./fires");
    const rows = await fetchFirmsInBbox(BBOX);
    expect(rows).toHaveLength(1);
    const t = Date.parse(rows![0].detectedAt);
    expect(Date.now() - t).toBeLessThan(24 * 3_600_000);
  });

  it("reports unknown on a bad key, a quota string, or a transport error", async () => {
    const { fetchFirmsInBbox } = await import("./fires");
    stubFirms("Invalid MAP_KEY.");
    expect(await fetchFirmsInBbox(BBOX)).toBeNull();

    stubFirms("<html>rate limited</html>");
    expect(await fetchFirmsInBbox(BBOX)).toBeNull();

    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    expect(await fetchFirmsInBbox(BBOX)).toBeNull();
  });

  it("reports unknown when the key is absent, never an empty illustration", async () => {
    delete process.env.FIRMS_MAP_KEY;
    const { fetchFirmsInBbox } = await import("./fires");
    expect(await fetchFirmsInBbox(BBOX)).toBeNull();
  });
});

describe("parseFirmsCsv — keeps the acquisition date and the box filter", () => {
  it("drops points outside the requested box and keeps the rest", () => {
    const inBox = csv(row(1));
    const outOfBox = [
      "10.10,80.20,330,0.4,0.4,2026-09-28,0830,N,VIIRS,80,2.0,290,12.5,D",
    ].join("\n");
    const all = `${inBox}\n${outOfBox}`;
    expect(parseFirmsCsv(all, BBOX)).toHaveLength(1);
    expect(parseFirmsCsv(all, { west: 79, south: 9, east: 81, north: 11 })).toHaveLength(1);
    expect(parseFirmsCsv(all, { west: 70, south: 5, east: 110, north: 25 })).toHaveLength(2);
  });
});
