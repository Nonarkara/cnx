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
import { newest, ageVerdict } from "../../components/CNX/CNXDataAge";

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

describe("ageVerdict — wording must never claim an age it does not have", () => {
  const MS = 3_600_000;          // one hour
  const H = 3 * MS;              // the DustBoy batch rule: 3 hours
  const now = Date.parse("2026-10-01T12:00:00.000Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("makes no age claim at all before the clock exists", () => {
    // The regression this pins. The first version fell through to
    // "timestamp unreadable" whenever `now` was null — which is every
    // server render and every pre-hydration frame. That is a lie: the
    // timestamp parses fine, there is simply nothing to subtract it from
    // yet, and it flashed on every hydrated panel.
    const v = ageVerdict("2026-10-01T11:59:00.000Z", null, H);
    expect(v.text).toBeNull();
    expect(v.text).not.toBe("timestamp unreadable");
  });

  it("says 'no observation' when there is genuinely no reading", () => {
    expect(ageVerdict(null, now, H).text).toBe("no observation");
    expect(ageVerdict(undefined, now, H).text).toBe("no observation");
    expect(ageVerdict(null, now, H, "no detection in window").text).toBe("no detection in window");
  });

  it("distinguishes a real age from a missing one", () => {
    // Same instant, two feeds: one measured, one dark. The measured one
    // gets an age; the dark one does not. Collapsing these is the whole
    // failure the component exists to prevent.
    expect(ageVerdict(ago(90 * 60_000), now, H).text).toBe("90 min ago");
    expect(ageVerdict(null, now, H).text).toBe("no observation");
  });

  it("names staleness in text as well as amber past the threshold", () => {
    const stale = ageVerdict(ago(6 * MS), now, H);
    expect(stale.text).toBe("stale · 6 h ago");
    expect(stale.tone).toBe("text-[#f99d1b]");
  });

  it("calls a future timestamp clock skew, not a negative age", () => {
    const future = new Date(now + 4 * MS).toISOString();
    const v = ageVerdict(future, now, H);
    expect(v.text).toBe("timestamp is in the future");
    expect(v.text).not.toMatch(/-\d/);
    expect(v.tone).toBe("text-[#f99d1b]");
  });

  it("says 'unreadable' only for a genuinely unparseable timestamp", () => {
    expect(ageVerdict("not-a-date", now, H).text).toBe("timestamp unreadable");
  });

  it("scales the wording with the gap", () => {
    expect(ageVerdict(ago(30_000), now, H).text).toBe("just now");
    // 90 min must NOT read as "1 h ago" — that would make the reading
    // half an hour fresher than it is.
    expect(ageVerdict(ago(90 * 60_000), now, H).text).toBe("90 min ago");
    expect(ageVerdict(ago(72 * MS), now, H).text).toBe("stale · 3 d ago");
  });
});

describe("the FIRMS stamp reads the field FIRMS actually uses", () => {
  it("finds detections by detectedAt, and misses them by default", () => {
    // Regression, and the one that mattered. `newest()` defaults to
    // "observedAt"; `FireHotspot` has no such field — it has
    // `detectedAt`. Passing the default produced a stamp reading "no
    // detection in window" directly beside a non-zero totalCount: the
    // panel denying its own count. It stayed hidden only because CNX
    // genuinely had zero fires that day; the first real detection would
    // have shipped it.
    const hotspots = [
      { detectedAt: "2026-10-01T04:00:00.000Z", brightness: 342.5 },
      { detectedAt: "2026-10-01T03:00:00.000Z", brightness: 325.1 },
    ];
    expect(newest(hotspots, "detectedAt")).toBe("2026-10-01T04:00:00.000Z");
    // The default must return null for this shape — that is the trap, and
    // it is why the call site has to name the field out loud.
    expect(newest(hotspots)).toBeNull();
  });

  it("picks the newest detection, not the first row", () => {
    const rows = [
      { detectedAt: "2026-10-01T02:00:00.000Z" },
      { detectedAt: "2026-10-01T06:30:00.000Z" },
      { detectedAt: "2026-10-01T01:00:00.000Z" },
    ];
    expect(newest(rows, "detectedAt")).toBe("2026-10-01T06:30:00.000Z");
  });
});
