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
  it("parses the public feed row, reading the timestamp as UTC", () => {
    const s = normaliseStation(raw, NOW);
    expect(s).toMatchObject({ stationId: "nightbazaar", province: "เชียงใหม่", district: "เมือง", pm25: 42, severity: "watch" });
    // 13:00 UTC = 20:00 Bangkok. The feed stamps in UTC — see parseLogDatetime.
    expect(s?.observedAt).toBe("2026-09-28T13:00:00.000Z");
    expect(s?.readingAgeHours).toBe(0);
  });

  it("treats the feed's UTC stamp as UTC, not Bangkok local (regression)", () => {
    // Live feed 2026-09-29 12:43 UTC carried log_datetime "2026-09-29 12:00:00".
    // Parsed as +07:00 that reading looks 8 h old and blanks every station
    // past STALE_HOURS; parsed as UTC it is 43 min old. See parseLogDatetime.
    const at = Date.parse("2026-09-29T12:43:00Z");
    const s = normaliseStation({ ...raw, log_datetime: "2026-09-29 12:00:00" }, at);
    expect(s?.pm25).toBe(42);
    expect(s?.readingAgeHours).toBe(1);
    expect(s?.observedAt).toBe("2026-09-29T12:00:00.000Z");
  });

  it("keeps a whole hourly feed fresh instead of blanking the basin", () => {
    // 197 stations, all stamped on the hour, is the real shape of the feed.
    const at = Date.parse("2026-09-29T12:43:00Z");
    const rows = Array.from({ length: 197 }, (_, i) =>
      normaliseStation({ ...raw, dustboy_uri: `s${i}`, log_datetime: "2026-09-29 12:00:00" }, at),
    );
    const online = rows.filter((s) => s?.pm25 !== null);
    expect(online).toHaveLength(197);
    expect(summariseBasin(online.filter((s) => s !== null)).onlineCount).toBe(197);
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
        log_datetime: "2026-09-28 14:00:00",
      },
      NOW,
    );
    expect(cm && lampang).toBeTruthy();
    const basin = summariseBasin([cm!, lampang!]);
    expect(basin.chiangMai.avgPm25).toBe(42);
    expect(basin.chiangMai.onlineCount).toBe(1);
    expect(basin.chiangMai.newestReadingAgeHours).toBe(0);
    expect(basin.avgPm25).toBeGreaterThan(42);
    expect(basin.onlineCount).toBe(2);
  });
});
