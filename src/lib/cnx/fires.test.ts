import { describe, expect, it } from "vitest";
import { parseFirmsCsv } from "./fires";

const CSV = [
  "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight",
  "20.10,97.20,330,0.4,0.4,2026-09-28,0830,N,VIIRS,80,2.0,290,12.5,D",
  "18.80,98.98,340,0.4,0.4,2026-09-28,0900,N,VIIRS,90,2.0,300,8.0,D",
].join("\n");

describe("parseFirmsCsv", () => {
  it("keeps the acquisition date and drops points outside the requested box", () => {
    const province = parseFirmsCsv(CSV);
    expect(province).toHaveLength(1);
    expect(province[0]?.latitude).toBeCloseTo(18.8);
    expect(province[0]?.detectedAt.startsWith("2026-09-28")).toBe(true);

    const regional = parseFirmsCsv(CSV, { west: 96, south: 16, east: 102, north: 22 });
    expect(regional).toHaveLength(2);
    expect(regional.some((h) => h.longitude === 97.2)).toBe(true);
  });
});
