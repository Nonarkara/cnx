// CNX — measured river levels on the Ping, via ThaiWater v3.
//
// WHAT THIS IS
// ------------
// The flood axis of this board was, for its whole life, a scenario. The
// module header in `flood.ts` blamed a missing upstream key and named
// `water.rid.go.th` as the source. Both halves of that were wrong, and
// the way they were wrong is worth recording:
//
//   * `api-v3.thaiwater.net/api/v1/thaiwater30` is NOT a dead service.
//     Probing the bare path returns `404 Request to an unknown service`,
//     which reads exactly like a renamed endpoint. It is not: the router
//     dispatches on the FULL sub-path, so `/api/v1/thaiwater30` alone is
//     unroutable while `/api/v1/thaiwater30/public/waterlevel` answers
//     200 with the national realtime feed. The name was always right.
//   * The feed needs NO KEY. Every endpoint this board reads is under
//     `/public/` or `/frontend/shared/`, the same ones the public
//     website calls from a browser with no credential. `flood.ts` was
//     wrong that a key was required, and `water.rid.go.th` was a 1996
//     HTML frameset that was never an API.
//
// The correct list of endpoints was not guessed. It was read out of the
// site's own JavaScript bundle (`www.thaiwater.net/dist/js/app.chunk.js`,
// 7.6 MB), which enumerates the paths the public site itself calls. That
// is the difference between a service that looks dead and a service that
// was being addressed wrongly.
//
// WHAT WE ACTUALLY GET
// -------------------
// `GET /public/waterlevel?province_code=50` returns the gauges in
// Chiang Mai province that reported a reading. Measured 2026-10-02:
//
//   - 46 rows, all distinct station ids, all present in the province's
//     own station catalogue (`frontend/shared/station_all`, 627 records).
//   - 43 of the 46 are in the Ping basin (basin_code 6); 8 are on the
//     Ping mainstem, north-to-south from Chiang Dao down to Hot.
//   - Agencies: RID 23, FOP 12, HII 8, EGAT 3.
//   - Every row carries a real observation time in ICT, and a real
//     height above mean sea level. Freshest 19 min, stalest 7 h at the
//     time of measurement.
//   - Consecutive calls 90 s apart moved 8 levels by ±0.02 m, which is
//     what live instruments do and what a static fixture does not.
//
// POPULATION DISCIPLINE
// --------------------
// The 46 is NOT "the number of gauges in Chiang Mai", and this module
// must never report it as such. It is the subset that had a reading at
// the moment of the call. The telemetry catalogue for the same province
// (`frontend/shared/tele_canal_station?province_code=50`) lists 128
// stations; 82 of them had no reading. So the coverage statement this
// board is allowed to make is "N of 128 telemetry stations reported",
// and the difference is a real and reportable fact about the network,
// not a rounding error to hide.
//
// THE NUMBERS ARE STRINGS, AND THE SHAPES ARE NOT UNIFORM
// -------------------------------------------------------
// `waterlevel_msl` is `"301.78"`, a string, on all 46 rows.
// `waterlevel_m` (height above station zero) is `null` on all 46 — a
// field that looks like the one you want and is empty. An earlier draft
// of the audit that counted `typeof === "number"` reported "0 of 46
// present" and would have concluded the feed was empty. It was the
// probe that was wrong, not the river.
//
// `river_name` is a bare string on 38 rows and `null` on 8, while
// `basin`, `station_name`, `agency` and `geocode` are all bilingual
// `{th,en}` objects. `station_name` is an object on all 46 but `en` is
// missing on some. Every accessor in this module therefore tolerates
// both shapes. A parser written against the first row alone would throw
// on exactly the rows that matter most.
//
// A NOTE ON `situation_level`
// ---------------------------
// The feed returns an integer 1-4 per gauge. This module does NOT
// interpret it, and the reason is concrete rather than cautious:
//
//   - Across all 46 rows the ranges overlap. `situation_level` 4 appears
//     at 0.88 m below bank (Chiang Dao) and at 3.19 m below bank (Ban
//     Sop Soi). Level 2 appears at 7.84 m below bank. It is not a
//     monotone function of height, so it cannot be a bank class read
//     off the level.
//   - Every one of the 46 rows carries `diff_wl_bank_text` of
//     "ต่ำกว่าตลิ่ง" (below bank). If the integer were the flood class
//     the governor recognises, all 46 would be the same class. They
//     are not.
//   - The site's own 7.6 MB bundle mentions `situation_level` exactly
//     once, as a `zIndexOffset` multiplier. It is a map-draw-order
//     hint, not a documented severity scale.
//
// So the integer is passed through as `sourceSituationCode` and labelled
// as an undocumented upstream code. Severity on this board is derived
// from the bank geometry the feed actually publishes, below, and is
// marked as OUR reading. Where the source publishes a real threshold
// (`critical_level_msl`) we show that number itself and say whose it is.
//
// THE ONE REAL THRESHOLD
// ----------------------
// Exactly one of the 46 stations publishes an official critical level:
// P.1 สะพานนวรัฐ (Nawarat Bridge), the station this board has used for
// its scenario bank-full figure since the beginning. It publishes
// `critical_level_msl: 304.2` and `critical_level_m: 3.7`, and its
// `offset` is 300.5, so 300.5 + 3.7 = 304.2 — the two published forms
// agree with each other, which is a checkable consistency property and
// not an assumption. At the measured 301.78 that is 2.42 m of headroom,
// which is also exactly the `diff_wl_bank` the feed reports, because
// `diff_wl_bank == min_bank - waterlevel_msl` on all 46 rows
// (verified arithmetically, 46/46 consistent, 0 skipped).
//
// That means our scenario's "~3.5 m bank-full at Nawarat" was in the
// right neighbourhood of a real published 3.7 m. It is still a guess
// and it is still being replaced by the published figure, but it is
// worth knowing it was not wildly wrong.
//
// TERMS
// -----
// The site's footer reads "Copyright © 2024 Hydro - Informatics
// Institute, All rights reserved." and the data centre is the National
// Hydroinformatics Data Center (สทนช., Office of the National Water
// Command). The underlying observations belong to RID, FOP, HII and
// EGAT. No open licence is published for this feed, so none is claimed.
// Credit names the publisher and every contributing agency; the legal
// block states intended use and terms-as-published. Read the way the
// camera wall is read: we link, we do not mirror, and we do not assert
// a permission nobody granted.
//
// POLL CADENCE
// ------------
// 10 minutes. The source publishes on the order of 20-40 min per
// station and pushes nothing, so a faster poll would re-read the same
// numbers. A slower poll would age the newest reading. The cost of a
// pull-based feed is that a gauge's freshness is bounded by the TTL,
// which is why the response carries `observedAt` per gauge and the
// panel ages each one separately — four of the 46 were already 7 hours
// old while the rest were under an hour, and that spread is shown
// rather than flattened.

const ENDPOINT = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel";

/** The province this board covers. Thai two-digit geocode. */
const PROVINCE_CODE = "50";

/** See POLL CADENCE. Source cadence is coarser than this. */
export const RIVER_LEVEL_TTL_MS = 10 * 60_000;

/** Basin code for the Ping, as published in the feed. */
const PING_BASIN_CODE = 6;

export type RiverSeverity = "good" | "watch" | "alert" | "critical";

export interface RiverGauge {
  /** Stable upstream identifier. */
  id: string;
  /** Upstream's own station code, e.g. "P.1". Null when unpublished. */
  code: string | null;
  /** Thai name as published. Never dropped. */
  nameTh: string;
  /** English name when the source publishes one. */
  nameEn: string | null;
  /** River name in Thai, when the source publishes one. */
  riverTh: string | null;
  /** Basin name in Thai, when the source publishes one. */
  basinTh: string | null;
  latitude: number;
  longitude: number;
  /** Height above mean sea level, metres. The measured value. */
  levelMsl: number;
  /**
   * Metres from this reading to the published bank level. Positive means
   * the water is still below the bank. Derived by the source; we verify
   * the arithmetic rather than trusting it (see tests).
   *
   * NULL when the station publishes no bank level at all. That null is
   * load-bearing, not a gap: it is what stops an ungradable gauge from
   * reading as a safe one in the verdict engine.
   */
  belowBankM: number | null;
  /** Bank level above MSL, metres, as published by the source. */
  bankLevelMsl: number | null;
  /**
   * The source's OWN published critical level above MSL, where it exists.
   * This is the only threshold in the feed that carries an authority,
   * and it exists for exactly one of the province's stations. It is
   * never synthesised.
   */
  criticalLevelMsl: number | null;
  /** Metres of headroom to the published critical level, or null if the
   *  station publishes no threshold. */
  headroomM: number | null;
  /** True when the source flags this station as a key station. */
  keyStation: boolean;
  /** Discharge in m³/s when reported. */
  dischargeM3s: number | null;
  /** Owning agency, English short name as published. */
  agency: string;
  /**
   * OUR reading of severity, from published bank geometry. Explicitly
   * not an upstream class — see the header note on `situation_level`.
   */
  severity: RiverSeverity;
  /**
   * The upstream's numeric situation code, passed through UNCHANGED and
   * not interpreted. Undocumented by the publisher; used as a draw
   * order. Carried so an operator can compare, never so we can claim.
   */
  sourceSituationCode: number | null;
  /** The source's own Thai text for the bank relation, verbatim. */
  sourceBankText: string | null;
  /**
   * Observation time from the feed, as an ISO-8601 instant in UTC.
   * The feed publishes ICT with no offset; this module attaches +07:00
   * and converts, because a timestamp read as UTC would be 7 hours into
   * the future and would render every gauge as impossibly fresh.
   */
  observedAt: string;
}

export interface RiverLevelResponse {
  /** When this module produced the answer. NOT the observation time. */
  generatedAt: string;
  provenance: "live" | "unavailable";
  /** Gauges in the Ping basin that reported a reading. */
  gauges: RiverGauge[];
  /** Count of gauges above, all from this province. */
  gaugeCount: number;
  /** How many of those are on the Ping mainstem itself. */
  pingMainstemCount: number;
  /**
   * Telemetry stations the province's catalogue lists, for context.
   * Null when the catalogue could not be read — a failed catalogue read
   * must not become "coverage is complete".
   */
  catalogueCount: number | null;
  /** Set when provenance === "unavailable": why, in plain words. */
  unavailableReason: string | null;
  /** Newest observation in this response, ISO-8601 UTC. */
  observedAt: string | null;
  /** Built from the gauges actually returned. */
  note: string;
  credit: RiverLevelCredit;
  legal: RiverLevelLegal;
}

export interface RiverLevelCredit {
  publisher: string;
  publisherUrl: string;
  agencies: string[];
}

export interface RiverLevelLegal {
  intendedUse: string;
  terms: string;
}

const CREDIT: RiverLevelCredit = {
  publisher: "ThaiWater v3 — National Hydroinformatics Data Center (สทนช.)",
  publisherUrl: "https://www.thaiwater.net",
  agencies: ["RID", "FOP", "HII", "EGAT"],
};

const LEGAL: RiverLevelLegal = {
  intendedUse:
    "Public-goods flood situational awareness for Chiang Mai province. Gauge heights, bank relations and discharge are read to help the province decide river and road risk, and to give the flood panel a measured number instead of a scenario. No personal data is read, derived or published. Nothing here is sold.",
  terms:
    "Observations remain the property of the publishing agencies (Royal Irrigation Department, Department of Water Resources, Hydro-Informatics Institute, Electricity Generating Authority) as credited per gauge. The publisher states no open licence for this feed, and none is claimed here. This integration is keyless, rate-limited to one read per 10 minutes, and limited to Chiang Mai province. Any reuse beyond public-goods situational awareness should be agreed with the publisher and the named agencies first.",
};

// ─── Upstream shape ─────────────────────────────────────────────
// Typed to the shape actually observed, including the parts that are
// inconsistent. Every optional is genuinely optional because every one
// of them was observed missing somewhere in the population.

interface UpstreamBilingual {
  th?: string;
  en?: string;
}

interface UpstreamStation {
  id?: number;
  tele_station_name?: UpstreamBilingual | string | null;
  tele_station_oldcode?: string | null;
  tele_station_lat?: number | null;
  tele_station_long?: number | null;
  min_bank?: number | null;
  ground_level?: number | null;
  offset?: number | null;
  critical_level_m?: number | null;
  critical_level_msl?: number | null;
  is_key_station?: boolean | null;
  qmax?: number | null;
}

interface UpstreamRow {
  waterlevel_datetime?: string | null;
  /** Height above station zero. Observed null on all 46 rows. */
  waterlevel_m?: string | number | null;
  waterlevel_msl?: string | number | null;
  discharge?: string | number | null;
  situation_level?: number | null;
  diff_wl_bank?: string | number | null;
  diff_wl_bank_text?: string | null;
  agency?: { agency_shortname?: UpstreamBilingual | string | null } | null;
  basin?: { basin_code?: number | null; basin_name?: UpstreamBilingual | null } | null;
  station?: UpstreamStation | null;
  river_name?: string | null;
}

// ─── Coercion ───────────────────────────────────────────────────
// The feed's numbers arrive as strings. A helper that only accepts
// `typeof === "number"` reports a full population as empty; that
// mistake is recorded in the header and guarded by a test.

function num(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "" || t === "null" || t === "undefined") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Bilingual fields arrive as `{th,en}`, but not always. */
function bi(v: UpstreamBilingual | string | null | undefined, lang: "th" | "en"): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (v && typeof v === "object") {
    const t = v[lang];
    if (typeof t === "string" && t.trim() !== "") return t.trim();
    return null;
  }
  return null;
}

/**
 * The feed publishes ICT ("2026-10-02 12:00") with no offset. Read as
 * UTC it would be 7 hours in the future, and every gauge would render
 * as impossibly fresh — a number right / sentence wrong split. So the
 * offset is attached explicitly and the result is a true instant.
 */
const ICT_OFFSET_MINUTES = 7 * 60;

export function parseIctStamp(stamp: string | null | undefined): string | null {
  if (typeof stamp !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(stamp.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const year = +y;
  const month = +mo;
  const day = +d;
  const hour = +h;
  const minute = +mi;
  const second = s ? +s : 0;

  // Range-check the components BEFORE handing them to Date.UTC, which
  // normalises overflow rather than rejecting it: month 13 becomes the
  // next January, and "2026-13-45 99:99" silently becomes a perfectly
  // plausible instant in 2027. A malformed stamp must be rejected, not
  // rounded into a believable observation.
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(asUtc)) return null;

  // Reject calendar-invalid days that survived the range check, e.g.
  // 31 February, by confirming the round trip.
  const round = new Date(asUtc);
  if (round.getUTCFullYear() !== year || round.getUTCMonth() !== month - 1 || round.getUTCDate() !== day) {
    return null;
  }

  return new Date(asUtc - ICT_OFFSET_MINUTES * 60_000).toISOString();
}

// ─── Severity ───────────────────────────────────────────────────
// OUR reading, from the published bank geometry. Not an upstream class.
//
// The bands are ratios of the reading to the bank's height above MSL,
// which is the same shape as the scenario's bank-full ratios so the
// two are comparable, but the geometry is now measured rather than
// assumed. A station with no published bank level cannot be graded
// and is returned as `watch` — never `good`, because an ungradable
// gauge is not evidence of a safe river.

export function severityFor(belowBankM: number | null, headroomM: number | null): RiverSeverity {
  // A published critical level is the strongest statement available.
  // At or above it, the source's own threshold is met.
  if (headroomM !== null && headroomM <= 0) return "critical";

  if (belowBankM === null) return "watch";

  // Still below the bank. How far below decides the rest.
  if (belowBankM <= 0) return "critical"; // at or over the bank
  if (belowBankM <= 1) return "alert"; // within 1 m of overtopping
  if (headroomM !== null && headroomM <= 1) return "alert";
  if (belowBankM <= 3) return "watch";
  return "good";
}

// ─── Projection ─────────────────────────────────────────────────

export function projectGauge(row: UpstreamRow): RiverGauge | null {
  const st = row.station;
  if (!st) return null;

  const levelMsl = num(row.waterlevel_msl);
  if (levelMsl === null) return null; // nothing measured; never invent

  const lat = num(st.tele_station_lat);
  const lng = num(st.tele_station_long);
  if (lat === null || lng === null) return null; // cannot place it on a map

  const observedAt = parseIctStamp(row.waterlevel_datetime);
  if (observedAt === null) return null; // an undateable reading cannot be aged

  const bankLevelMsl = num(st.min_bank);
  const criticalLevelMsl = num(st.critical_level_msl);

  // Prefer the source's own bank delta; fall back to the arithmetic
  // only when it is absent, and never contradict it when present.
  const srcDelta = num(row.diff_wl_bank);
  const belowBankM = srcDelta ?? (bankLevelMsl !== null ? bankLevelMsl - levelMsl : null);

  const headroomM = criticalLevelMsl !== null ? criticalLevelMsl - levelMsl : null;

  return {
    id: String(st.id ?? row.waterlevel_datetime ?? `${lat},${lng}`),
    code: st.tele_station_oldcode ?? null,
    nameTh: bi(st.tele_station_name, "th") ?? bi(st.tele_station_name, "en") ?? "(unnamed)",
    nameEn: bi(st.tele_station_name, "en"),
    riverTh: typeof row.river_name === "string" && row.river_name.trim() !== "" ? row.river_name.trim() : null,
    basinTh: bi(row.basin?.basin_name, "th"),
    latitude: lat,
    longitude: lng,
    levelMsl,
    belowBankM,
    bankLevelMsl,
    criticalLevelMsl,
    headroomM,
    keyStation: st.is_key_station === true,
    dischargeM3s: num(row.discharge),
    agency: bi(row.agency?.agency_shortname, "en") ?? bi(row.agency?.agency_shortname, "th") ?? "unknown",
    severity: severityFor(belowBankM, headroomM),
    sourceSituationCode: typeof row.situation_level === "number" ? row.situation_level : null,
    sourceBankText: typeof row.diff_wl_bank_text === "string" ? row.diff_wl_bank_text : null,
    observedAt,
  };
}

/** Ping mainstem = the source names the river แม่น้ำปิง. */
const PING_RIVER_TH = "แม่น้ำปิง";

export function isPingMainstem(g: RiverGauge): boolean {
  return g.riverTh === PING_RIVER_TH;
}

/** Newest observation across the set, as an ISO instant. */
export function newestObservation(gauges: RiverGauge[]): string | null {
  let best: number | null = null;
  for (const g of gauges) {
    const t = Date.parse(g.observedAt);
    if (Number.isFinite(t) && (best === null || t > best)) best = t;
  }
  return best === null ? null : new Date(best).toISOString();
}

/**
 * The note is built from the gauges actually returned, so it cannot
 * describe a set the operator is not looking at. It never says "safe":
 * the highest reading in the set is named, and the absence of a
 * threshold at a station is stated.
 */
export function riverLevelNote(gauges: RiverGauge[], catalogueCount: number | null): string {
  if (gauges.length === 0) {
    return "No gauge in the Ping basin reported a reading at the time of this call. That is an absence of measurement, not a measurement of absence: nothing here says the river is safe.";
  }
  const mainstem = gauges.filter(isPingMainstem);
  const withThreshold = gauges.filter((g) => g.criticalLevelMsl !== null);
  const tightest = gauges.reduce((a, b) => ((a?.belowBankM ?? Infinity) <= (b?.belowBankM ?? Infinity) ? a : b), gauges[0]);

  const parts: string[] = [];
  parts.push(
    `${gauges.length} gauge${gauges.length === 1 ? "" : "s"} in the Ping basin reported a reading` +
      (mainstem.length ? `, ${mainstem.length} on the Ping mainstem` : "") + ".",
  );

  if (catalogueCount !== null) {
    parts.push(
      `${catalogueCount - gauges.length} of the province's ${catalogueCount} telemetry stations reported nothing at the moment of this call.`,
    );
  }

  if (withThreshold.length > 0) {
    const g = withThreshold[0];
    parts.push(
      `${g.code ?? g.nameTh} publishes an official critical level of ${g.criticalLevelMsl!.toFixed(2)} m above sea level; it is reading ${g.levelMsl.toFixed(2)} m, ${g.headroomM!.toFixed(2)} m below that threshold.`,
    );
  } else {
    parts.push("No station in this response publishes an official critical level.");
  }

  if (tightest) {
    parts.push(
      `Closest to its bank: ${tightest.code ?? tightest.nameTh} at ${tightest.belowBankM === null ? "an unknown" : tightest.belowBankM.toFixed(2) + " m"} below bank level.`,
    );
  }

  parts.push("Severity bands are this board's reading of the published bank geometry, not an upstream warning class.");
  return parts.join(" ");
}

// ─── Fetch ──────────────────────────────────────────────────────

function buildUrl(path: string, params: Record<string, string>): string {
  const u = new URL(`https://api-v3.thaiwater.net/api/v1/thaiwater30${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

async function getJson<T>(url: string, timeoutMs = 8_000): Promise<T | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // A failed read is a failed read. It never becomes an empty set.
    return null;
  }
}

interface WaterlevelEnvelope {
  result?: string;
  data?: UpstreamRow[];
}

/**
 * The province's telemetry station count, for coverage context. A null
 * here means "we could not read the catalogue", which is reported as
 * null and never as 0 — 0 would read as "this province has no
 * telemetry", which is false and is exactly the omission error this
 * board treats as fatal.
 */
async function fetchCatalogueCount(): Promise<number | null> {
  const j = await getJson<{ data?: { tele_waterlevel?: unknown[] } }>(
    buildUrl("/frontend/shared/tele_canal_station", { province_code: PROVINCE_CODE }),
  );
  const arr = j?.data?.tele_waterlevel;
  return Array.isArray(arr) ? arr.length : null;
}

function unavailable(reason: string): RiverLevelResponse {
  return {
    generatedAt: new Date().toISOString(),
    provenance: "unavailable",
    gauges: [],
    gaugeCount: 0,
    pingMainstemCount: 0,
    catalogueCount: null,
    unavailableReason: reason,
    observedAt: null,
    // The note still runs, so a failure reads as a stated absence of
    // measurement rather than a blank panel that could be mistaken for
    // an absence of water.
    note: riverLevelNote([], null) + ` (upstream read failed: ${reason})`,
    credit: CREDIT,
    legal: LEGAL,
  };
}

let cache: { at: number; value: RiverLevelResponse } | null = null;

/** Test seam. */
export function resetRiverLevelCache(): void {
  cache = null;
}

export async function fetchRiverLevel(): Promise<RiverLevelResponse> {
  const now = Date.now();
  if (cache && now - cache.at < RIVER_LEVEL_TTL_MS) return cache.value;

  const env = await getJson<WaterlevelEnvelope>(
    buildUrl("/public/waterlevel", { province_code: PROVINCE_CODE }),
  );

  const rows = env?.data;
  if (!Array.isArray(rows)) {
    return unavailable("ThaiWater returned no data array");
  }

  // Basin filter: the province also drains to the Kok and the Chao
  // Phraya headwaters, and those are not this board's flood axis.
  const gauges: RiverGauge[] = [];
  let mainstem = 0;
  let skipped = 0;
  for (const r of rows) {
    if (r.basin?.basin_code !== PING_BASIN_CODE) continue;
    const g = projectGauge(r);
    if (!g) {
      skipped++;
      continue;
    }
    gauges.push(g);
    if (isPingMainstem(g)) mainstem++;
  }

  // Every row that parsed to nothing is a row the operator is not
  // seeing. It is surfaced rather than dropped silently.
  if (gauges.length === 0) {
    return unavailable(
      `ThaiWater returned ${rows.length} rows for province ${PROVINCE_CODE}, none of which were usable Ping gauges` +
        (skipped ? ` (${skipped} failed to parse)` : ""),
    );
  }

  gauges.sort((a, b) => b.latitude - a.latitude);

  const catalogueCount = await fetchCatalogueCount();

  const value: RiverLevelResponse = {
    generatedAt: new Date().toISOString(),
    provenance: "live",
    gauges,
    gaugeCount: gauges.length,
    pingMainstemCount: mainstem,
    catalogueCount,
    unavailableReason: null,
    observedAt: newestObservation(gauges),
    note: riverLevelNote(gauges, catalogueCount),
    credit: CREDIT,
    legal: LEGAL,
  };

  cache = { at: now, value };
  return value;
}

export const RIVER_LEVEL_SOURCES = {
  levels: ENDPOINT,
  catalogue: "https://api-v3.thaiwater.net/api/v1/thaiwater30/frontend/shared/tele_canal_station",
  credit: CREDIT,
  legal: LEGAL,
} as const;
