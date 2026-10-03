import { describe, expect, it } from "vitest";
import { compareSeasons, type BurnMonth, type BurnSeason } from "./burn-season";

const m = (month: string, over: Partial<BurnMonth> = {}): BurnMonth => ({
  month,
  farmRai: { paddy: 10, sugarcane: 0, mixed: 0, corn: 0 },
  forestRai: 10,
  hotspots: null,
  pm25Avg: null,
  pm25DaysOver: null,
  ...over,
});

const season = (labelBE: number, months: BurnMonth[], totals: Partial<BurnSeason["totals"]>): BurnSeason => ({
  labelBE,
  from: months[0].month,
  to: months.at(-1)!.month,
  months,
  totals: { farmRai: 0, forestRai: 0, totalRai: 0, hotspots: 0, monthsWithData: months.length, ...totals },
});

describe("compareSeasons", () => {
  it("gives percentage change in burned area", () => {
    const c = compareSeasons(
      season(2569, [m("202601")], { farmRai: 135, forestRai: 61, totalRai: 196 }),
      season(2568, [m("202501")], { farmRai: 100, forestRai: 100, totalRai: 200 }),
    );
    expect(c).toMatchObject({ farmPct: 35, forestPct: -39, totalPct: -2 });
  });

  it("compares hotspots only over months both seasons report", () => {
    // Latest has Nov data the prior season lacks; it must not inflate the comparison.
    const latest = season(2569, [m("202511", { hotspots: 500 }), m("202603", { hotspots: 910 })], {});
    const prior = season(2568, [m("202411", { hotspots: null }), m("202503", { hotspots: 459 })], {});
    const c = compareSeasons(latest, prior);
    expect(c.hotspots).toEqual({ latest: 910, prior: 459, months: ["03"], pct: 98 });
  });

  it("returns null percentages rather than dividing by zero", () => {
    const c = compareSeasons(season(2569, [m("202601")], { farmRai: 5 }), season(2568, [m("202501")], {}));
    expect(c.farmPct).toBeNull();
  });
});
