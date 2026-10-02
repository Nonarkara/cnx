import { describe, expect, it } from "vitest";
import { parseAeronetDaily } from "./aeronet";

describe("AERONET missing observations", () => {
  it("does not convert blank or missing AOD into a measured zero", () => {
    const csv = "AERONET_Site,Date(dd:mm:yyyy),AOD_500nm,440-870_Angstrom_Exponent\nSite,02:10:2026,,\nSite,01:10:2026,0.25,-0.2\nSite,30:09:2026,-999,1.2";
    expect(parseAeronetDaily(csv)).toEqual([{ date: "2026-10-01", aod500: 0.25, angstrom440_870: -0.2 }]);
  });
});
