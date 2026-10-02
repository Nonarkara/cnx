// CNX keystone story ("the Chiang Mai narrative").
//
// Same shape as Lopburi's story module — a paragraph narrative plus
// 4–6 keystone bullets the dashboard anchors on. The story is built
// from the live flood + air-quality + fires + flights responses so
// it always reflects the current operational state, not a fixed copy.
//
// The chatbot (RAG) in v2 will chain the story paragraphs into the
// retrieval corpus; for v1 the story is the keystone surface, and
// the modal that holds it becomes the human-readable "what is going
// on in Chiang Mai right now" view.

import type { CnxStoryResponse, OfficeNotice } from "../../types/cnx";
import { fetchCnxFlood } from "./flood";
import { fetchCnxAirQuality } from "./air-quality";
import { fetchCnxFires } from "./fires";
import { isCurrentGaugeReading } from "./verdict";
import { fetchRiverLevel, isPingMainstem, type RiverGauge } from "./river-level";

// How the story is allowed to talk about the river.
//
// Every scenario below wants to say something about the Ping. When there
// is no live gauge feed it must not, and it must not be faked by zeroing
// the number either: "Ping river at 0% of bank-full" is a sentence that
// means *calm*, produced by a missing measurement. That is the same error
// as the fabricated value, wearing reassurance instead of alarm.
const FLOOD_UNKNOWN =
  "No live river-gauge reading this cycle — the river state is unverified, not calm. Read the station gauges in your area.";

const THEMES: Record<string, string> = {
  "burning-season-peak": "Air and haze watch",
  "monsoon-flood-watch": "Rain and river watch",
  "songkran-surge-week": "Travel and crowd planning",
  "stable-winter-day": "Chiang Mai operational evidence",
};

interface StoryInputs {
  pm25: number | null;
  airBasis?: string;
  fireCount: number;
  firesLive: boolean;
  forestShare: number | undefined;
  pingCap: number;
  bhmFraction: number;
  sktFraction: number;
  rain24: number;
  wideCount: number | null;
  officeNotices: OfficeNotice[];
  /** True only when the flood feed actually produced measurements. */
  floodLive: boolean;
  measuredGauge?: RiverGauge | null;
}

function scenarioDefaults(): StoryInputs {
  return {
    pm25: null,
    fireCount: 0,
    firesLive: false,
    forestShare: undefined,
    // Deliberately not the old 0.42 / 0.81 / 0.74. Those were plausible
    // numbers for a river we were not measuring, and a test fixture that
    // carries them will eventually be copied into production code.
    pingCap: 0,
    bhmFraction: 0,
    sktFraction: 0,
    rain24: 0,
    wideCount: null,
    officeNotices: [],
    floodLive: false,
  };
}

export async function buildCnxStory(
  scenarioId?: string | null,
): Promise<CnxStoryResponse> {
  const now = new Date().toISOString();
  const [flood, air, fires, river] = await Promise.all([
    fetchCnxFlood(),
    fetchCnxAirQuality(),
    fetchCnxFires(),
    fetchRiverLevel(),
  ]);

  // Missing readings must remain unknown. Every fallback here used to be a hardcoded plausible number — `?? 0.42`
  // for the river, `?? 38` for PM2.5, 81/74 for the dams. A fabricated default
  // is worse than a missing one, because `pickScenario` below *selects the
  // narrative* on these values: invent a river ratio and you have written the
  // story that gets published. Missing air readings now remain null.
  const floodLive = flood.provenance === "live";
  const bhm = flood.reservoirs.find((r) => r.damId === "BHM");
  const skt = flood.reservoirs.find((r) => r.damId === "SKT");
  const avgRain = flood.rainfall.reduce((a, r) => a + r.rainfall24hMm, 0) /
    Math.max(1, flood.rainfall.length);

  const inputs: StoryInputs = {
    pm25: air.provinceAvgPm25 ?? null,
    airBasis: air.stations.some((s) => s.source === "pcd") ? "fresh PCD ground-monitor average" : "CAMS city model grid estimate",
    fireCount: fires.provenance === "live" ? fires.totalCount : 0,
    firesLive: fires.provenance === "live",
    forestShare: fires.forestShare,
    pingCap: floodLive ? (flood.pingCapacityFraction ?? 0) : 0,
    bhmFraction: floodLive && bhm ? Math.round(bhm.fillFraction * 100) : 0,
    sktFraction: floodLive && skt ? Math.round(skt.fillFraction * 100) : 0,
    rain24: floodLive ? Math.round(avgRain * 10) / 10 : 0,
    wideCount: null, // No arrival-history feed is loaded by this story.
    // `flood.office` is generated inside buildScenario() and attributed to
    // "Royal Irrigation Department Region 1". Never quote a government
    // agency on the strength of a hash seed — it outranks everything else
    // on this wall.
    officeNotices: [air.office, floodLive ? flood.office : null].filter(Boolean) as OfficeNotice[],
    floodLive,
    measuredGauge: river.provenance === "live" ? river.gauges.filter((g) => isPingMainstem(g) && isCurrentGaugeReading(g.observedAt)).sort((a, b) => (a.belowBankM ?? Infinity) - (b.belowBankM ?? Infinity))[0] ?? null : null,
  };

  const key = (scenarioId && THEMES[scenarioId]) ? scenarioId : pickScenario(inputs);
  return buildStoryFromInputs(key, inputs, now);
}

/**
 * Pure half of the story: pick a scenario, render it. Split out so the
 * claim rules can be tested without three network feeds — the sentences
 * are the contract, and they are testable without the fetches.
 */
export function buildStoryFromInputs(
  scenarioId: string,
  inputs: StoryInputs,
  now: string = new Date().toISOString(),
): CnxStoryResponse {
  const air = inputs.pm25 === null
    ? "No current PM2.5 reading this cycle — air quality is unverified, not clean."
    : `PM2.5 ${inputs.pm25} µg/m³ (${inputs.airBasis ?? "supplied reading; source not specified"}). This is not an official health advisory.`;
  const gauge = inputs.measuredGauge && isCurrentGaugeReading(inputs.measuredGauge.observedAt) ? inputs.measuredGauge : null;
  const flood = gauge
    ? `Measured Ping gauge ${gauge.code ?? gauge.nameTh}: ${gauge.levelMsl.toFixed(2)} m above mean sea level${gauge.belowBankM === null ? "; bank relation unknown" : `; ${Math.abs(gauge.belowBankM).toFixed(2)} m ${gauge.belowBankM < 0 ? "above" : "below"} its published bank level`}. Observed ${gauge.observedAt}. One gauge does not establish street-level flood conditions.`
    : inputs.floodLive
    ? `Ping basin gauge summary: ${(inputs.pingCap * 100).toFixed(0)}% of bank-full. This does not establish street-level flood conditions or dam-release plans.`
    : FLOOD_UNKNOWN;
  const fires = inputs.firesLive
    ? `NASA FIRMS reports ${inputs.fireCount} hotspots in the CNX bounding box in the feed window. A thermal anomaly does not establish fire cause or forest tenure.`
    : "No live NASA FIRMS pass this cycle — the hotspot count is unknown, not zero.";
  return {
    generatedAt: now,
    headline: THEMES[scenarioId] ?? THEMES["stable-winter-day"],
    paragraphs: [air, flood, fires, "Arrival totals, crowd counts, school closures, road restrictions and official response deployments are not verified by this story."],
    bullets: [
      "Suggested action: verify local readings and their observation times before deciding.",
      "Suggested action: consult PCD and provincial announcements for health advisories.",
      "Suggested action: check local river gauges and DDPM notices for flood decisions.",
      "Suggested action: confirm closures and response deployments with the responsible authority.",
    ],
    officeNotices: inputs.officeNotices,
  };
}

function pickScenario(i: StoryInputs): keyof typeof THEMES {
  if (i.pm25 !== null && i.pm25 >= 50) return "burning-season-peak";
  if (i.floodLive && (i.pingCap >= 0.85 || i.rain24 >= 80)) return "monsoon-flood-watch";
  return "stable-winter-day";
}

// Keep `scenarioDefaults` reachable so future callers can build a
// story with synthetic inputs (e.g. for tests).
export { scenarioDefaults as _scenarioDefaults };
export type { StoryInputs };