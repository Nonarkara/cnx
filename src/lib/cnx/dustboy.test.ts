import { describe, expect, it } from "vitest";
import { normaliseStation } from "./dustboy";

const NOW = Date.parse("2026-09-28T07:30:00Z"); // 14:30 Bangkok

const raw = {
  dustboy_uri: "nightbazaar",
  dustboy_name: "ไนท์บาร์ซาร์ ต.ช้างม่อย อ.เมือง จ. เชียงใหม่",
  dustboy_lat: "18.7854765",
  dustboy_lon: "98.9996602",
  pm25: 42,
  province_code: "50",
  log_datetime: "2026-09-28 13:00:00",
};

describe("DustBoy normaliseStation", () => {
  it("parses the public feed row, reading the timestamp as Bangkok time", () => {
    const s = normaliseStation(raw, NOW);
    expect(s).toMatchObject({ stationId: "nightbazaar", province: "เชียงใหม่", district: "เมือง", pm25: 42, severity: "watch" });
    expect(s?.observedAt).toBe("2026-09-28T06:00:00.000Z");
    expect(s?.readingAgeHours).toBe(2);
  });

  it("drops stations outside the upper-north basin", () => {
    expect(normaliseStation({ ...raw, province_code: "10" }, NOW)).toBeNull();
  });

  it("treats a stale reading as offline instead of reporting an old value", () => {
    const s = normaliseStation({ ...raw, log_datetime: "2026-09-27 13:00:00" }, NOW);
    expect(s?.pm25).toBeNull();
  });
});
