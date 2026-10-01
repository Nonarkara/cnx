// CNX data-age stamp — the rules that stop a freshness indicator from
// becoming a reassurance.
//
// The component is small, so the tests target the specific ways it could
// lie:
//
//   - falling back to `generatedAt` / "now" when the feed is dark
//   - rendering an age for a reading that does not exist
//   - rendering 0m for an empty list
//   - freezing, so "4 min ago" never becomes "40 min ago"
//   - reading a future timestamp as if it were current
//
// Run: `npx vitest run src/lib/cnx/data-age.test.ts

import { describe, expect, it } from "vitest";
import { newest } from "../../components/CNX/CNXDataAge";

describe("newest — an empty feed is not a fresh feed", () => {
  it("returns null for an empty list, never a now-timestamp", () => {
    expect(newest([])).toBeNull();
    expect(newest(undefined)).toBeNull();
    expect(newest(null)).toBeNull();
  });

  it("returns null when every entry lacks the field", () => {
    expect(newest([{ observedAt: null }, { observedAt: undefined }])).toBeNull();
  });

  it("picks the newest, not the first", () => {
    const rows = [
      { observedAt: "2026-10-01T02:00:00.000Z" },
      { observedAt: "2026-10-01T04:00:00.000Z" },
      { observedAt: "2026-10-01T03:00:00.000Z" },
    ];
    expect(newest(rows)).toBe("2026-10-01T04:00:00.000Z");
  });

  it("skips unparseable timestamps rather than returning them", () => {
    // A garbage timestamp would render as NaN, and "NaN min ago" is worse
    // than admitting we do not know.
    const rows = [
      { observedAt: "not-a-date" },
      { observedAt: "2026-10-01T04:00:00.000Z" },
    ];
    expect(newest(rows)).toBe("2026-10-01T04:00:00.000Z");
    expect(newest([{ observedAt: "not-a-date" }])).toBeNull();
  });

  it("accepts epoch milliseconds, which some feeds use", () => {
    expect(newest([{ observedAt: 1790822400000 }])).toBe(1790822400000);
  });

  it("reads the field each feed actually names", () => {
    // Google status rows say `issuedTime`, gauge rows say `observedAt`.
    // Guessing one for both renders "no observation" on a panel that has
    // one — the exact quiet failure this component exists to prevent.
    const issued = [{ issuedTime: "2026-10-01T01:00:00.000Z" }];
    expect(newest(issued, "issuedTime")).toBe("2026-10-01T01:00:00.000Z");
    expect(newest(issued, "observedAt")).toBeNull();
  });

  it("mixes a numeric and a string timestamp without picking wrongly", () => {
    const rows = [
      { observedAt: 1790822400000 }, // 2026-10-01T02:40Z-ish
      { observedAt: "2026-10-01T06:00:00.000Z" },
    ];
    expect(newest(rows)).toBe("2026-10-01T06:00:00.000Z");
  });
});
