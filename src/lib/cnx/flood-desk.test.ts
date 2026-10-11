import { describe, expect, it } from "vitest";
import { ageText, buildDeskAnswer, damLine, floodHubLine, forecastLine, rainLine, riverLine, type DeskInputs } from "./flood-desk";
import { NOW, damsOk, gauge, rainOk, riverOk } from "./flood-desk.fixtures";
import type { FloodHubResponse } from "./floodhub";
import type { ProvinceOutlook } from "./outlook";

const unavailableAll: DeskInputs = {
  river: { status: "ok", data: { ...riverOk([]), provenance: "unavailable", unavailableReason: "relay silent for 40 min" } },
  dams: { status: "ok", data: { ...damsOk(), large: [], medium: [], provenance: "unavailable", unavailableReason: "The dam relay has not reported in the last three hours" } },
  rain: { status: "failed" },
  floodHub: { status: "failed" },
  outlook: null,
};

describe("unavailable parts stay unavailable, with their reason", () => {
  it("never reports an unavailable feed as calm", () => {
    const a = buildDeskAnswer(unavailableAll, NOW);
    expect(a.lines.every((l) => l.status === "unavailable" && l.level === "unknown")).toBe(true);
    expect(a.level).toBe("unknown");
    expect(a.missing).toBe(5);
    expect(a.th).toMatch(/ไม่ใช่การยืนยันว่าปลอดภัย/);
    expect(a.en).toMatch(/not confirmation of safety/);
  });
  it("carries the feed's own reason", () => {
    const a = buildDeskAnswer(unavailableAll, NOW);
    expect(a.lines.find((l) => l.key === "river")?.en).toMatch(/relay silent for 40 min/);
    expect(a.lines.find((l) => l.key === "dams")?.en).toMatch(/has not reported/);
  });
  it("treats a live river feed with only old readings as unknown, not good", () => {
    const line = riverLine({ status: "ok", data: riverOk([gauge({ observedAt: "2026-10-10T20:00:00Z" })]) }, NOW);
    expect(line.status).toBe("unavailable");
  });
  it("does not grade a gauge with no bank geometry", () => {
    const line = riverLine({ status: "ok", data: riverOk([gauge({ belowBankM: null, headroomM: null })]) }, NOW);
    expect(line.level).toBe("unknown");
    expect(line.en).toMatch(/cannot be graded/);
  });
  it("keeps a measured dry day distinct from a missing rain feed", () => {
    expect(rainLine({ status: "ok", data: rainOk(0) }, NOW)).toMatchObject({ status: "ok", level: "good" });
    expect(rainLine({ status: "ok", data: { ...rainOk(), provenance: "unavailable", note: "relay down" } }, NOW)).toMatchObject({ status: "unavailable", en: "relay down" });
  });
  it("does not read Flood Hub's UNKNOWN as no flooding", () => {
    const fh = { provenance: "live", worst: "UNKNOWN", points: [], note: "n", outlook: "unknown", generatedAt: "" } as unknown as FloodHubResponse;
    expect(floodHubLine({ status: "ok", data: fh }).status).toBe("unavailable");
  });
});

describe("answer first", () => {
  it("names the river closest to its bank", () => {
    const line = riverLine({ status: "ok", data: riverOk([gauge(), gauge({ id: "x", code: "P.67", nameEn: "Ban Mae Taeng", belowBankM: 0.6, headroomM: null, severity: "alert" })]) }, NOW);
    expect(line).toMatchObject({ level: "alert" });
    expect(line.en).toBe("1 gauge near or over the bank — Ban Mae Taeng (P.67) 0.6 m below bank");
  });
  it("answers 'dams near full?' from the captured report", () => {
    const line = damLine({ status: "ok", data: damsOk() });
    expect(line.level).toBe("watch"); // Mae Ngat near full; full medium reservoirs cap at watch
    expect(line.th).toMatch(/^แม่งัดสมบูรณ์ชล 95% ของระดับเก็บกักปกติ \(ใกล้เต็ม\)/);
    expect(line.en).toBe("Mae Ngat at 95% of normal storage (near full) · 1 medium reservoir near or above normal storage");
    expect(line.observedAt).toBe("2026-10-11");
  });
  it("headlines the worst signal across parts", () => {
    const inputs: DeskInputs = { ...unavailableAll, rain: { status: "ok", data: rainOk() }, dams: { status: "ok", data: damsOk() } };
    const a = buildDeskAnswer(inputs, NOW);
    expect(a.level).toBe("alert");
    expect(a.en).toMatch(/^Measured rain, 24 h: Very heavy rain: Chom Thong 94.5 mm/);
  });
  it("phrases a calm forecast as not a guarantee", () => {
    const o = { available: true, fetchedAt: "2026-10-11T04:00:00Z", rain: [], air: [], wettest: { nameTh: "แม่แจ่ม", nameEn: "Mae Chaem", rain24h: 12 }, dirtiest: null, hasPm25: false } as unknown as ProvinceOutlook;
    expect(forecastLine(o).en).toMatch(/not a guarantee/);
    expect(forecastLine(null).status).toBe("unavailable");
  });
});

describe("ageText", () => {
  it("ages instants and report days in the reader's language", () => {
    expect(ageText({ observedAt: "2026-10-11T04:30:00Z", ageMode: "time", staleAfterMs: 3 * 3_600_000 }, NOW, "th")).toEqual({ text: "30 นาทีที่แล้ว", stale: false });
    expect(ageText({ observedAt: "2026-10-11T00:00:00Z", ageMode: "time", staleAfterMs: 3 * 3_600_000 }, NOW, "en")).toEqual({ text: "stale · 5 h ago", stale: true });
    expect(ageText({ observedAt: "2026-10-10", ageMode: "day", staleAfterMs: 2 * 86_400_000 }, NOW, "en")).toEqual({ text: "yesterday's report", stale: false });
    expect(ageText({ observedAt: null, ageMode: "time", staleAfterMs: 1 }, NOW, "th")).toBeNull();
  });
});
