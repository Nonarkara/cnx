// Haze reports from public posts and local media: what the relay
// (scripts/citizen-reports.mjs) pushes and /api/cnx/citizen serves.
// Topic detection and place matching live in citizen-core.ts.

import type { CitizenReport, PlaceKind, ReportSource } from "./citizen-core";
import { isHttpsUrl, isIsoDate, isNum, isObj, isStr, readRelayJson } from "./relay-kv";

export const CITIZEN_KV_KEY = "citizen-reports-latest";
const STALE_MS = 3 * 60 * 60_000;
const MAX_REPORTS = 400;
const SOURCES: ReportSource[] = ["reddit", "news"];
const KINDS: PlaceKind[] = ["landmark", "neighbourhood", "subdistrict", "district"];

export interface SourceStatus {
  id: string;
  label: string;
  ok: boolean;
  items: number;
}

export interface CitizenPayload {
  generatedAt: string;
  reports: CitizenReport[];
  sources: SourceStatus[];
}

export interface CitizenResponse extends CitizenPayload {
  provenance: "live" | "unavailable";
  note: string;
}

const COVERAGE_NOTE =
  "Public posts from Reddit r/chiangmai and Thai/English local news found by haze keywords. Facebook, X, LINE and TikTok are not included (login required; scraping is against their terms). Pins sit on the centroid of the place a post names — the circle shows how approximate that is. Posts that name no place are listed but not pinned.";

function isReport(v: unknown): v is CitizenReport {
  if (!isObj(v)) return false;
  const p = v.place;
  const placeOk =
    p === null ||
    (isObj(p) &&
      isStr(p.nameTh, 200) &&
      isStr(p.nameEn, 200) &&
      isNum(p.lat) &&
      isNum(p.lon) &&
      KINDS.includes(p.kind as PlaceKind) &&
      isNum(p.precisionKm) &&
      isStr(p.matched, 200));
  return (
    isStr(v.id, 200) &&
    SOURCES.includes(v.source as ReportSource) &&
    isStr(v.title, 400) &&
    isHttpsUrl(v.url) &&
    isIsoDate(v.publishedAt) &&
    Array.isArray(v.terms) &&
    v.terms.length <= 20 &&
    v.terms.every((t) => isStr(t, 40)) &&
    placeOk
  );
}

export function isCitizenPayload(v: unknown): v is CitizenPayload {
  return (
    isObj(v) &&
    isIsoDate(v.generatedAt) &&
    Array.isArray(v.reports) &&
    v.reports.length <= MAX_REPORTS &&
    v.reports.every(isReport) &&
    Array.isArray(v.sources) &&
    v.sources.length <= 20 &&
    v.sources.every((s) => isObj(s) && isStr(s.id, 60) && isStr(s.label, 120) && typeof s.ok === "boolean" && isNum(s.items))
  );
}

export async function fetchCnxCitizenReports(): Promise<CitizenResponse> {
  const data = await readRelayJson(CITIZEN_KV_KEY, STALE_MS, isCitizenPayload);
  if (data) return { ...data, provenance: "live", note: COVERAGE_NOTE };
  return {
    generatedAt: new Date().toISOString(),
    reports: [],
    sources: [],
    provenance: "unavailable",
    note: `The citizen-report relay has not reported in the last 3 hours. ${COVERAGE_NOTE}`,
  };
}
