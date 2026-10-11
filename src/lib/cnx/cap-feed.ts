// Server side of the CAP export: gathers the same inputs the board uses for
// its 48-hour outlook and verdict, turns them into CAP messages, and hands
// back the warning-log rows the change produced (the route persists them in
// the background).
//
// Shelters are bundled with the Worker by a JSON import rather than fetched
// from our own origin: no network hop, no failure mode, and the same file the
// board serves (shelters.test.ts validates it, so the guard below holds).

import sheltersJson from "../../../public/data/cnx/shelters.json";
import { boardWarnings, type BoardWarning } from "./board-warnings";
import { capMessages, type CapMessage } from "./cap";
import { buildOutlook, type ProvinceOutlook } from "./outlook";
import { fetchCnxRain } from "./rain";
import { currentRainSummary } from "./rain-core";
import { isSheltersFile, type Shelter } from "./shelters";
import { fetchCnxTwin } from "./twin";
import { fetchForecastField } from "./wind-field";
import { inBackground, LOG_COMMIT, persistWarningLog, readWarningSnapshot, verdictObservation } from "./warning-log";
import { diffWarnings, type OutlookObservation, type WarningLogRow, type WarningSnapshot, type WarningUpdate } from "./warning-log-core";
import type { VerdictCard } from "./verdict";

const sheltersData: unknown = sheltersJson;
const SHELTERS: readonly Shelter[] = isSheltersFile(sheltersData) ? sheltersData.shelters : [];

export interface CapFeed {
  generatedAt: string;
  messages: CapMessage[];
  /** Warning-log rows this request's change produced, and the snapshot to store. */
  logRows: WarningLogRow[];
  snapshot: WarningSnapshot;
}

function outlookObservations(warnings: readonly BoardWarning[]): OutlookObservation[] {
  return warnings.flatMap((w) => (w.domain === "verdict" ? [] : [{
    key: w.key, domain: w.domain, district: w.district, level: w.level, peakAt: w.peakAt, value: w.value, reasonEn: w.reasonEn,
  }]));
}

/** What the log may conclude: a domain the model did not answer for cannot "leave". */
export function warningUpdate(outlook: ProvinceOutlook, verdict: VerdictCard, warnings: readonly BoardWarning[]): WarningUpdate {
  const domains = outlook.available ? (outlook.hasPm25 ? (["rain", "pm25"] as const) : (["rain"] as const)) : [];
  return {
    verdict: verdictObservation(verdict),
    outlook: domains.length ? { domains, items: outlookObservations(warnings) } : undefined,
  };
}

export async function buildCapFeed(nowMs = Date.now()): Promise<CapFeed> {
  const [forecast, rain, twin, prev] = await Promise.all([fetchForecastField(nowMs), fetchCnxRain(), fetchCnxTwin(), readWarningSnapshot()]);
  const outlook = buildOutlook(forecast, SHELTERS, currentRainSummary(rain, nowMs));
  const warnings = boardWarnings(outlook, twin.verdict);
  const generatedAt = new Date(nowMs).toISOString();
  const { rows, next } = diffWarnings(prev, warningUpdate(outlook, twin.verdict, warnings), generatedAt, LOG_COMMIT);
  return { generatedAt, messages: await capMessages(warnings, next, nowMs), logRows: rows, snapshot: next };
}

/** The feed, with any level change logged after the response (never in its path). */
export async function loadCapFeed(): Promise<CapFeed> {
  const feed = await buildCapFeed();
  await inBackground(persistWarningLog(feed.logRows, feed.snapshot));
  return feed;
}
