import { describe, expect, it } from "vitest";
import { officialWatchItems, OFFICIAL_WARNING_MAX_AGE_MS } from "./official-watch";
import type { OfficialAlert, OfficialWarningsResponse } from "./tmd-cap-core";

const now = new Date("2026-10-15T03:00:00Z");
const feed = (changes: Partial<OfficialWarningsResponse> = {}): OfficialWarningsResponse => ({
  provenance: "live", fetchedAt: now.toISOString(), alerts: [], reason: null, reason_th: null,
  documentsRead: 10, documentsListed: 10, source: "TMD · CAP 1.2", ...changes,
});
const alert = (web: string | null): OfficialAlert => ({
  identifier: "warning1", sent: "2026-10-15T02:00:00Z", effective: "2026-10-15T02:00:00Z", expires: "2026-10-15T09:00:00Z",
  event: "Heavy rain", headline_th: "ฝนหนัก", headline_en: "Heavy rain", severity: "Severe", urgency: "Expected", certainty: "Likely",
  instruction_th: null, instruction_en: null, web, areaDesc: "Chiang Mai", areaDesc_th: null, areaDesc_en: null, geocodeMatch: true, polygons: [],
});

describe("official warning retrieval freshness", () => {
  it("keeps a recently checked empty feed neutral and within its stated scope", () => {
    const item = officialWatchItems(feed(), now)[0];
    expect(item.level).toBe("good");
    expect(item.chipEn).toBe("None in force");
    expect(item.evidenceEn).toContain("Not an all-clear");
  });

  it.each(["2026-10-14T03:00:00Z", "2026-10-15T03:06:00Z", "invalid"])("does not claim no official warning from an unverifiable check (%s)", fetchedAt => {
    const item = officialWatchItems(feed({ fetchedAt }), now)[0];
    expect(item.level).toBe("unknown");
    expect(item.valueEn).toBe("TMD warnings unavailable");
    expect(item.chipEn).toBeUndefined();
    expect(item.evidenceEn).toContain("stale or its time cannot be verified");
  });

  it("ages the check at the existing board budget, without aging a CAP warning by its issue date", () => {
    const boundary = new Date(now.getTime() - OFFICIAL_WARNING_MAX_AGE_MS).toISOString();
    expect(officialWatchItems(feed({ fetchedAt: boundary, alerts: [alert(null)] }), now)[0].level).toBe("alert");
    expect(officialWatchItems(feed({ fetchedAt: new Date(Date.parse(boundary) - 1).toISOString(), alerts: [alert(null)] }), now)[0].level).toBe("unknown");
  });
});

describe("official source evidence links", () => {
  it.each(["https://www.tmd.go.th/warnings/1", "http://www.tmd.go.th/warnings/1"])("preserves a publisher HTTP(S) evidence URL (%s)", web => {
    expect(officialWatchItems(feed({ alerts: [alert(web)] }), now)[0].evidenceUrl).toBe(web);
  });
  it.each([null, "/warnings/1", "javascript:alert(1)", "data:text/html,test"])("rejects an unsafe or unresolvable evidence URL (%s)", web => {
    expect(officialWatchItems(feed({ alerts: [alert(web)] }), now)[0].evidenceUrl).toBeUndefined();
  });
});
