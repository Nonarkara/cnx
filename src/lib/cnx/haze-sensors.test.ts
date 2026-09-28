import { describe, expect, it } from "vitest";
import { parseAeronetDaily } from "./aeronet";
import { parseAir4Thai } from "./air-quality";

describe("parseAeronetDaily", () => {
  const csv = [
    "AERONET Data Download (Version 3 Direct Sun)",
    "AERONET_Site,Date(dd:mm:yyyy),Time(hh:mm:ss),AOD_500nm,440-870_Angstrom_Exponent",
    "Chiang_Mai_Met_Sta,26:09:2026,12:00:00,0.073166,1.42",
    "Chiang_Mai_Met_Sta,27:09:2026,12:00:00,-999.,1.3",
  ].join("\n");

  it("reads daily AOD and skips missing (-999) values", () => {
    expect(parseAeronetDaily(csv)).toEqual([{ date: "2026-09-26", aod500: 0.073, angstrom440_870: 1.42 }]);
  });

  it("returns nothing for an unexpected document", () => {
    expect(parseAeronetDaily("<html>error</html>")).toEqual([]);
  });
});

describe("parseAir4Thai", () => {
  const NOW = Date.parse("2026-09-28T15:00:00Z"); // 22:00 Bangkok
  const station = (over: object) => ({
    stationID: "35t",
    nameEN: "City Hall, Chiangmai",
    areaTH: "ต.ช้างเผือก อ.เมือง, เชียงใหม่",
    lat: "18.840732",
    long: "98.96978",
    AQILast: { date: "2026-09-28", time: "21:00", PM25: { value: "8.8" }, PM10: { value: "-1" } },
    ...over,
  });

  it("keeps fresh Chiang Mai PCD monitors and drops missing (-1) readings", () => {
    const [s] = parseAir4Thai({ stations: [station({})] }, NOW);
    expect(s).toMatchObject({ stationId: "pcd-35t", source: "pcd", pm25: 8.8, pm10: undefined, observedAt: "2026-09-28T14:00:00.000Z" });
  });

  it("drops other provinces and stale readings", () => {
    expect(parseAir4Thai({ stations: [station({ areaTH: "เขตปทุมวัน, กรุงเทพฯ" })] }, NOW)).toEqual([]);
    expect(parseAir4Thai({ stations: [station({ AQILast: { date: "2026-09-27", time: "21:00", PM25: { value: "8" } } })] }, NOW)).toEqual([]);
  });
});
