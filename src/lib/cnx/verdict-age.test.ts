import { describe, expect, it } from "vitest";
import { isVerdictCurrent } from "./verdict-age";

describe("retained assessment clock", () => {
  const now = Date.parse("2026-10-26T03:00:00Z");
  it("expires an earlier calm assessment even if its transport said live", () => {
    expect(isVerdictCurrent("2026-10-26T02:00:00Z", now)).toBe(false);
    expect(isVerdictCurrent("2026-10-26T02:50:00Z", now)).toBe(true);
    expect(isVerdictCurrent("2026-10-26T02:49:59Z", now)).toBe(false);
  });
  it("rejects missing, invalid or implausibly future computation clocks", () => {
    for (const stamp of ["", "invalid", "2026-10-26T03:02:00Z"]) expect(isVerdictCurrent(stamp, now)).toBe(false);
  });
});
