// CNX keystone story — what the narrative is allowed to claim about the
// river, and what it must refuse to claim when there is no live gauge feed.
//
// The regression this exists for is subtle, and it was introduced by the
// very fix it tests. Zeroing a fabricated 42% removed the fabrication but
// left the sentence, so the story published:
//
//   "Ping river at 0% of bank-full, all CNX dams at normal storage."
//
// which reads as reassurance. The number went from wrong to absent; the
// claim stayed. That is the same error wearing a friendlier face — and it
// is why these tests assert on rendered prose, not on inputs.
//
// The pure half is exported as `buildStoryFromInputs` precisely so this
// needs no network.
//
// Run: `npx vitest run src/lib/cnx/story.test.ts

import { describe, it, expect } from "vitest";
import { buildStoryFromInputs, _scenarioDefaults, type StoryInputs } from "./story";

const SCENARIO_IDS = [
  "burning-season-peak",
  "monsoon-flood-watch",
  "songkran-surge-week",
  "stable-winter-day",
] as const;

/** Every flood-shaped claim the story could possibly make. */
const FLOOD_CLAIMS = [
  /% of bank-full/,
  /\d+% of bank/,
  /calm river/i,
  /dry-season normal/i,
  /no flood risk/i,
  /Bhumibol storage at/i,
  /Rainfall running 24-h/,
  /toward advisory/i,
];

function inputsWith(over: Partial<StoryInputs> = {}): StoryInputs {
  return { ..._scenarioDefaults(), ...over };
}

function allText(s: ReturnType<typeof buildStoryFromInputs>): string {
  return [s.headline, ...s.paragraphs, ...s.bullets].join(" | ");
}

describe("story — a river we cannot see is never described", () => {
  it("makes no flood claim in any scenario when floodLive is false", () => {
    for (const id of SCENARIO_IDS) {
      const text = allText(buildStoryFromInputs(id, inputsWith({ floodLive: false })));
      for (const claim of FLOOD_CLAIMS) {
        expect(text, `${id} asserts a river state via ${claim}`).not.toMatch(claim);
      }
    }
  });

  it("says the river is unverified rather than quiet", () => {
    const text = allText(buildStoryFromInputs("stable-winter-day", inputsWith({ floodLive: false })));
    expect(text).toMatch(/unverified/i);
    expect(text).toMatch(/not calm/i);
  });

  it("keeps its non-flood content", () => {
    // Refusing a claim must not empty the page. The air reading is live.
    const s = buildStoryFromInputs("stable-winter-day", inputsWith({ floodLive: false, pm25: 11 }));
    const text = allText(s);
    expect(text).toMatch(/PM2\.5/);
    expect(s.paragraphs.length).toBeGreaterThanOrEqual(3);
    expect(s.bullets.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps the air hazard while refusing the river claim", () => {
    const text = allText(buildStoryFromInputs("burning-season-peak", inputsWith({ floodLive: false, pm25: 180 })));
    expect(text).toMatch(/PM2\.5/);
    expect(text).toMatch(/unverified/i);
  });

  it("still names the real gauges an operator should read", () => {
    // The useful half of "we cannot see it": say where to look.
    const text = allText(buildStoryFromInputs("stable-winter-day", inputsWith({ floodLive: false })));
    expect(text).toMatch(/station gauges|gauge feed/i);
  });
});

describe("story — a live river is described normally", () => {
  it("reports the measured ratio when the feed is live", () => {
    // The other direction: suppressing the claim must not have disabled it.
    const text = allText(
      buildStoryFromInputs("stable-winter-day", inputsWith({ floodLive: true, pingCap: 0.46 })),
    );
    expect(text).toMatch(/46% of bank-full/);
    expect(text).not.toMatch(/calm river/i);
  });

  it("reports a high ratio without softening it", () => {
    const text = allText(
      buildStoryFromInputs("monsoon-flood-watch", inputsWith({ floodLive: true, pingCap: 0.91, rain24: 120 })),
    );
    expect(text).toMatch(/91% of bank-full/);
  });
});

describe("story — test fixtures carry no plausible river numbers", () => {
  it("ships defaults that cannot be mistaken for a measurement", () => {
    const d = _scenarioDefaults();
    expect(d.floodLive).toBe(false);
    expect(d.pingCap).toBe(0);
    expect(d.bhmFraction).toBe(0);
    expect(d.sktFraction).toBe(0);
    expect(d.rain24).toBe(0);
  });
});


describe("story — operational assertions require evidence", () => {
  it("does not turn missing air and flight data into reassurance or arrivals", () => {
    for (const id of SCENARIO_IDS) {
      const text = allText(buildStoryFromInputs(id, inputsWith()));
      expect(text).toMatch(/air quality is unverified/);
      expect(text).not.toMatch(/PM2\.5 0|clear air|comfort band|22 widebodies|35–45k|arrivals in the last/);
    }
  });
  it("never invents government orders, deployment schedules, or fire causes", () => {
    const text = allText(buildStoryFromInputs("burning-season-peak", inputsWith({ pm25: 180, firesLive: true, fireCount: 40, forestShare: 0.9 })));
    expect(text).toMatch(/40 hotspots/);
    expect(text).toMatch(/Suggested action/);
    expect(text).not.toMatch(/PCD declared|activities suspended|distribution at|trail open|protected forest ring|1,200 sandbags/);
  });
});
