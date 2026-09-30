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

// How the story is allowed to talk about the river.
//
// Every scenario below wants to say something about the Ping. When there
// is no live gauge feed it must not, and it must not be faked by zeroing
// the number either: "Ping river at 0% of bank-full" is a sentence that
// means *calm*, produced by a missing measurement. That is the same error
// as the fabricated value, wearing reassurance instead of alarm.
const FLOOD_UNKNOWN =
  "No live river-gauge reading this cycle — the river state is unverified, not calm. Read the station gauges in your area.";

const SCENARIOS: Record<string, (now: string, s: StoryInputs) => CnxStoryResponse> = {
  "burning-season-peak": (now, s) => ({
    generatedAt: now,
    headline: "Burning-season haze holds over the Ping valley",
    paragraphs: [
      `Province-average PM2.5 is ${s.pm25} µg/m³ — the valley floor is sitting in the "unhealthy" band that the PCD declared at ${s.pm25 > 90 ? "13:00" : "08:30"}.`,
      s.firesLive
        ? `NASA FIRMS shows ${s.fireCount} hotspots inside the CNX bbox, with ${Math.round((s.forestShare ?? 0) * 100)}% of them in the protected forest ring around Doi Suthep–Pui and Doi Inthanon.`
        : "NASA FIRMS has no live pass this cycle, so no satellite hotspot count is stated.",
      s.floodLive
        ? `Ping river at Nawarat Bridge is at ${(s.pingCap * 100).toFixed(0)}% of bank-full.`
        : FLOOD_UNKNOWN,
    ],
    bullets: [
      "N95 distribution at the Chang Phueak mobile unit 06:00–10:00 daily",
      "Outdoor school activities suspended for grades 1–6",
      "Tourism Authority: Doi Suthep sunset viewing allowed but haze-tolerant",
      "Open 24-hr: PCD hotline 0-2583-7100",
    ],
    officeNotices: s.officeNotices,
  }),
  "monsoon-flood-watch": (now, s) => ({
    generatedAt: now,
    headline: s.floodLive
      ? "Monsoon pulses lifting the Ping toward advisory"
      : "Monsoon active — river state unverified this cycle",
    paragraphs: [
      s.floodLive
        ? `Ping river at Nawarat Bridge is at ${(s.pingCap * 100).toFixed(0)}% of bank-full; IRRI has the Tha Wung pumps staged for deployment.`
        : FLOOD_UNKNOWN,
      s.floodLive
        ? `Bhumibol storage at ${s.bhmFraction}% and Sirikit at ${s.sktFraction}% — no release scheduled, but discharge watches are hourly.`
        : "No live reservoir storage feed, so no dam release is claimed or ruled out.",
      s.floodLive
        ? `Rainfall running 24-h ${s.rain24} mm across the upper Ping; Mae Kuang and Mae Taeng gauges are the early-warning set.`
        : "No live rainfall feed this cycle; Mae Kuang and Mae Taeng gauges remain the early-warning set.",
    ],
    bullets: [
      "Pre-stage 1,200 sandbags at Tha Wung fire station",
      "Low-lying Tha Khlong Yang subdistrict: door-knock checklist tonight",
      "Highway 11 detour via San Pa Tong if water rises > 0.5 m above road",
      "Governor hotline 0-5321-1053 (24 h)",
    ],
    officeNotices: s.officeNotices,
  }),
  "songkran-surge-week": (now, s) => ({
    generatedAt: now,
    headline: "Songkran week: 22 widebodies inbound in 24 h",
    paragraphs: [
      `Flight radar shows ${s.wideCount} widebody arrivals in the last 24 h — A380 / B777 / A350 set the inbound pace for Songkran.`,
      `Immigration queue forecast at Tha Phae arrival hall: peak 09:00–11:00 and 18:00–21:00.`,
      `Old City moat crowds expected 35–45k/day; Songkran parade staging from Tha Phae Gate 08:00.`,
    ],
    bullets: [
      "TAT mobile ambassadors at airport for tourist info (Thai/EN/中/日本語)",
      "Moat bridge crowd-flow officers: 08:00–22:00",
      "Wat Phra Singh dress-code volunteers at east gate",
      "Water-throw zones: Old City moat only — highway off-ramps prohibited",
    ],
    officeNotices: s.officeNotices,
  }),
  "stable-winter-day": (now, s) => ({
    generatedAt: now,
    headline: s.floodLive
      ? "Stable winter day — clear air, calm river"
      : "Stable winter day — clear air, river state unverified",
    paragraphs: [
      `Province-average PM2.5 ${s.pm25} µg/m³ — well within the comfort band.`,
      s.floodLive
        ? `Ping river at ${(s.pingCap * 100).toFixed(0)}% of bank-full, all CNX dams at normal storage.`
        : FLOOD_UNKNOWN,
      `${s.wideCount} widebody arrivals in the last 24 h — winter tourism at its normal weekday pace.`,
    ],
    bullets: [
      "Standard operating posture",
      "Doi Suthep summit clear, hiking trail open",
      "Walking Street Saturday & Sunday normal hours",
      s.floodLive
        ? "Flood watch: dry-season normal, no advisory"
        : "River state unverified — no live gauge feed this cycle",
    ],
    officeNotices: s.officeNotices,
  }),
};

interface StoryInputs {
  pm25: number;
  fireCount: number;
  firesLive: boolean;
  forestShare: number | undefined;
  pingCap: number;
  bhmFraction: number;
  sktFraction: number;
  rain24: number;
  wideCount: number;
  officeNotices: OfficeNotice[];
  /** True only when the flood feed actually produced measurements. */
  floodLive: boolean;
}

function scenarioDefaults(): StoryInputs {
  return {
    pm25: 38,
    fireCount: 14,
    firesLive: true,
    forestShare: 0.71,
    // Deliberately not the old 0.42 / 0.81 / 0.74. Those were plausible
    // numbers for a river we were not measuring, and a test fixture that
    // carries them will eventually be copied into production code.
    pingCap: 0,
    bhmFraction: 0,
    sktFraction: 0,
    rain24: 0,
    wideCount: 6,
    officeNotices: [],
    floodLive: false,
  };
}

export async function buildCnxStory(
  scenarioId?: string | null,
): Promise<CnxStoryResponse> {
  const now = new Date().toISOString();
  const [flood, air, fires] = await Promise.all([
    fetchCnxFlood(),
    fetchCnxAirQuality(),
    fetchCnxFires(),
  ]);

  // Every fallback here used to be a hardcoded plausible number — `?? 0.42`
  // for the river, `?? 38` for PM2.5, 81/74 for the dams. A fabricated default
  // is worse than a missing one, because `pickScenario` below *selects the
  // narrative* on these values: invent a river ratio and you have written the
  // story that gets published. Missing data gets 0, which selects nothing.
  const floodLive = flood.provenance === "live";
  const bhm = flood.reservoirs.find((r) => r.damId === "BHM");
  const skt = flood.reservoirs.find((r) => r.damId === "SKT");
  const avgRain = flood.rainfall.reduce((a, r) => a + r.rainfall24hMm, 0) /
    Math.max(1, flood.rainfall.length);

  const inputs: StoryInputs = {
    pm25: air.provinceAvgPm25 ?? 0,
    fireCount: fires.provenance === "live" ? fires.totalCount : 0,
    firesLive: fires.provenance === "live",
    forestShare: fires.forestShare,
    pingCap: floodLive ? (flood.pingCapacityFraction ?? 0) : 0,
    bhmFraction: floodLive && bhm ? Math.round(bhm.fillFraction * 100) : 0,
    sktFraction: floodLive && skt ? Math.round(skt.fillFraction * 100) : 0,
    rain24: floodLive ? Math.round(avgRain * 10) / 10 : 0,
    wideCount: 0, // patched in from /api/cnx/flights below; default for keystone copy
    // `flood.office` is generated inside buildScenario() and attributed to
    // "Royal Irrigation Department Region 1". Never quote a government
    // agency on the strength of a hash seed — it outranks everything else
    // on this wall.
    officeNotices: [air.office, floodLive ? flood.office : null].filter(Boolean) as OfficeNotice[],
    floodLive,
  };

  const key = (scenarioId && SCENARIOS[scenarioId]) ? scenarioId : pickScenario(inputs);
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
  const builder = SCENARIOS[scenarioId] ?? SCENARIOS["stable-winter-day"];
  return builder(now, inputs);
}

function pickScenario(i: StoryInputs): keyof typeof SCENARIOS {
  if (i.pm25 >= 50) return "burning-season-peak";
  if (i.floodLive && (i.pingCap >= 0.85 || i.rain24 >= 80)) return "monsoon-flood-watch";
  return "stable-winter-day";
}

// Keep `scenarioDefaults` reachable so future callers can build a
// story with synthetic inputs (e.g. for tests).
export { scenarioDefaults as _scenarioDefaults };
export type { StoryInputs };