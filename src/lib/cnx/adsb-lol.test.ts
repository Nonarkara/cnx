import { afterEach, describe, expect, it, vi } from "vitest";
import { countryFromRegistration, fetchAdsbLolStates } from "./adsb-lol";

describe("countryFromRegistration", () => {
  it.each([
    ["HS-VZC", "Thailand"],
    ["9V-NCB", "Singapore"],
    ["B-HNR", "Hong Kong"],
    ["B-1234", "China"],
    ["B-18901", "Taiwan"],
    ["JA801A", "Japan"],
    ["N123AB", "United States"],
    ["", ""],
    [undefined, ""],
  ])("%s → %s", (reg, country) => {
    expect(countryFromRegistration(reg)).toBe(country);
  });
});

describe("fetchAdsbLolStates", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("converts readsb units and keeps type + registration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            now: 1_000_000,
            ac: [
              { hex: "885b43", flight: "TVJ416  ", r: "HS-VZC", t: "B38M", alt_baro: 1000, gs: 100, track: 90, baro_rate: 1000, lat: 18.8, lon: 99.0, seen: 1 },
              { hex: "~abc", alt_baro: "ground", lat: 18.77, lon: 98.96 },
              { hex: "nopos" },
            ],
          }),
        ),
      ),
    );
    const out = await fetchAdsbLolStates();
    expect(out?.states).toHaveLength(2);
    const [air, ground] = out!.states;
    expect(air).toMatchObject({ icao24: "885b43", callsign: "TVJ416", originCountry: "Thailand", typecode: "B38M", onGround: false });
    expect(air.baroAltitude).toBeCloseTo(304.8, 1);
    expect(air.velocity).toBeCloseTo(51.44, 2);
    expect(air.verticalRate).toBeCloseTo(5.08, 2);
    expect(ground).toMatchObject({ icao24: "abc", onGround: true, baroAltitude: 0 });
  });

  it("returns null when the upstream fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    expect(await fetchAdsbLolStates()).toBeNull();
  });
});
