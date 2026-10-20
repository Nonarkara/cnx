import { expect, it } from "vitest";
import { buildOperationalHandoff } from "./operational-handoff";
import type { RiverGauge } from "./river-level";
import type { RainSummary } from "./rain-core";
import type { SmokeTrajectoryResponse } from "./smoke-trajectory";
const now = Date.parse("2026-10-20T14:00:00Z");
const stamp = (hours: number) => new Date(now - hours * 3600000).toISOString();
const gauge = { code: "P.1", observedAt: stamp(1), headroomM: 2.55, belowBankM: 2.55 } as RiverGauge;
it("does not turn an expired P.1 into a current river reassurance", () => {
 const fresh = buildOperationalHandoff({ now, gauges: [gauge] });
 expect(fresh[0].en).toContain("2.55 m below");
 const old = buildOperationalHandoff({ now, gauges: [{...gauge, observedAt: stamp(4)}] });
 expect(old[0].en).not.toContain("2.55"); expect(old[0].en).toContain("unknown");
 expect(old[0].en).toContain("arrival time");
});
it("keeps zero upstream rain distinct from missing coverage and never adds rain totals", () => {
 const rain = { stations: [{ amphoeTh: "เชียงดาว", rain24h: 0, observedAt: stamp(1) }, { amphoeTh: "สารภี", rain24h:22, observedAt:stamp(1) }] } as RainSummary;
 const row = buildOperationalHandoff({now, rain})[0];
 expect(row.en).toContain("0 mm/24 h");expect(row.en).toContain("22 mm/24 h");
 expect(row.en).not.toContain("22 mm incoming");
 const old = buildOperationalHandoff({now, rain:{...rain,stations:rain.stations.map(s=>({...s,observedAt:stamp(7)}))}})[0];
 expect(old.en).toContain("upstream rain unknown");
});
it("does not infer Myanmar attribution or no-smoke from incomplete regional paths", () => {
 const smoke = { provenance:"live", generatedAt:stamp(0), method:"forecast-field", omittedTrajectories:6, summary:{nearCnx:1,hitsCnx:0,total:85} } as SmokeTrajectoryResponse;
 const row=buildOperationalHandoff({now,smoke})[1];
 expect(row.en).toContain("6 incomplete"); expect(row.en).toContain("source country is not established");
 expect(row.en).toContain("850 hPa");
 const old=buildOperationalHandoff({now,smoke:{...smoke,generatedAt:stamp(2)}})[1];
 expect(old.en).not.toContain("85");expect(old.en).toContain("unknown");
});
it("keeps historical geography dated and separate from a forecast",()=>{
 const rows=buildOperationalHandoff({now});
 expect(rows[2].en).toContain("2024");expect(rows[2].en).toContain("not a current inundation");
 expect(rows.every(r=>r.sourceUrl.startsWith("https://"))).toBe(true);
});
