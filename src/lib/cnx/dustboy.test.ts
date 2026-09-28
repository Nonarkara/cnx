import { describe, expect, it } from "vitest";
import { normaliseStation, summariseBasin } from "./dustboy";

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

  it("keeps the Chiang Mai average separate from the rest of the upper north", () => {
    const cm = normaliseStation(raw, NOW);
    const lampang = normaliseStation(
      {
        ...raw,
        dustboy_uri: "lampang",
        province_code: "52",
        pm25: 180,
        dustboy_name: "ทดสอบ อ.เมือง จ.ลำปาง",
      },
      NOW,
    );
    expect(cm && lampang).toBeTruthy();
    const basin = summariseBasin([cm!, lampang!]);
    expect(basin.chiangMai.avgPm25).toBe(42);
    expect(basin.chiangMai.onlineCount).toBe(1);
    expect(basin.chiangMai.newestReadingAgeHours).toBe(2);
    expect(basin.avgPm25).toBeGreaterThan(42);
    expect(basin.onlineCount).toBe(2);
  });
});
