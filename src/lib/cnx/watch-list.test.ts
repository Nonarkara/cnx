// Watch-list regressions. The board is the surface a governor reads
// first, so the rules that matter most are pinned here:
//   1. Every warning system appears every cycle — a dead feed is a row
//      that says so, never a silently missing system.
//   2. A gap cannot warn: unknown rows never enter the watch list, and
//      an empty watch list never claims an all-clear sentence level.
//   3. Scenario/illustrative evidence never becomes a watch item (that
//      rule lives in the metric builders; this pins the composition).
//   4. Caveats travel with the numbers: FloodHub's riverine-only note,
//      the smoke methodology, the haze-vision untested-window caveat.

import { describe, expect, it } from "vitest";
import { buildWatchList, type WatchListInput } from "./watch-list";
import type { ExecutiveMetric } from "./executive-brief";

const metric = (id: ExecutiveMetric["id"], level: ExecutiveMetric["level"], state: ExecutiveMetric["state"] = "current"): ExecutiveMetric => ({
  id,
  titleTh: id,
  titleEn: id,
  value: "1",
  unit: "",
  summaryTh: `${id} summary`,
  summaryEn: `${id} summary`,
  source: `${id} source`,
  observedAt: state === "current" ? new Date().toISOString() : null,
  state,
  level,
  actionTh: `${id} action`,
  actionEn: `${id} action`,
});

const baseInput = (metrics: ExecutiveMetric[] = []): WatchListInput => ({
  metrics,
  firesRfd: null,
  aerosol: null,
  aeronet: null,
  jaxa: null,
  floodhub: null,
  gistda: null,
  smoke: null,
  hazeVision: null,
  dustboy: null,
  weatherLayers: null,
  riverGauges: [],
  rain: null,
  now: new Date("2026-10-09T10:00:00+07:00"),
});

describe("buildWatchList inventory", () => {
  it("lists every system even when all feeds are dark", () => {
    const board = buildWatchList(baseInput([
      metric("water", "unknown", "unavailable"),
      metric("air", "unknown", "unavailable"),
      metric("fire", "unknown", "unavailable"),
      metric("mobility", "unknown", "unavailable"),
    ]));
    const ids = board.systems.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([
      "water", "air", "fire", "mobility",
      "river-gauges", "rain-gauges", "fires-rfd", "air-gistda", "dustboy",
      "aerosol-cams", "aeronet", "jaxa-aot", "smoke", "floodhub", "haze-vision",
      "weather-himawari", "weather-aod", "weather-radar", "burnscar",
    ]));
    expect(ids).toHaveLength(19);
    expect(board.watch).toHaveLength(0);
    expect(board.gapCount).toBeGreaterThan(0);
  });

  it("renders every dark feed as unknown, never as safe", () => {
    const board = buildWatchList(baseInput([
      metric("water", "unknown", "unavailable"),
      metric("air", "unknown", "unavailable"),
      metric("fire", "unknown", "unavailable"),
      metric("mobility", "unknown", "unavailable"),
    ]));
    for (const system of board.systems) {
      if (system.id === "burnscar") continue;
      expect(system.level, system.id).toBe("unknown");
    }
  });

  it("keeps unavailable satellite feeds out of the watch list", () => {
    const board = buildWatchList(baseInput());
    expect(board.watch).toHaveLength(0);
    expect(board.attentionCount).toBe(0);
  });
});

describe("buildWatchList ranking and honesty", () => {
  it("ranks alert above watch", () => {
    const board = buildWatchList(baseInput([
      metric("air", "alert"),
      metric("fire", "watch"),
    ]));
    expect(board.attentionCount).toBe(2);
    expect(board.watch[0].id).toBe("air");
    expect(board.watch[1].id).toBe("fire");
  });

  it("never promotes an unknown metric into a watch item", () => {
    const board = buildWatchList(baseInput([metric("water", "unknown", "unavailable")]));
    expect(board.watch).toHaveLength(0);
    const water = board.systems.find((s) => s.id === "water");
    expect(water?.level).toBe("unknown");
    expect(water?.actionTh).toBeNull();
  });

  it("drops the action when the metric is stale", () => {
    const board = buildWatchList(baseInput([metric("air", "alert", "stale")]));
    const air = board.systems.find((s) => s.id === "air");
    expect(air?.actionTh).toBeNull();
  });

  it("carries FloodHub's riverine-only note and maps SEVERE to alert", () => {
    const board = buildWatchList({
      ...baseInput(),
      floodhub: {
        generatedAt: "2026-10-09T02:00:00Z",
        provenance: "live",
        points: [
          {
            gaugeId: "hybas", latitude: 18.8, longitude: 98.9, kmFromCity: 12,
            qualityVerified: false, severity: "SEVERE", trend: "RISE",
            issuedTime: "2026-10-09T01:00:00Z", forecastStart: null, forecastEnd: null,
          },
        ],
        outlook: "flooding",
        worst: "SEVERE",
        note: "Riverine only; does not cover urban or flash flooding.",
      } as never,
    });
    const floodhub = board.systems.find((s) => s.id === "floodhub");
    expect(floodhub?.level).toBe("alert");
    expect(floodhub?.evidenceTh).toContain("urban or flash flooding");
    expect(board.watch.some((w) => w.id === "floodhub")).toBe(true);
  });

  it("maps FloodHub no-forecast to good, with the never-all-clear note", () => {
    const board = buildWatchList({
      ...baseInput(),
      floodhub: {
        generatedAt: "2026-10-09T02:00:00Z",
        provenance: "live",
        points: [],
        outlook: "none-forecast",
        worst: null,
        note: "no forecast = no riverine alert, not proof of safety",
      } as never,
    });
    const floodhub = board.systems.find((s) => s.id === "floodhub");
    expect(floodhub?.level).toBe("good");
    expect(board.watch.some((w) => w.id === "floodhub")).toBe(false);
  });

  it("carries the smoke methodology when smoke reaches CNX", () => {
    const board = buildWatchList({
      ...baseInput(),
      smoke: {
        generatedAt: "2026-10-09T03:00:00Z",
        wind: { speedKmh: 14, fromDirectionDeg: 270 },
        segments: [],
        summary: { total: 9, shown: 0, hitsCnx: 2, nearCnx: 3, origin_th: "จากเมียนมา", origin_en: "from Myanmar" },
        methodology_th: "การแพร่กระจายแบบเส้นตรง ไม่ใช่การพยากรณ์",
        methodology_en: "Straight-line advection — not a forecast",
        provenance: "live",
      } as never,
    });
    const smoke = board.systems.find((s) => s.id === "smoke");
    expect(smoke?.level).toBe("alert");
    expect(smoke?.evidenceTh).toContain("ไม่ใช่การพยากรณ์");
    expect(smoke?.observedAt).toBe("2026-10-09T03:00:00Z");
  });

  it("keeps smoke dark when hotspots are not live", () => {
    const board = buildWatchList({
      ...baseInput(),
      smoke: {
        generatedAt: "2026-10-09T03:00:00Z",
        wind: null,
        segments: [],
        summary: { total: 0, shown: 0, hitsCnx: 0, nearCnx: 0, origin_th: "-", origin_en: "-" },
        methodology_th: "-",
        methodology_en: "-",
        provenance: "unavailable",
      } as never,
    });
    expect(board.systems.find((s) => s.id === "smoke")?.level).toBe("unknown");
  });

  it("flags haze-likely cameras and states the untested correlation window", () => {
    const board = buildWatchList({
      ...baseInput(),
      hazeVision: {
        generatedAt: "2026-10-09T03:30:00Z",
        cameras: [
          { cameraId: "a", label: "A", latitude: 18.8, longitude: 98.9, snapshotUrl: "https://example.test/a.jpg", observedAt: "2026-10-09T03:20:00Z", verdict: "haze-likely", score: 4, metrics: null, baselineSamples: 10, nearestPm25: null },
          { cameraId: "b", label: "B", latitude: 18.9, longitude: 99.0, snapshotUrl: "https://example.test/b.jpg", observedAt: "2026-10-09T03:20:00Z", verdict: "clear", score: 0, metrics: null, baselineSamples: 10, nearestPm25: null },
        ],
        agreement: { r: 0.1, pairs: 40, pm25Min: 3, pm25Max: 20, pm25Median: 7, pm25P95: 18, eventReadings: 0, spansHazeEvent: false },
        provenance: "live",
        methodology: "-",
        note: null,
      } as never,
    });
    const vision = board.systems.find((s) => s.id === "haze-vision");
    expect(vision?.level).toBe("alert");
    expect(vision?.evidenceTh).toContain("ยังไม่เคยผ่านเหตุการณ์หมอก");
    expect(vision?.observedAt).toBe("2026-10-09T03:20:00Z");
  });

  it("surfaces the JAXA walk-back as availability, not a risk grade", () => {
    const board = buildWatchList({
      ...baseInput(),
      jaxa: {
        generatedAt: "2026-10-09T03:00:00Z",
        provenance: "live",
        item: { cogUrl: "https://example.test/a.tiff", observedFrom: "2026-10-07T04:00:00Z", observedTo: null, nodata: 65535, scale: 0.0001, offset: 0, platform: "GCOM-C", instrument: "SGLI", license: "CC-BY-4.0" },
        reason: null,
        resolvedFor: "2026-10-07",
        walkedBackDays: 2,
      } as never,
    });
    const jaxa = board.systems.find((s) => s.id === "jaxa-aot");
    expect(jaxa?.level).toBe("good");
    expect(jaxa?.valueTh).toContain("2026-10-07");
    expect(jaxa?.evidenceTh).toContain("ไม่ใช่ระดับความเสี่ยง");
    expect(board.watch.some((w) => w.id === "jaxa-aot")).toBe(false);
  });

  it("reports an absent GCOM-C scene with the catalogue's own reason", () => {
    const board = buildWatchList({
      ...baseInput(),
      jaxa: {
        generatedAt: "2026-10-09T03:00:00Z",
        provenance: "unavailable",
        item: null,
        reason: "no GCOM-C pass published in the last 11 days",
        resolvedFor: null,
        walkedBackDays: 10,
      } as never,
    });
    const jaxa = board.systems.find((s) => s.id === "jaxa-aot");
    expect(jaxa?.level).toBe("unknown");
    expect(jaxa?.evidenceTh).toContain("no GCOM-C pass published");
  });

  it("grades GISTDA districts by the worst amphoe and counts districts at or above 50", () => {
    const board = buildWatchList({
      ...baseInput(),
      gistda: {
        generatedAt: "2026-10-09T03:00:00Z",
        location: { lat: 18.8, lon: 98.9 },
        locName: { th: "เชียงใหม่", en: "Chiang Mai", ap_th: "เมือง", ap_en: "Mueang" },
        provenance: "live",
        provenanceNote: null,
        observedAt: "2026-10-09T03:00:00Z",
        pm25: 62,
        pm25Avg24hrs: 55,
        pm25Aqi: 155,
        severity: "critical",
        history24h: [],
        amphoe: [
          { ap_tn: "แม่ริม", ap_en: "Mae Rim", ap_idn: 5006, pm25: 62, pm25Avg24hr: 55, dt: "2026-10-09T03:00:00Z", severity: "critical" },
          { ap_tn: "ฝาง", ap_en: "Fang", ap_idn: 5021, pm25: 51, pm25Avg24hr: 48, dt: "2026-10-09T02:40:00Z", severity: "critical" },
          { ap_tn: "เมืองเชียงใหม่", ap_en: "Mueang Chiang Mai", ap_idn: 5001, pm25: 30, pm25Avg24hr: 28, dt: "2026-10-09T02:30:00Z", severity: "watch" },
        ],
        provinceAveragePm25: 47,
        worstAmphoe: { ap_tn: "แม่ริม", ap_en: "Mae Rim", ap_idn: 5006, pm25: 62, pm25Avg24hr: 55, dt: "2026-10-09T03:00:00Z", severity: "critical" },
      } as never,
    });
    const gistda = board.systems.find((s) => s.id === "air-gistda");
    expect(gistda?.level).toBe("critical");
    expect(gistda?.valueTh).toContain("แม่ริม 62");
    expect(gistda?.valueTh).toContain("2 อำเภอ ≥50");
    expect(gistda?.observedAt).toBe("2026-10-09T03:00:00Z");
    expect(board.watch.some((w) => w.id === "air-gistda")).toBe(true);
  });

  it("shows the GISTDA honest miss when the district feed is down", () => {
    const board = buildWatchList({
      ...baseInput(),
      gistda: {
        generatedAt: "2026-10-09T03:00:00Z",
        location: { lat: 18.8, lon: 98.9 },
        locName: { th: "เชียงใหม่", en: "Chiang Mai", ap_th: "เมือง", ap_en: "Mueang" },
        provenance: "unavailable",
        provenanceNote: "GISTDA district air readings are unavailable. Missing readings are not an all-clear.",
        observedAt: null,
        pm25: null,
        pm25Avg24hrs: null,
        pm25Aqi: null,
        severity: "unknown",
        history24h: [],
        amphoe: [],
        provinceAveragePm25: null,
        worstAmphoe: null,
      } as never,
    });
    const gistda = board.systems.find((s) => s.id === "air-gistda");
    expect(gistda?.level).toBe("unknown");
    expect(gistda?.evidenceTh).toContain("not an all-clear");
  });

  it("treats AERONET as a reference with display bands, and flags smoke-like particles", () => {
    const board = buildWatchList({
      ...baseInput(),
      aeronet: {
        generatedAt: "2026-10-09T03:00:00Z",
        site: "Chiang_Mai_Met_Sta",
        level: "1.5",
        latest: { date: "2026-10-08", aod500: 1.4, angstrom440_870: 1.6 },
        days: [],
        note: "-",
      } as never,
    });
    const aeronet = board.systems.find((s) => s.id === "aeronet");
    expect(aeronet?.level).toBe("critical");
    expect(aeronet?.valueTh).toContain("ลักษณะควัน");
    expect(aeronet?.evidenceTh).toContain("ไม่ใช่เกณฑ์สุขภาพ");
    expect(aeronet?.openMetric).toBeNull();
  });

  it("marks imagery layers available only when the tile URL exists", () => {
    const board = buildWatchList({
      ...baseInput(),
      weatherLayers: {
        rainRadar: "https://tiles.test/radar/{z}/{x}/{y}.png",
        himawari: null,
        aerosol: "https://tiles.test/aod/{z}/{y}/{x}.png",
        attribution: { rainRadar: "RainViewer", himawari: "JMA", aerosol: "NASA GIBS" },
      } as never,
    });
    expect(board.systems.find((s) => s.id === "weather-radar")?.level).toBe("good");
    expect(board.systems.find((s) => s.id === "weather-himawari")?.level).toBe("unknown");
    expect(board.systems.find((s) => s.id === "weather-aod")?.level).toBe("good");
    expect(board.gapCount).toBeGreaterThan(0);
  });

  it("keeps very heavy measured rain at alert in the rain row", () => {
    const now = new Date("2026-10-09T10:00:00+07:00");
    const board = buildWatchList({
      ...baseInput(),
      now,
      rain: {
        provenance: "live",
        generatedAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
        stations: [
          // `at` is ThaiWater's Asia/Bangkok wall-clock string — the field
          // summariseRain actually reads to decide freshness.
          { id: "s1", rain24h: 95, at: "2026-10-09 09:54", amphoeTh: "แม่แตง", amphoeEn: "Mae Taeng" },
        ],
      } as never,
    });
    const rain = board.systems.find((s) => s.id === "rain-gauges");
    expect(rain?.level).toBe("alert");
    expect(rain?.valueTh).toContain("แม่แตง");
  });
});
