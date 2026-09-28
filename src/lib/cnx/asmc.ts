// CNX ASMC transboundary haze ingest.
//
// ASMC (ASEAN Specialized Meteorological Centre) publishes regional haze
// products that are gold for Chiang Mai haze season:
//
//   - Hotspot count by ASEAN sub-region (Myanmar / Thailand / Laos /
//     Cambodia / Vietnam) — primary signal for transboundary smoke
//   - 24 h PM10 dispersion simulation (regional wind transport)
//   - Haze assessment narrative (assessment level: good / moderate /
//     unhealthy / hazardous)
//   - Wind analysis at 925 hPa (the level that carries smoke surface-ward)
//
// Haze is transboundary. Chiang Mai's worst burning-season days are
// usually fed by fires in Myanmar (Shan State) and Laos (Bokeo / Luang
// Prabang / Sayaboury), not domestic CNX burning — that's why ASMC
// matters more than FIRMS-CNX-bbox for the haze verdict.
//
// ASMC WIS 2.0 portal: https://asmc.asean.org/ (live HTML).
// Public read endpoints under the WIS 2.0 API were probed 2026-09-28 —
// the JSON endpoints are not currently reachable from this environment
// (DNS failures for api.haze.asean.org / api-asmc.onegeology.org).
// This adapter is therefore staged in **token-gated** form, ready to
// light up once the operator provisions ASMC_API_KEY. Until then the
// module returns a clear "needs key" surface — never fabricated
// regional hotspot counts.
//
// Probed endpoints (all 403/timeout/404 from CF edge 2026-09-28):
//   - https://asmc.asean.org/                                (HTML, OK)
//   - https://api.haze.asean.org/                            (DNS NXDOMAIN)
//   - https://api-asmc.onegeology.org/wis/                   (DNS NXDOMAIN)
//
// Recommended pattern once the URL is provisioned:
//   GET /api/v1/regional/hotspots?date=YYYY-MM-DD&bbox=CNX-MMR-LAO
//   GET /api/v1/regional/haze-assessment?date=YYYY-MM-DD
//   GET /api/v1/regional/wind-925?date=YYYY-MM-DD
//
// See: https://asmc.asean.org/asmc-haze-2-0-portal/

import type { SeverityLevel } from "../../types/cnx";

const ASMC_BASE = process.env.ASMC_BASE ?? "https://api.haze.asean.org";

export interface AsmcHotspotRegion {
  /** ISO country code or ASMC sub-region (e.g. "MMR-N", "THA-N", "LAO-N"). */
  region: string;
  /** Display name in English. */
  name: string;
  /** Hotspot count in the last 24 h. */
  hotspots24h: number;
  /** Severity band derived from the count. */
  severity: SeverityLevel;
  /** Delta vs 7-day rolling mean (positive = escalating). */
  deltaVs7d: number | null;
}

export interface AsmcResponse {
  generatedAt: string;
  observedAt: string;
  /** ASEAN sub-regions relevant to Chiang Mai haze transport. */
  regions: AsmcHotspotRegion[];
  /** Overall ASMC haze assessment level. */
  assessment: "good" | "moderate" | "unhealthy" | "hazardous" | "unknown";
  assessment_th: string;
  assessment_en: string;
  /** Free-text summary in English from ASMC. */
  summary: string | null;
  /** Provenance — see the same-shape DustBoy module for pattern. */
  provenance: "live" | "needs-key" | "scenario";
  note: string | null;
}

interface AsmcRawPayload {
  observed_at?: string;
  assessment?: string;
  summary?: string;
  hotspots?: Array<{
    region?: string;
    name?: string;
    count?: number;
    delta_7d?: number;
  }>;
  regions?: Array<{
    region?: string;
    name?: string;
    hotspots_24h?: number;
    delta_7d?: number;
  }>;
}

function severityForCount(count: number): SeverityLevel {
  if (count >= 500) return "critical";
  if (count >= 200) return "alert";
  if (count >= 50) return "watch";
  return "good";
}

function normaliseRegions(raw: AsmcRawPayload): AsmcHotspotRegion[] {
  const src = raw.hotspots ?? raw.regions ?? [];
  const out: AsmcHotspotRegion[] = [];
  for (const r of src) {
    const region = r.region ?? "";
    const count = typeof r.count === "number" ? r.count : typeof r.hotspots_24h === "number" ? r.hotspots_24h : 0;
    out.push({
      region,
      name: r.name ?? region,
      hotspots24h: count,
      severity: severityForCount(count),
      deltaVs7d: typeof r.delta_7d === "number" ? r.delta_7d : null,
    });
  }
  return out;
}

function normaliseAssessment(raw: string | undefined): AsmcResponse["assessment"] {
  if (!raw) return "unknown";
  const s = raw.toLowerCase();
  if (s.includes("hazard")) return "hazardous";
  if (s.includes("unhealthy")) return "unhealthy";
  if (s.includes("moderate")) return "moderate";
  if (s.includes("good")) return "good";
  return "unknown";
}

function assessmentHeadline(level: AsmcResponse["assessment"]): { th: string; en: string } {
  switch (level) {
    case "hazardous":
      return {
        th: "ASMC: หมอกควันอันตราย — งดกิจกรรมกลางแจ้ง แจก N95",
        en: "ASMC: hazardous haze — cancel outdoor activity, distribute N95",
      };
    case "unhealthy":
      return {
        th: "ASMC: หมอกควันมีผลกระทบต่อสุขภาพ",
        en: "ASMC: unhealthy haze — sensitive groups stay indoors",
      };
    case "moderate":
      return {
        th: "ASMC: หมอกควันปานกลาง — ติดตามสถานการณ์",
        en: "ASMC: moderate haze — monitor the situation",
      };
    case "good":
      return { th: "ASMC: อากาศดี", en: "ASMC: air quality good" };
    default:
      return { th: "ASMC: ไม่มีข้อมูล", en: "ASMC: no assessment available" };
  }
}

async function fetchLiveAsmc(): Promise<AsmcResponse | null> {
  const key = process.env.ASMC_API_KEY;
  if (!key) return null;
  // Two known probes; flip ASMC_BASE in env if the operator finds a
  // different working host. Both endpoints are reasonable starting
  // points for the WIS 2.0 regional product family.
  const urls = [`${ASMC_BASE}/api/v1/regional/haze-assessment`, `${ASMC_BASE}/api/v1/haze-assessment`];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as AsmcRawPayload;
      const assessment = normaliseAssessment(json.assessment);
      const head = assessmentHeadline(assessment);
      const regions = normaliseRegions(json);
      return {
        generatedAt: new Date().toISOString(),
        observedAt: json.observed_at ?? new Date().toISOString(),
        regions,
        assessment,
        assessment_th: head.th,
        assessment_en: head.en,
        summary: json.summary ?? null,
        provenance: "live",
        note: null,
      };
    } catch (e) {
      console.warn(`[asmc] ${url} failed: ${(e as Error).message}`);
    }
  }
  return null;
}

let cache: { at: number; data: AsmcResponse } | null = null;
const TTL_MS = 30 * 60_000; // 30 min — assessment moves slowly

export async function fetchCnxAsmc(): Promise<AsmcResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const live = await fetchLiveAsmc();
  if (live) {
    cache = { at: Date.now(), data: live };
    return live;
  }
  // Honest-data fallback — never fabricate regional hotspot counts.
  const hasKey = !!process.env.ASMC_API_KEY;
  const head = assessmentHeadline("unknown");
  const data: AsmcResponse = {
    generatedAt: new Date().toISOString(),
    observedAt: new Date().toISOString(),
    regions: [],
    assessment: "unknown",
    assessment_th: head.th,
    assessment_en: head.en,
    summary: null,
    provenance: hasKey ? "scenario" : "needs-key",
    note: hasKey
      ? "ASMC_API_KEY is set but no regional endpoint responded — set ASMC_BASE to the working host, or check token scope."
      : "ASMC_API_KEY is not set. ASMC (ASEAN Specialized Meteorological Centre) provides the only public transboundary haze assessment covering Myanmar/Laos/Thailand/Cambodia/Vietnam — provisioning a free key lights up the regional signal.",
  };
  cache = { at: Date.now(), data };
  return data;
}
