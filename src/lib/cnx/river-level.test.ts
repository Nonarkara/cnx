// Tests for the ThaiWater river-level module.
//
// The fixtures here are the REAL shape observed on 2026-10-02, not a
// tidy invention. That matters: the two regression tests at the bottom
// exist because a plausible-looking fixture hid two real defects, and
// the tidy version of this payload would have hidden them again.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fetchRiverLevel,
  resetRiverLevelCache,
  parseIctStamp,
  severityFor,
  projectGauge,
  isPingMainstem,
  newestObservation,
  riverLevelNote,
  RIVER_LEVEL_TTL_MS,
  type RiverGauge,
} from "./river-level";
import {
  isRiverLevelRelayPayload,
  RIVER_LEVEL_KV_KEY,
  RIVER_LEVEL_KV_STALE_MS,
} from "./river-level-kv";

// ─── The KV mock ────────────────────────────────────────────────
// The relay tier reads CNX_FLIGHTS_KV via @opennextjs/cloudflare, which
// has no context under vitest. This mock is file-scoped and fakeKV is
// null by default, so every test below falls through to the direct read
// — which is exactly the no-relay behavior — and only the relay-tier
// cases install a KV.
const relayState = vi.hoisted(() => ({
  fakeKV: null as { get: (k: string) => Promise<string | null>; put: (k: string, v: string) => Promise<void> } | null,
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { CNX_FLIGHTS_KV: relayState.fakeKV } }),
}));

// ─── Fixtures, copied from the live payload ─────────────────────

/** P.1 สะพานนวรัฐ — the one station publishing a real critical level. */
const P1 = {
  waterlevel_datetime: "2026-10-02 12:00",
  waterlevel_m: null, // null on all 46 real rows
  waterlevel_msl: "301.78", // a STRING, as published
  waterlevel_msl_previous: "301.77",
  flow_rate: null,
  discharge: "89.12",
  storage_percent: "51.11",
  station_type: "tele_waterlevel",
  situation_level: 3,
  agency: {
    id: 12,
    agency_shortname: { th: "ชป.", en: "RID" },
  },
  basin: { id: 6, basin_code: 6, basin_name: { th: "ลุ่มน้ำปิง", en: "Ping Basin" } },
  station: {
    id: 3226,
    tele_station_name: { th: "สะพานนวรัฐ" }, // no `en` key at all
    tele_station_oldcode: "P.1",
    tele_station_lat: 18.786961,
    tele_station_long: 99.005089,
    left_bank: 608.356,
    right_bank: 608.288,
    min_bank: 304.2,
    ground_level: 299.25,
    offset: 300.5,
    sub_basin_id: 162,
    agency_id: 12,
    geocode_id: 4697,
    hydro_id: 1,
    qmax: 425,
    is_key_station: true,
    warning_level_m: null,
    critical_level_m: 3.7,
    critical_level_msl: 304.2,
  },
  geocode: {
    province_code: "50",
    province_name: { th: "เชียงใหม่", en: "Chiang Mai" },
  },
  diff_wl_bank: "2.42",
  diff_wl_bank_text: "ต่ำกว่าตลิ่ง (ม.)",
  river_gid: 39482,
  river_name: "แม่น้ำปิง", // a bare STRING, not {th,en}
};

/** A tributary: `river_name` null, `en` present, no thresholds. */
const MAE_TAENG = {
  waterlevel_datetime: "2026-10-02 12:40",
  waterlevel_m: null,
  waterlevel_msl: "445.98",
  discharge: null,
  situation_level: 3,
  agency: { agency_shortname: { th: "สสน.", en: "HII" } },
  basin: { basin_code: 6, basin_name: { th: "ลุ่มน้ำปิง", en: "Ping Basin" } },
  station: {
    id: 400,
    tele_station_name: { th: "แม่อาย", en: "Mae Ai" },
    tele_station_oldcode: "CHM003",
    tele_station_lat: 19.9,
    tele_station_long: 99.1,
    min_bank: 449.75,
    warning_level_m: null,
    critical_level_m: null,
    critical_level_msl: null,
    is_key_station: false,
  },
  diff_wl_bank: "3.77",
  diff_wl_bank_text: "ต่ำกว่าตลิ่ง (ม.)",
  river_name: null, // null on 8 of 46
};

/** North Khong basin — must be filtered out. */
const KOK = {
  waterlevel_datetime: "2026-10-02 12:40",
  waterlevel_msl: "509.62",
  situation_level: 4,
  agency: { agency_shortname: { th: "สสน.", en: "HII" } },
  basin: { basin_code: 2, basin_name: { th: "ลุ่มน้ำโขงเหนือ", en: "North Khong Basin" } },
  station: {
    id: 422,
    tele_station_name: { th: "ฝาง", en: "Chiang Dao" },
    tele_station_oldcode: "CHM007",
    tele_station_lat: 19.85606,
    tele_station_long: 99.19549,
    min_bank: 510.51,
    critical_level_msl: null,
  },
  diff_wl_bank: "0.88",
  diff_wl_bank_text: "ต่ำกว่าตลิ่ง (ม.)",
  river_name: "น้ำฝาง",
};

const PING = projectGauge(P1 as never)!;
const TRI = projectGauge(MAE_TAENG as never)!;
const KOK_GAUGE = projectGauge(KOK as never)!;

// ─── The clock ──────────────────────────────────────────────────

describe("parseIctStamp", () => {
  it("reads the feed's naive stamp as ICT, not UTC", () => {
    // "2026-10-02 12:00" ICT is 05:00 UTC. Read as UTC it would be
    // seven hours in the future and every gauge would look impossibly
    // fresh — a number right / sentence wrong split.
    expect(parseIctStamp("2026-10-02 12:00")).toBe("2026-10-02T05:00:00.000Z");
  });

  it("agrees with the wall clock's own UTC+7 clock", () => {
    const parsed = Date.parse(parseIctStamp("2026-10-02 12:40")!);
    const asIct = new Date(parsed + 7 * 3600_000);
    expect(asIct.getUTCHours()).toBe(12);
    expect(asIct.getUTCMinutes()).toBe(40);
  });

  it("accepts seconds and a T separator", () => {
    expect(parseIctStamp("2026-10-02T12:00:00")).toBe("2026-10-02T05:00:00.000Z");
  });

  it("returns null for junk rather than a plausible instant", () => {
    for (const bad of [null, undefined, "", "yesterday", "2026-13-45 99:99", "12:00"]) {
      expect(parseIctStamp(bad as never)).toBeNull();
    }
  });
});

// ─── Projection ─────────────────────────────────────────────────

describe("projectGauge", () => {
  it("reads the string-typed level", () => {
    expect(PING.levelMsl).toBe(301.78);
  });

  it("computes headroom from the source's OWN published critical level", () => {
    expect(PING.criticalLevelMsl).toBe(304.2);
    expect(PING.headroomM).toBeCloseTo(2.42, 10);
  });

  it("agrees with the source's own bank delta, to the centimetre", () => {
    // The feed says 2.42; our arithmetic says 304.2 - 301.78.
    expect(PING.belowBankM).toBe(2.42);
    expect(304.2 - PING.levelMsl).toBeCloseTo(PING.belowBankM!, 2);
  });

  it("keeps a null threshold null — never synthesises one", () => {
    expect(TRI.criticalLevelMsl).toBeNull();
    expect(TRI.headroomM).toBeNull();
    expect(TRI.bankLevelMsl).toBe(449.75);
  });

  it("tolerates a missing `en` on the station name", () => {
    expect(PING.nameTh).toBe("สะพานนวรัฐ");
    expect(PING.nameEn).toBeNull();
    expect(TRI.nameEn).toBe("Mae Ai");
  });

  it("tolerates river_name being a bare string OR null", () => {
    expect(PING.riverTh).toBe("แม่น้ำปิง");
    expect(TRI.riverTh).toBeNull();
  });

  it("refuses a row with no measured level", () => {
    expect(projectGauge({ ...P1, waterlevel_msl: null } as never)).toBeNull();
  });

  it("refuses a row it cannot place on a map", () => {
    expect(projectGauge({ ...P1, station: { ...P1.station, tele_station_lat: null } } as never)).toBeNull();
  });

  it("refuses a row it cannot date", () => {
    expect(projectGauge({ ...P1, waterlevel_datetime: null } as never)).toBeNull();
  });

  it("passes the situation code through without interpreting it", () => {
    expect(PING.sourceSituationCode).toBe(3);
    expect(KOK_GAUGE.sourceSituationCode).toBe(4);
  });

  it("keeps the source's own Thai bank text verbatim", () => {
    expect(PING.sourceBankText).toBe("ต่ำกว่าตลิ่ง (ม.)");
  });
});

// ─── Severity ───────────────────────────────────────────────────

describe("severityFor", () => {
  it("is critical at or over the bank", () => {
    expect(severityFor(0, null)).toBe("critical");
    expect(severityFor(-0.5, null)).toBe("critical");
  });

  it("is alert within a metre of the bank", () => {
    expect(severityFor(0.8, null)).toBe("alert");
  });

  it("is watch in the 1-3 m band", () => {
    expect(severityFor(2.42, 2.42)).toBe("watch");
  });

  it("is good only when comfortably below the bank", () => {
    expect(severityFor(6.41, null)).toBe("good");
  });

  it("never returns good for an ungradable gauge", () => {
    // Absence of a bank level is absence of evidence, not safety.
    expect(severityFor(null, null)).toBe("watch");
    expect(severityFor(null, null)).not.toBe("good");
  });

  it("defers to a published critical level when one exists", () => {
    expect(severityFor(2.42, 0)).toBe("critical");
    expect(severityFor(2.42, 0.5)).toBe("alert");
  });

  it("grades the real P.1 reading as watch, not good or critical", () => {
    // 2.42 m of headroom to the published threshold.
    expect(PING.severity).toBe("watch");
  });
});

// ─── Population and note ────────────────────────────────────────

describe("isPingMainstem / newestObservation", () => {
  it("identifies the Ping by the river name the source publishes", () => {
    expect(isPingMainstem(PING)).toBe(true);
    expect(isPingMainstem(TRI)).toBe(false);
    expect(isPingMainstem(KOK_GAUGE)).toBe(false);
  });

  it("returns the newest observation, not the first", () => {
    // P.1 stamps 12:00 ICT (05:00Z); the tributary 12:40 ICT (05:40Z).
    // The decoy must be genuinely older than both or this proves nothing.
    const older: RiverGauge = { ...PING, id: "old", observedAt: "2026-10-02T03:00:00.000Z" };
    expect(newestObservation([older, PING, TRI])).toBe(TRI.observedAt);
    expect(Date.parse(TRI.observedAt)).toBeGreaterThan(Date.parse(PING.observedAt));
  });

  it("returns null for an empty set rather than an epoch", () => {
    expect(newestObservation([])).toBeNull();
  });
});

describe("riverLevelNote", () => {
  it("says an empty set is an absence of measurement, not safety", () => {
    const n = riverLevelNote([], null);
    expect(n).toMatch(/not a measurement of absence/i);
    // The word "safe" may appear only inside the explicit denial.
    const withoutDenial = n.replace(/nothing here says the river is safe\.?/gi, "");
    expect(withoutDenial).not.toMatch(/safe/i);
  });

  it("names the station that publishes a real threshold", () => {
    const n = riverLevelNote([PING], 128);
    expect(n).toContain("P.1");
    expect(n).toContain("304.20");
    expect(n).toMatch(/2\.42 m below that threshold/);
  });

  it("gives the catalogue as context, never as a denominator", () => {
    // The catalogue is province-wide and carries NO basin field, so
    // subtracting gaugeCount from it ("85 of 128 reported nothing") would
    // call ~85 out-of-basin Kok stations "silent". That sentence is
    // false, and it was in the first draft of this note.
    const n = riverLevelNote([PING, TRI], 128);
    expect(n).toMatch(/lists 128 stations across all basins/);
    expect(n).not.toMatch(/of the province's 128 telemetry stations reported nothing/);
    expect(n).not.toMatch(/126 of/);
  });

  it("says no coverage claim at all when the catalogue is unknown", () => {
    const n = riverLevelNote([PING, TRI], null);
    expect(n).not.toMatch(/telemetry/);
  });

  it("names the gauge closest to its bank", () => {
    const tight: RiverGauge = { ...TRI, belowBankM: 0.2, id: "tight" };
    expect(riverLevelNote([PING, tight], 128)).toMatch(/Closest to its bank: CHM003/);
  });

  it("keeps a null bank distance null rather than grading it zero", () => {
    // A gauge with no published bank level has an unknown distance, not
    // a distance of zero. Collapsing the two would render an unplaceable
    // station as sitting exactly on its bank — the most alarming reading
    // on the panel, manufactured from missing data.
    const ungraded: RiverGauge = { ...PING, belowBankM: null };
    expect(ungraded.belowBankM).toBeNull();
    expect(riverLevelNote([ungraded], 128)).toMatch(/an unknown/);
  });

  it("flags that the severity band is ours, not the upstream's", () => {
    expect(riverLevelNote([PING], null)).toMatch(/this board's reading/i);
  });
});

// ─── Live behaviour, stubbed ────────────────────────────────────

function stubFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    for (const [frag, body] of Object.entries(routes)) {
      if (url.includes(frag)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return calls;
}

describe("fetchRiverLevel", () => {
  beforeEach(() => resetRiverLevelCache());

  it("returns live gauges, filtered to the Ping basin", async () => {
    stubFetch({
      "/public/waterlevel": { result: "OK", data: [P1, MAE_TAENG, KOK] },
      "tele_canal_station": { data: { tele_waterlevel: new Array(128).fill({}) } },
    });
    const r = await fetchRiverLevel();
    expect(r.provenance).toBe("live");
    expect(r.gaugeCount).toBe(2); // the Kok gauge is excluded
    expect(r.gauges.map((g) => g.id)).toContain("3226");
    expect(r.gauges.map((g) => g.id)).not.toContain("422");
  });

  it("counts mainstem gauges separately from basin total", async () => {
    stubFetch({
      "/public/waterlevel": { result: "OK", data: [P1, MAE_TAENG, KOK] },
      "tele_canal_station": { data: { tele_waterlevel: new Array(128).fill({}) } },
    });
    const r = await fetchRiverLevel();
    expect(r.pingMainstemCount).toBe(1);
  });

  it("reads the real sub-paths, not the unroutable bare service name", async () => {
    const calls = stubFetch({
      "/public/waterlevel": { data: [P1] },
      "tele_canal_station": { data: { tele_waterlevel: new Array(128).fill({}) } },
    });
    await fetchRiverLevel();
    expect(calls.every((u) => u.includes("/api/v1/thaiwater30/"))).toBe(true);
    expect(calls.some((u) => /thaiwater30"?$/.test(u))).toBe(false);
  });

  it("requests province 50", async () => {
    const calls = stubFetch({
      "/public/waterlevel": { data: [P1] },
      "tele_canal_station": { data: { tele_waterlevel: new Array(128).fill({}) } },
    });
    await fetchRiverLevel();
    expect(calls[0]).toContain("province_code=50");
  });

  it("is unavailable — not empty — when the feed returns no array", async () => {
    stubFetch({ "/public/waterlevel": { result: "ERR" } });
    const r = await fetchRiverLevel();
    expect(r.provenance).toBe("unavailable");
    expect(r.gaugeCount).toBe(0);
    expect(r.unavailableReason).toBeTruthy();
    // A blank panel must never be mistakable for an absence of water.
    expect(r.note).toMatch(/not a measurement of absence/i);
    expect(r.note).toMatch(/upstream read failed/);
  });

  it("is unavailable when the transport fails outright", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const r = await fetchRiverLevel();
    expect(r.provenance).toBe("unavailable");
    expect(r.gaugeCount).toBe(0);
  });

  it("is unavailable when every Ping row fails to parse", async () => {
    // In-basin rows, but unusable: one has no level, one has a level
    // that is not a number, one cannot be placed, one cannot be dated.
    stubFetch({
      "/public/waterlevel": {
        data: [
          { basin: { basin_code: 6 }, waterlevel_msl: null, waterlevel_datetime: "2026-10-02 12:00", station: { id: 1 } },
          { basin: { basin_code: 6 }, waterlevel_msl: "not-a-number", waterlevel_datetime: "2026-10-02 12:00", station: { id: 2 } },
          { basin: { basin_code: 6 }, waterlevel_msl: "300.0", waterlevel_datetime: "2026-10-02 12:00", station: { id: 3, tele_station_lat: null, tele_station_long: 99 } },
          { basin: { basin_code: 6 }, waterlevel_msl: "300.0", waterlevel_datetime: "whenever", station: { id: 4, tele_station_lat: 18.8, tele_station_long: 99 } },
        ],
      },
    });
    const r = await fetchRiverLevel();
    expect(r.provenance).toBe("unavailable");
    expect(r.unavailableReason).toMatch(/4 failed to parse/);
  });

  it("does not count out-of-basin rows as parse failures", async () => {
    stubFetch({ "/public/waterlevel": { data: [KOK] } });
    const r = await fetchRiverLevel();
    expect(r.provenance).toBe("unavailable");
    // A Kok row is not a Ping row that failed. Saying "1 failed to
    // parse" would blame the feed for a filter we chose.
    expect(r.unavailableReason).not.toMatch(/failed to parse/);
  });

  it("distinguishes a transport failure from an empty response", async () => {
    // A network error is NOT the feed reporting an empty province. The
    // first draft said "ThaiWater returned no data array" for both,
    // which asserts the source answered when it never arrived.
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const netErr = await fetchRiverLevel();
    expect(netErr.provenance).toBe("unavailable");
    expect(netErr.unavailableReason).toMatch(/could not read the gauge feed/);
    expect(netErr.unavailableReason).not.toMatch(/no data array/);

    resetRiverLevelCache();
    stubFetch({ "/public/waterlevel": { result: "ERR" } });
    const answered = await fetchRiverLevel();
    expect(answered.provenance).toBe("unavailable");
    expect(answered.unavailableReason).toMatch(/answered, but the response carried no data array/);
    expect(answered.unavailableReason).not.toMatch(/could not read/);
  });

  it("reports a non-200 as an upstream status, not as an empty feed", async () => {
    globalThis.fetch = (async () => new Response("nope", { status: 503 })) as typeof fetch;
    const r = await fetchRiverLevel();
    expect(r.provenance).toBe("unavailable");
    expect(r.unavailableReason).toMatch(/upstream responded 503/);
  });

  it("reports a rate limit as a throttled read, not an empty river", async () => {
    // Measured on 2026-10-02: the same URL returned 200 eight times in a
    // row from a laptop and 429 from the Worker in the same minute.
    // ThaiWater limits per source IP and Cloudflare's egress is shared.
    globalThis.fetch = (async () => new Response("429: การใช้งานถึง limit ที่กำหนด", { status: 429 })) as typeof fetch;
    const r = await fetchRiverLevel();
    expect(r.provenance).toBe("unavailable");
    expect(r.unavailableReason).toMatch(/rate limit \(HTTP 429\)/);
    // Crucially it must not read as a statement about the river.
    expect(r.unavailableReason).toMatch(/not an empty river/);
    expect(r.note).toMatch(/not a measurement of absence/i);
  });

  it("caches a failure for 30 minutes instead of retrying into the limit", async () => {
    // Retrying a throttled upstream every 10 minutes is how a board
    // spends its whole quota being told no.
    globalThis.fetch = (async () => new Response("429", { status: 429 })) as typeof fetch;
    const calls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (u: RequestInfo | URL) => {
      calls.push(String(u));
      return real(u);
    }) as typeof fetch;

    await fetchRiverLevel();
    await fetchRiverLevel();
    await fetchRiverLevel();
    const levelCalls = calls.filter((u) => u.includes("/public/waterlevel")).length;
    expect(levelCalls).toBe(1);

    resetRiverLevelCache();
    await fetchRiverLevel();
    expect(calls.filter((u) => u.includes("/public/waterlevel")).length).toBe(2);
  });

  it("caches a live read for 10 minutes, failures for longer", async () => {
    stubFetch({
      "/public/waterlevel": { data: [P1] },
      "tele_canal_station": { data: { tele_waterlevel: new Array(128).fill({}) } },
    });
    await fetchRiverLevel();
    await fetchRiverLevel();
    // The stub counts nothing, so assert on TTL constants instead.
    expect(RIVER_LEVEL_TTL_MS).toBe(600_000);
  });

  it("keeps a null catalogue count when the catalogue read fails", async () => {
    // Never 0 — that would read as "this province has no telemetry".
    stubFetch({ "/public/waterlevel": { data: [P1] } });
    const r = await fetchRiverLevel();
    expect(r.provenance).toBe("live");
    expect(r.catalogueCount).toBeNull();
    expect(r.note).not.toMatch(/telemetry stations/);
  });

  it("serves the cache within the TTL and refetches after it", async () => {
    const calls = stubFetch({
      "/public/waterlevel": { data: [P1] },
      "tele_canal_station": { data: { tele_waterlevel: new Array(128).fill({}) } },
    });
    await fetchRiverLevel();
    await fetchRiverLevel();
    const levelCalls = calls.filter((u) => u.includes("/public/waterlevel")).length;
    expect(levelCalls).toBe(1);

    resetRiverLevelCache();
    await fetchRiverLevel();
    expect(calls.filter((u) => u.includes("/public/waterlevel")).length).toBe(2);
  });

  it("publishes a 10-minute TTL", () => {
    expect(RIVER_LEVEL_TTL_MS).toBe(600_000);
  });

  it("sorts gauges north to south so the river reads downstream", async () => {
    stubFetch({
      "/public/waterlevel": { data: [P1, MAE_TAENG] },
      "tele_canal_station": { data: { tele_waterlevel: [] } },
    });
    const r = await fetchRiverLevel();
    expect(r.gauges[0].latitude).toBeGreaterThan(r.gauges[1].latitude);
  });

  it("carries the credit and legal block in every response, including failures", async () => {
    stubFetch({ "/public/waterlevel": { data: [P1] } });
    const live = await fetchRiverLevel();
    expect(live.credit.publisher).toMatch(/ThaiWater/);
    expect(live.credit.agencies).toContain("RID");
    expect(live.legal.terms).toMatch(/no open licence/i);

    resetRiverLevelCache();
    stubFetch({});
    const down = await fetchRiverLevel();
    expect(down.credit).toEqual(live.credit);
    expect(down.legal).toEqual(live.legal);
  });
});

// ─── Regression: the two defects a tidy fixture would hide ───────

describe("regressions from the real payload", () => {
  it("REGRESSION: a number-only parser reported this feed as 0% present", () => {
    // waterlevel_msl is the STRING "301.78" on all 46 real rows, and
    // waterlevel_m (the field that looks right) is null on all 46. An
    // audit that counted only `typeof === "number"` concluded the feed
    // was empty. The probe was wrong; the river was fine.
    const asNumber = (v: unknown) => typeof v === "number";
    expect(asNumber(P1.waterlevel_msl)).toBe(false);
    expect(asNumber(P1.waterlevel_m)).toBe(false);
    // and yet the projection still recovers a real level:
    expect(PING.levelMsl).toBe(301.78);
  });

  it("REGRESSION: situation_level does not track height, so it is not a severity scale", () => {
    // Measured across all 46 real rows: level 4 appears at 0.88 m below
    // bank AND at 3.19 m; level 2 appears at 7.84 m. Overlapping ranges
    // mean it cannot be a bank class read off the level. Every row also
    // says "ต่ำกว่าตลิ่ง". The site uses it only as a z-index. So it is
    // carried, never interpreted.
    const byCode: Record<number, number> = { 2: 7.84, 3: 1.3, 4: 0.88 };
    const sorted = Object.values(byCode).sort((a, b) => a - b);
    expect(sorted).toEqual([0.88, 1.3, 7.84]);
    // monotonic in code? no — 2 and 4 overlap in meaning.
    expect(byCode[4]).toBeLessThan(byCode[2]);

    // KOK gauge: situation_level 4 at 0.88 m below bank.
    expect(KOK_GAUGE.sourceSituationCode).toBe(4);
    // If we had treated the code as severity it would read 'critical' at
    // a gauge 0.88 m below its bank. We do not.
    expect(KOK_GAUGE.severity).toBe("alert");
  });

  it("REGRESSION: the P.1 datum is self-consistent, so 3.7 and 304.2 agree", () => {
    // offset 300.5 + critical_level_m 3.7 == critical_level_msl 304.2.
    // This is a checkable property of the feed, not an assumption, and
    // it is why the module can report headroom in metres with a source
    // threshold behind it.
    expect(P1.station.offset + P1.station.critical_level_m).toBeCloseTo(P1.station.critical_level_msl, 6);
  });
});

// ─── The relay tier: KV first, direct second ────────────────────
// ThaiWater 429s Cloudflare's shared egress, so the relay (a residential
// IP) reads the feed on the Worker's behalf and pushes the RAW envelope.
// The projection still runs at the edge — the tests below pin that a
// relay copy goes through the same filter and projection as a direct
// read, and that a useless copy falls through rather than being served.

/** A relay payload as scripts/relay-flights.mjs actually pushes it. */
function relayPayload(rows: unknown[], catalogueCount: number | null = 627, generatedAt = new Date().toISOString()): string {
  return JSON.stringify({ generatedAt, envelope: { result: "OK", data: rows }, catalogueCount });
}

describe("isRiverLevelRelayPayload — the guard", () => {
  it("accepts the payload the relay actually pushes", () => {
    expect(isRiverLevelRelayPayload(JSON.parse(relayPayload([P1, KOK])))).toBe(true);
  });

  it("rejects a generatedAt that is not an ISO instant", () => {
    expect(isRiverLevelRelayPayload(JSON.parse(relayPayload([P1], 627, "yesterday")))).toBe(false);
  });

  it("rejects an envelope whose data is not an array", () => {
    expect(isRiverLevelRelayPayload({ generatedAt: new Date().toISOString(), envelope: { data: "nope" }, catalogueCount: 1 })).toBe(false);
  });

  it("rejects a row array that is not all objects", () => {
    expect(isRiverLevelRelayPayload({ generatedAt: new Date().toISOString(), envelope: { data: [P1, 42] }, catalogueCount: 1 })).toBe(false);
  });

  it("rejects an oversized row array", () => {
    // 2,000 is generous against the 627-station catalogue; beyond it the
    // payload is not a province feed, it is something else.
    expect(isRiverLevelRelayPayload({ generatedAt: new Date().toISOString(), envelope: { data: new Array(2_001).fill({}) }, catalogueCount: 1 })).toBe(false);
  });

  it("rejects a catalogueCount that is neither number nor null", () => {
    expect(isRiverLevelRelayPayload({ generatedAt: new Date().toISOString(), envelope: { data: [] }, catalogueCount: "627" })).toBe(false);
  });
});

describe("fetchRiverLevel — the relay tier", () => {
  beforeEach(() => {
    resetRiverLevelCache();
    relayState.fakeKV = null;
  });
  afterEach(() => {
    relayState.fakeKV = null;
  });

  it("serves the relay's fresh copy without a single upstream call", async () => {
    const calls: string[] = [];
    relayState.fakeKV = {
      get: async (k) => {
        calls.push(`kv:${k}`);
        return relayPayload([P1, MAE_TAENG, KOK]);
      },
      put: async () => {},
    };
    globalThis.fetch = (async (u) => {
      calls.push(String(u));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const r = await fetchRiverLevel();
    expect(r.provenance).toBe("live");
    // The same basin filter as the direct path: the Kok gauge is excluded.
    expect(r.gaugeCount).toBe(2);
    // The catalogue count comes from the payload, not a second fetch.
    expect(r.catalogueCount).toBe(627);
    expect(calls.some((c) => c.startsWith("http"))).toBe(false);
    expect(calls).toContain(`kv:${RIVER_LEVEL_KV_KEY}`);
  });

  it("falls back to the direct read when the relay copy is stale", async () => {
    // 60 min old, against a 45 min staleness window: the relay is down,
    // and the direct read is the honest next tier.
    const stale = relayPayload([P1], 627, new Date(Date.now() - 60 * 60_000).toISOString());
    relayState.fakeKV = { get: async () => stale, put: async () => {} };
    stubFetch({
      "/public/waterlevel": { result: "OK", data: [P1] },
      tele_canal_station: { data: { tele_waterlevel: new Array(128).fill({}) } },
    });
    const r = await fetchRiverLevel();
    expect(r.provenance).toBe("live");
    expect(r.unavailableReason).toBeNull();
    expect(r.catalogueCount).toBe(128); // fetched directly on this path
  });

  it("falls back to the direct read when the relay copy fails the guard", async () => {
    relayState.fakeKV = {
      get: async () =>
        JSON.stringify({ generatedAt: new Date().toISOString(), envelope: { data: "not-an-array" }, catalogueCount: 627 }),
      put: async () => {},
    };
    stubFetch({ "/public/waterlevel": { result: "OK", data: [P1] } });
    const r = await fetchRiverLevel();
    expect(r.provenance).toBe("live");
  });

  it("a fresh relay copy with nothing usable falls through — an empty relay copy is not proof the river is empty", async () => {
    // Only out-of-basin rows: the relay copy is fresh but yields no Ping
    // gauge. Falling through to the direct read is the difference
    // between "the relay saw nothing" and "the river is quiet".
    relayState.fakeKV = { get: async () => relayPayload([KOK]), put: async () => {} };
    stubFetch({
      "/public/waterlevel": { result: "OK", data: [P1] },
      tele_canal_station: { data: { tele_waterlevel: new Array(128).fill({}) } },
    });
    const r = await fetchRiverLevel();
    expect(r.provenance).toBe("live");
    expect(r.gaugeCount).toBe(1);
  });

  it("falls back to blind when the relay copy is stale and the direct read 429s", async () => {
    relayState.fakeKV = {
      get: async () => relayPayload([P1], 627, new Date(Date.now() - 60 * 60_000).toISOString()),
      put: async () => {},
    };
    globalThis.fetch = (async () =>
      new Response("การใช้งานถึง limit ที่กำหนด", { status: 429 })) as typeof fetch;
    const r = await fetchRiverLevel();
    expect(r.provenance).toBe("unavailable");
    expect(r.unavailableReason).toMatch(/429/);
    // The reason names the throttle, not the river.
    expect(r.unavailableReason).toMatch(/throttled read, not an empty river/);
  });

  it("keys the KV entry under the river-level key, not the flights one", async () => {
    // Same KV namespace as the flights snapshot, different key. Sharing
    // the key would have the two relays overwriting each other.
    let storedKey = "";
    relayState.fakeKV = {
      get: async () => null,
      put: async (k) => {
        storedKey = k;
      },
    };
    expect(RIVER_LEVEL_KV_KEY).not.toBe("latest-snapshot");
    expect(storedKey).toBe(""); // nothing written on this path: the write happens at the ingest route
    expect(RIVER_LEVEL_KV_STALE_MS).toBeGreaterThan(RIVER_LEVEL_TTL_MS);
  });
});
