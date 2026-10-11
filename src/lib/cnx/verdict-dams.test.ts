// Defect D2 (docs/DIGITAL-TWIN-STANDARDS.md): the dam rule once said
// Bhumibol/Sirikit releases raise the Ping at Chiang Mai. Bhumibol is
// downstream in Tak and Sirikit is on the Nan. These tests keep that wrong
// physical model out of the verdict for good.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { upstreamDamSurge } from "./verdict";

const WRONG_DAMS = /Bhumibol|Sirikit|ภูมิพล|สิริกิติ์/;

/** verdict.ts with comments removed, so only code and reason strings remain. */
function verdictCode(): string {
  const src = readFileSync(join(process.cwd(), "src/lib/cnx/verdict.ts"), "utf8");
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\/\/.*$/, ""))
    .join("\n");
}

describe("upstream dam rule", () => {
  it("verdict.ts carries no Bhumibol or Sirikit reason text", () => {
    expect(verdictCode()).not.toMatch(WRONG_DAMS);
  });

  it("fires on a Mae Ngat release surge", () => {
    expect(upstreamDamSurge([{ damId: "MNG", inflowM3s: 20, outflowM3s: 40 }])).toBe(true);
  });

  it("ignores a surge at Bhumibol or Mae Kuang, which do not reach gauge P.1", () => {
    expect(
      upstreamDamSurge([
        { damId: "BHM", inflowM3s: 20, outflowM3s: 80 },
        { damId: "MKT", inflowM3s: 20, outflowM3s: 80 },
        { damId: "MNG", inflowM3s: 20, outflowM3s: 25 },
      ]),
    ).toBe(false);
  });

  it("does not fire without both inflow and release", () => {
    expect(upstreamDamSurge([{ damId: "MNG", outflowM3s: 40 }])).toBe(false);
  });
});
