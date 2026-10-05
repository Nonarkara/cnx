import type { AirQualityResponse, CnxFiresResponse } from "../../types/cnx";
import type { DustboyResponse } from "./dustboy";
import type { FetchResult } from "./opensky";
import type { RiverGauge } from "./river-level";
import type { CnxTwinResponse } from "./twin";
import type { RainResponse } from "./rain";
import { currentRainSummary } from "./rain-core";

export type BriefLevel = "good" | "watch" | "alert" | "critical" | "unknown";
export interface ExecutiveMetric {
  id: "water" | "air" | "fire" | "mobility";
  titleTh: string;
  titleEn: string;
  value: string;
  unit: string;
  summaryTh: string;
  summaryEn: string;
  source: string;
  observedAt: string | null;
  state: "current" | "stale" | "unavailable";
  level: BriefLevel;
  actionTh: string;
  actionEn: string;
}
export interface ExecutiveDistrict {
  th: string;
  en: string;
  pm25: number;
  sensors: number;
  observedAt: string | null;
  level: BriefLevel;
}
export interface ExecutiveBrief {
  metrics: ExecutiveMetric[];
  districts: ExecutiveDistrict[];
  headlineTh: string;
  headlineEn: string;
  attentionCount: number;
  unknownCount: number;
  observedCount: number;
  measuredDistrictCount: number;
}
export interface ExecutiveBriefInput {
  air: AirQualityResponse | null;
  dustboy: DustboyResponse | null;
  fires: CnxFiresResponse | null;
  twin: CnxTwinResponse | null;
  riverGauges: RiverGauge[];
  flights: FetchResult | null;
  /** Measured 24-hour rainfall at gauges; optional so older callers still work. */
  rain?: RainResponse | null;
  now?: Date;
}

const HOUR = 3_600_000;
const rank: Record<BriefLevel, number> = { unknown: -1, good: 0, watch: 1, alert: 2, critical: 3 };
const districtNames: Record<string, string> = {
  แม่แจ่ม: "Mae Chaem", เชียงดาว: "Chiang Dao", ดอยเต่า: "Doi Tao", อมก๋อย: "Omkoi", ฮอด: "Hot",
  เวียงแหง: "Wiang Haeng", จอมทอง: "Chom Thong", พร้าว: "Phrao", กัลยาณิวัฒนา: "Galyani Vadhana",
  แม่ออน: "Mae On", แม่แตง: "Mae Taeng", ดอยสะเก็ด: "Doi Saket", แม่อาย: "Mae Ai", ไชยปราการ: "Chai Prakan",
  สะเมิง: "Samoeng", ฝาง: "Fang", แม่วาง: "Mae Wang", สันกำแพง: "San Kamphaeng", สันทราย: "San Sai",
  แม่ริม: "Mae Rim", ดอยหล่อ: "Doi Lo", หางดง: "Hang Dong", สันป่าตอง: "San Pa Tong", สารภี: "Saraphi",
  เมืองเชียงใหม่: "Mueang Chiang Mai",
};
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const pmValid = (n: unknown): n is number => finite(n) && n >= 0;
// Screening bands only. Instant sensor readings are not a 24-hour health assessment.
const airLevel = (n: number): BriefLevel => n <= 25 ? "good" : n <= 37.5 ? "watch" : n <= 75 ? "alert" : "critical";
const waterLevel = (bank: number | null, headroom: number | null): BriefLevel => {
  if (!finite(bank) && !finite(headroom)) return "unknown";
  const margin = Math.min(finite(bank) ? bank : Infinity, finite(headroom) ? headroom : Infinity);
  return margin <= 0 ? "critical" : margin <= 0.5 ? "alert" : margin <= 1 ? "watch" : "good";
};
const gaugeMargins = (g: RiverGauge) => ({
  bank: finite(g.bankLevelMsl) ? g.bankLevelMsl - g.levelMsl : g.belowBankM,
  headroom: finite(g.criticalLevelMsl) ? g.criticalLevelMsl - g.levelMsl : g.headroomM,
});
const average = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10;
const oldest = (times: string[]): string | null => times.slice().sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;

export function buildExecutiveBrief(input: ExecutiveBriefInput): ExecutiveBrief {
  const now = (input.now ?? new Date()).getTime();
  const current = (stamp: string | number, maxAge = 3 * HOUR) => {
    const t = typeof stamp === "number" ? stamp : Date.parse(stamp);
    return finite(t) && now - t >= -300_000 && now - t <= maxAge;
  };
  const validPast = (stamp: string) => finite(Date.parse(stamp)) && now - Date.parse(stamp) >= -300_000;
  const blank = (id: ExecutiveMetric["id"], titleTh: string, titleEn: string, source: string): ExecutiveMetric => ({
    id, titleTh, titleEn, value: "—", unit: "", summaryTh: "ยังไม่มีข้อมูลปัจจุบันที่ยืนยันได้",
    summaryEn: "No verified current reading", source, observedAt: null, state: "unavailable", level: "unknown",
    actionTh: "ตรวจสอบข้อมูลล่าสุดและประกาศทางการก่อนตัดสินใจ", actionEn: "Verify current evidence and official notices before deciding",
  });
  const stale = (metric: ExecutiveMetric, stamps: string[]) => {
    const historical = stamps.filter(t => validPast(t) && !current(t));
    if (historical.length) {
      metric.state = "stale";
      metric.observedAt = historical.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
      metric.summaryTh = "ข้อมูลล่าสุดเก่าเกินช่วงที่ใช้ประเมินปัจจุบัน";
      metric.summaryEn = "Latest evidence is too old for a current assessment";
    }
  };

  const stations = input.dustboy?.provenance === "live" ? input.dustboy.stations.filter(s =>
    s.province === "เชียงใหม่" && !s.suspect && pmValid(s.pm25) && current(s.observedAt)) : [];
  const groups = new Map<string, typeof stations>();
  for (const station of stations) {
    let name = station.district.normalize("NFC").replace(/([่-๋])\1+/g, "$1").replace(/^อ\./, "").trim();
    if (name === "เมือง") name = "เมืองเชียงใหม่";
    if (!name) continue;
    groups.set(name, [...(groups.get(name) ?? []), station]);
  }
  const districts: ExecutiveDistrict[] = [...groups].map(([th, rows]) => {
    const pm25 = average(rows.map(s => s.pm25 as number));
    return { th, en: districtNames[th] ?? th, pm25, sensors: rows.length, observedAt: oldest(rows.map(s => s.observedAt)), level: airLevel(pm25) };
  }).sort((a, b) => b.pm25 - a.pm25 || a.th.localeCompare(b.th));

  const air = blank("air", "อากาศ", "Air", "PCD / CMU DustBoy ground sensors");
  const ground = input.air?.stations.filter(s => s.source === "pcd" && pmValid(s.pm25) && current(s.observedAt)) ?? [];
  const airRows = ground.length ? ground : stations;
  if (airRows.length) {
    const value = average(airRows.map(s => s.pm25 as number));
    air.value = String(value); air.unit = "µg/m³"; air.state = "current";
    air.level = airLevel(value); air.source = ground.length ? "PCD ground stations" : "CMU DustBoy ground sensors";
    air.observedAt = oldest(airRows.map(s => s.observedAt));
    if (districts[0] && rank[districts[0].level] > rank[air.level]) air.level = districts[0].level;
    air.summaryTh = `ค่าเฉลี่ยจาก ${airRows.length} จุดที่รายงานล่าสุด · คัดกรองเบื้องต้น ไม่ใช่ผลสุขภาพเฉลี่ย 24 ชม.`;
    air.summaryEn = `Mean of ${airRows.length} current ground readings; screening only, not a 24-hour health assessment`;
    if (districts[0]) {
      air.summaryTh += ` · สูงสุดในอำเภอที่วัด ${districts[0].th} ${districts[0].pm25}`;
      air.summaryEn += `; highest measured district ${districts[0].en} ${districts[0].pm25} µg/m³`;
    }
    air.actionTh = air.level === "good" ? "ติดตามค่าจากสถานีและประกาศทางการต่อเนื่อง" : "ตรวจสอบอำเภอที่ค่าฝุ่นสูงและประกาศทางการล่าสุด";
    air.actionEn = air.level === "good" ? "Continue monitoring stations and official notices" : "Check elevated districts and the latest official notices";
  } else {
    stale(air, [ ...(input.air?.stations.filter(s => s.source === "pcd" && pmValid(s.pm25)).map(s => s.observedAt) ?? []),
      ...(input.dustboy?.provenance === "live" ? input.dustboy.stations.filter(s => s.province === "เชียงใหม่" && !s.suspect).map(s => s.observedAt) : []) ]);
  }

  const water = blank("water", "ระดับน้ำ", "Water", "ThaiWater measured gauges");
  const ping = input.riverGauges.filter(g => (g.code === "P.1" || g.riverTh === "แม่น้ำปิง") && finite(g.levelMsl));
  const gauges = ping.filter(g => current(g.observedAt)).sort((a, b) => {
    const am = gaugeMargins(a), bm = gaugeMargins(b);
    return rank[waterLevel(bm.bank, bm.headroom)] - rank[waterLevel(am.bank, am.headroom)] || Number(b.code === "P.1") - Number(a.code === "P.1");
  });
  const g = gauges[0];
  const measured = input.twin?.deltas.flood.measured;
  const fallback = !g && measured?.provenance === "live" && finite(measured.level_msl) && current(measured.observed_at) ? measured : null;
  if (g || fallback) {
    const level = g ? g.levelMsl : fallback!.level_msl;
    const bank = g ? gaugeMargins(g).bank : fallback!.below_bank_m;
    const headroom = g ? gaugeMargins(g).headroom : fallback!.headroom_m;
    const name = g ? `${g.code ?? g.nameTh}` : fallback!.station_code ?? fallback!.station_name_th;
    water.state = "current";
    if (finite(bank)) {
      water.value = Math.abs(bank).toFixed(2);
      water.unit = bank < 0 ? "ม. เหนือตลิ่ง" : bank === 0 ? "ม. ถึงตลิ่ง" : "ม. ต่ำกว่าตลิ่ง";
    } else if (finite(headroom)) {
      water.value = Math.abs(headroom).toFixed(2);
      water.unit = headroom < 0 ? "ม. เกินเกณฑ์วิกฤต" : headroom === 0 ? "ม. ถึงเกณฑ์วิกฤต" : "ม. ก่อนเกณฑ์วิกฤต";
    } else {
      water.value = level.toFixed(2); water.unit = "ม. รทก. / MSL";
    }
    water.observedAt = g ? g.observedAt : fallback!.observed_at;
    water.source = g ? `ThaiWater · ${g.agency} · ${name}` : `ThaiWater · ${name}`;
    water.level = waterLevel(bank, headroom);
    const relationTh = finite(bank) ? bank < 0 ? `สูงกว่าตลิ่ง ${Math.abs(bank).toFixed(2)} ม.` : bank === 0 ? "ถึงระดับตลิ่ง" : `ต่ำกว่าตลิ่ง ${bank.toFixed(2)} ม.`
      : finite(headroom) ? `${headroom < 0 ? "เกิน" : headroom === 0 ? "ถึง" : "เหลือก่อนถึง"}เกณฑ์วิกฤตของสถานี ${Math.abs(headroom).toFixed(2)} ม. · ไม่มีระดับตลิ่ง`
        : "ไม่มีระดับตลิ่งหรือเกณฑ์วิกฤตสำหรับเปรียบเทียบ";
    const relationEn = finite(bank) ? bank < 0 ? `${Math.abs(bank).toFixed(2)} m above bank` : bank === 0 ? "at bank level" : `${bank.toFixed(2)} m below bank`
      : finite(headroom) ? `${Math.abs(headroom).toFixed(2)} m ${headroom < 0 ? "above" : headroom === 0 ? "at" : "below"} the station critical threshold; bank threshold unavailable`
        : "bank and critical thresholds unavailable";
    const criticalTh = finite(bank) && finite(headroom) && headroom <= 0 ? " · ถึง/เกินเกณฑ์วิกฤตของสถานี" : "";
    const criticalEn = finite(bank) && finite(headroom) && headroom <= 0 ? "; at/above the station critical threshold" : "";
    const referenceTh = g && finite(g.bankLevelMsl) ? ` · ตลิ่ง ${g.bankLevelMsl.toFixed(2)} ม. รทก.`
      : g && finite(g.criticalLevelMsl) ? ` · เกณฑ์วิกฤต ${g.criticalLevelMsl.toFixed(2)} ม. รทก.` : "";
    const referenceEn = g && finite(g.bankLevelMsl) ? `; bank reference ${g.bankLevelMsl.toFixed(2)} m MSL`
      : g && finite(g.criticalLevelMsl) ? `; critical reference ${g.criticalLevelMsl.toFixed(2)} m MSL` : "";
    water.summaryTh = `${name}: ${relationTh}${criticalTh} · ระดับน้ำ ${level.toFixed(2)} ม. รทก.${referenceTh} · ไม่ครอบคลุมทั้งจังหวัด`;
    water.summaryEn = `${name}: ${relationEn}${criticalEn}; measured level ${level.toFixed(2)} m MSL${referenceEn}; does not establish province-wide conditions`;
    water.actionTh = water.level === "critical" || water.level === "alert" ? "ตรวจสอบพื้นที่รอบสถานีและประกาศทางการ พร้อมยืนยันผู้รับผิดชอบ" : "ติดตามสถานีและประกาศทางการ พร้อมตรวจสอบพื้นที่ที่ไม่มีข้อมูล";
    water.actionEn = water.level === "critical" || water.level === "alert" ? "Check locations around the gauge and official notices; confirm the duty contact" : "Monitor the gauge and official notices; check unmeasured areas";
  } else stale(water, [...ping.map(g => g.observedAt), ...(measured?.provenance === "live" ? [measured.observed_at] : [])]);

  // Measured rain. A river gauge sees a flood once it reaches the river;
  // flash floods in the hill districts start as very heavy rain on slopes
  // far from any gauge. Heavy rain raises the water tile — never lowers it.
  const rain = currentRainSummary(input.rain, now);
  const wet = rain?.districts[0];
  if (rain && wet) {
    const rainLevel: BriefLevel = wet.band === "very-heavy" ? "alert" : "watch";
    const places = rain.districts.slice(0, 3).map(d => `${d.th} ${d.max}`).join(" · ");
    const placesEn = rain.districts.slice(0, 3).map(d => `${d.en} ${d.max} mm`).join(", ");
    const heavyTh = `ฝนหนัก${wet.band === "very-heavy" ? "มาก" : ""} 24 ชม. วัดได้ที่ ${places} มม. (${rain.bands["very-heavy"] + rain.bands.heavy} สถานีทั่วจังหวัด) · วัด ${rain.wettest?.at} น.`;
    const heavyEn = `${wet.band === "very-heavy" ? "Very heavy" : "Heavy"} 24-hour rain measured: ${placesEn} (${rain.bands["very-heavy"] + rain.bands.heavy} gauges across the province); observed ${rain.wettest?.at} Bangkok time`;
    const rainLeads = water.state !== "current" || rank[rainLevel] > rank[water.level];
    if (water.state !== "current") {
      water.state = "current"; water.value = String(wet.max); water.unit = "มม. / 24 ชม. (สูงสุด)";
      water.observedAt = rain.wettest?.observedAt ?? null; water.source = "ThaiWater rain gauges";
      water.summaryTh = heavyTh; water.summaryEn = heavyEn;
    } else {
      water.summaryTh = `${water.summaryTh} · ${heavyTh}`;
      water.summaryEn = `${water.summaryEn}; ${heavyEn}`;
      water.source = `${water.source} · ThaiWater rain gauges`;
    }
    if (rank[rainLevel] > rank[water.level]) {
      water.level = rainLevel;
      water.actionTh = `เฝ้าระวังน้ำป่า/ดินถล่มในพื้นที่ลาดชันของ อ.${wet.th} และลำห้วยท้ายน้ำ · ตรวจสอบประกาศทางการ`;
      water.actionEn = `Watch for flash floods and landslides on slopes in ${wet.en} and downstream streams; check official notices`;
    }
    if (rainLeads) {
      water.titleTh = "ฝน/น้ำ"; water.titleEn = "Rain / Water";
      water.value = String(wet.max); water.unit = "มม. / 24 ชม. (สูงสุด)";
      water.observedAt = rain.wettest?.observedAt ?? null;
      water.source = "ThaiWater rain gauges";
    }
  }

  const fire = blank("fire", "จุดความร้อน", "Hotspots", "NASA FIRMS · rolling 24-hour satellite detections");
  const fires = input.fires;
  if (fires?.provenance === "live" && finite(fires.totalCount) && fires.totalCount >= 0 && current(fires.generatedAt)) {
    // Lead with the provincial count; the query box also spans neighbouring
    // provinces and the Myanmar border, which matter for smoke, not for
    // "fires in Chiang Mai".
    const inProvince = finite(fires.provinceCount) ? fires.provinceCount : fires.totalCount;
    const nearby = fires.totalCount - inProvince;
    fire.value = String(inProvince); fire.unit = "detections / 24h"; fire.state = "current";
    fire.level = inProvince > 0 ? "watch" : "good";
    fire.observedAt = fires.hotspots.map(h => h.detectedAt).filter(t => current(t, 24 * HOUR)).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
    fire.summaryTh = `ในเขตจังหวัดเชียงใหม่ · จุดที่ดาวเทียมตรวจพบใน 24 ชม. ไม่ใช่จำนวนไฟที่ยังลุกไหม้ · เมฆอาจบดบัง${nearby > 0 ? ` · นอกเขตจังหวัดใกล้เคียงอีก ${nearby} จุด` : ""}`;
    fire.summaryEn = `Inside Chiang Mai province; satellite detections in a rolling 24-hour window, not active-fire count; clouds can hide detections${nearby > 0 ? `; ${nearby} more just outside the province` : ""}`;
    fire.actionTh = inProvince ? "ตรวจสอบตำแหน่งจุดความร้อนกับหน่วยงานภาคสนาม" : "ติดตามรอบดาวเทียมและรายงานภาคสนามต่อเนื่อง";
    fire.actionEn = inProvince ? "Verify hotspot locations with field reports" : "Continue monitoring satellite passes and field reports";
  } else if (fires?.provenance === "live") {
    // generatedAt describes the window retrieval, not a satellite observation.
    if (validPast(fires.generatedAt) && !current(fires.generatedAt)) {
      fire.state = "stale"; fire.summaryTh = "สำเนาช่วงข้อมูลดาวเทียมเก่าแล้ว"; fire.summaryEn = "The retrieved satellite window is stale";
    }
  }

  const mobility = blank("mobility", "การบิน", "Aviation", input.flights?.source === "merged" ? "ADS-B · combined receiver networks" : input.flights?.source ?? "ADS-B aircraft observations");
  const flights = input.flights;
  if (flights && !flights.degraded && current(flights.observedAt, 600_000)) {
    mobility.value = String(flights.airborne.length + flights.ground.length); mobility.unit = "aircraft";
    mobility.state = "current"; mobility.level = "good"; mobility.observedAt = new Date(flights.observedAt).toISOString();
    mobility.summaryTh = `ในพื้นที่ติดตาม: บิน ${flights.airborne.length} · บนพื้น ${flights.ground.length} · ไม่ใช่จำนวนผู้โดยสารหรือเที่ยวบินขาเข้า`;
    mobility.summaryEn = `In the tracked area: ${flights.airborne.length} airborne, ${flights.ground.length} on ground; not passengers or confirmed arrivals`;
    mobility.actionTh = "ตรวจสอบตารางและประกาศสนามบินเมื่อวางแผนเดินทาง";
    mobility.actionEn = "Check airport schedules and notices when planning travel";
  } else if (flights && finite(flights.observedAt) && current(flights.observedAt, Number.MAX_SAFE_INTEGER) && !current(flights.observedAt, 600_000)) {
    mobility.state = "stale"; mobility.observedAt = new Date(flights.observedAt).toISOString();
    mobility.summaryTh = "ภาพรวมเครื่องบินเก่าแล้ว"; mobility.summaryEn = "Aircraft snapshot is stale";
  }

  const metrics = [water, air, fire, mobility];
  const attention = metrics.filter(m => m.state === "current" && rank[m.level] > 0).sort((a, b) => rank[b.level] - rank[a.level]);
  const unknownCount = metrics.filter(m => m.level === "unknown").length;
  const lead = attention[0];
  return {
    metrics, districts, attentionCount: attention.length, unknownCount,
    observedCount: metrics.filter(m => m.state === "current").length, measuredDistrictCount: districts.length,
    headlineTh: lead ? `${lead.titleTh}: ${lead.actionTh}` : unknownCount ? "ข้อมูลยังไม่ครบ · ตรวจสอบหลักฐานล่าสุดก่อนตัดสินใจ" : "ติดตามพื้นที่ที่วัดได้ต่อเนื่อง · ยังไม่ใช่การยืนยันว่าทั้งจังหวัดปลอดภัย",
    headlineEn: lead ? `${lead.titleEn}: ${lead.actionEn}` : unknownCount ? "Evidence gaps remain; verify current sources before deciding" : "Continue monitoring measured locations; this is not a province-wide all-clear",
  };
}
