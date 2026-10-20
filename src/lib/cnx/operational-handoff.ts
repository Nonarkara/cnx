// Reproducible handoff from existing observations; never a flood-routing model.
import type { RainSummary } from "./rain-core";
import type { RiverGauge } from "./river-level";
import type { SmokeTrajectoryResponse } from "./smoke-trajectory";
import { currentHazeEvidence } from "./haze-watch-state";
export interface OperationalHandoff {
  id: "water" | "air" | "geography";
  titleTh: string; titleEn: string; th: string; en: string;
  actionTh: string; actionEn: string;
  sourceUrl: string; sourceLabel: string;
}
const HOUR = 3_600_000;
const upstream = ["เชียงดาว", "แม่แตง", "เวียงแหง"];
const urban = ["เมืองเชียงใหม่", "สารภี", "หางดง"];
const when = (at: string) => new Date(at).toLocaleString("en-GB", { timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + " UTC+7";
export function buildOperationalHandoff({ now, rain, gauges = [], smoke }: {
  now: number; rain?: RainSummary | null; gauges?: RiverGauge[]; smoke?: SmokeTrajectoryResponse | null;
}): OperationalHandoff[] {
  const readings = (rain?.stations ?? []).filter(s => Number.isFinite(s.rain24h) && s.rain24h >= 0 && currentHazeEvidence(s.observedAt, now, 6 * HOUR));
  const wettest = (names: string[]) => readings.filter(s => names.includes(s.amphoeTh.replace(/^อ(?:ำเภอ|\.)\s*/, ""))).sort((a,b) => b.rain24h-a.rain24h)[0];
  const north = wettest(upstream), city = wettest(urban);
  const p1 = gauges.find(g => g.code?.replace(/[.\s]/g, "").toUpperCase() === "P1" && currentHazeEvidence(g.observedAt, now, 3 * HOUR));
  const headroom = p1 && typeof p1.headroomM === "number" && Number.isFinite(p1.headroomM) ? p1.headroomM : null;
  const riverEn = headroom === null ? "P.1 current threshold distance unknown" : `P.1 ${headroom === 0 ? "at" : `${Math.abs(headroom).toFixed(2)} m ${headroom > 0 ? "below" : "above"}`} official critical level (${when(p1!.observedAt)})`;
  const riverTh = headroom === null ? "ยังไม่ทราบระยะห่างเกณฑ์วิกฤต P.1 ปัจจุบัน" : `P.1 ${headroom === 0 ? "ถึงเกณฑ์วิกฤตทางการ" : `${headroom > 0 ? "ต่ำกว่า" : "สูงกว่า"}เกณฑ์วิกฤตทางการ ${Math.abs(headroom).toFixed(2)} ม.`} (${when(p1!.observedAt)})`;
  const currentSmoke = smoke?.provenance === "live" && currentHazeEvidence(smoke.generatedAt, now, HOUR);
  const methodEn = smoke?.method === "forecast-field" ? "850 hPa hourly wind model" : smoke?.method === "straight-line" ? "single surface-wind fallback" : "unconfirmed transport method";
  const methodTh = smoke?.method === "forecast-field" ? "ลมแบบจำลองรายชั่วโมง 850 hPa" : smoke?.method === "straight-line" ? "ลมผิวพื้นจุดเดียวแบบเส้นตรง" : "ยังไม่ยืนยันวิธีคำนวณลม";
  return [
    { id:"water", titleTh:"ต้นน้ำ → ตัวเมือง → ที่ลุ่มท้ายน้ำ", titleEn:"Upstream → city → downstream lowlands",
      th:`${riverTh} · ฝนต้นน้ำ${north ? `สูงสุด ${north.rain24h} มม./24 ชม. อ.${north.amphoeTh} (${when(north.observedAt)})` : "ยังไม่ทราบ"} · แนวเมือง–สารภี–หางดง${city ? `สูงสุด ${city.rain24h} มม./24 ชม. อ.${city.amphoeTh} (${when(city.observedAt)})` : "ยังไม่ทราบ"} เป็นจุดวัดแยกกัน ห้ามบวกเป็นมวลน้ำหรือเวลาเดินทาง`,
      en:`${riverEn}; ${north ? `upstream district gauge max ${north.rain24h} mm/24 h at ${north.amphoeTh} (${when(north.observedAt)})` : "upstream rain unknown"}; ${city ? `city–Saraphi–Hang Dong max ${city.rain24h} mm/24 h at ${city.amphoeTh} (${when(city.observedAt)})` : "urban rain unknown"}. Separate point accumulations; no summed water volume or arrival time.`,
      actionTh:"เทียบสถานีเหนือน้ำกับเมือง ติดต่อชลประทานเรื่องการระบายและแนวโน้ม พร้อมตรวจคอสะพาน/ทางระบายน้ำ ไม่ใช่การยืนยันว่าท่วมคืนนี้",
      actionEn:"Compare upstream and city stations; confirm releases and trends with RID and inspect crossings/drains. This does not establish flooding tonight.",
      sourceUrl:"https://www.rid.go.th/th/rid_news/28483", sourceLabel:"RID · Ping catchment context · 09 Aug 2026" },
    { id:"air", titleTh:"แนวควันข้ามแดนและช่องว่างข้อมูล", titleEn:"Regional smoke and coverage gaps",
      th:currentSmoke ? `${methodTh}: ${smoke!.summary.nearCnx} แนวควันที่จุดตัวอย่างรายชั่วโมงเข้าใกล้ตัวเมืองใน 50 กม. · ${smoke!.omittedTrajectories ?? 0} เส้นทางไม่ครบ 6 ชม. (${when(smoke!.generatedAt)}) ยังยืนยันประเทศต้นทางหรือว่าควันถึงพื้นไม่ได้`
        : "ยังยืนยันแนวควันปัจจุบันไม่ได้ ข้อมูลขาดไม่ใช่ไม่มีควัน และภาพกลางคืนไม่ยืนยันว่าอากาศใส",
      en:currentSmoke ? `${methodEn}: ${smoke!.summary.nearCnx} sampled modeled paths over 0–6 h within 50 km of the city; ${smoke!.omittedTrajectories ?? 0} incomplete six-hour paths (${when(smoke!.generatedAt)}). The source country is not established, nor is smoke arrival at ground level. Hourly samples can miss crossings between samples.`
        : "Current smoke transport unknown; missing coverage is not no smoke, and night imagery does not establish clear air.",
      actionTh:"เทียบจุดความร้อนในรัฐฉาน/ภูมิภาคกับลมระดับพาควันและ PM2.5 ภาคพื้น แยกข้อมูลไฟออกจากการยืนยันว่าเป็นการเผาเกษตร",
      actionEn:"Compare regional/Shan State hotspots, transport-level wind and ground PM2.5. A hotspot alone does not establish agricultural burning.",
      sourceUrl:"https://asmc.asean.org/asmc-haze-hotspot-daily/", sourceLabel:"ASEAN ASMC · regional hotspot review" },
    { id:"geography", titleTh:"พื้นที่ที่ต้องตรวจซ้ำจากประวัติน้ำท่วม", titleEn:"Repeat checks from flood history",
      th:"เหตุการณ์ปี 2024: น้ำล้นจากเมืองสะสมในที่ลุ่มสารภี ทั้งฝั่งชมภูและหนองแฝก–สันทราย เป็นบริบทประวัติศาสตร์ ไม่ใช่แผนที่น้ำท่วมปัจจุบัน หุบเขาร่วมกันไม่ได้ทำให้ความเสี่ยงน้ำและฝุ่นเหมือนกัน",
      en:"2024 history: city overflow accumulated in Saraphi lowlands, including Chom Phu and Nong Faek–San Sai. Historical context, not a current inundation map; a shared valley does not make flood and haze exposure identical.",
      actionTh:"ให้อำเภอยืนยันจุดท่วมซ้ำ ทางระบาย เครื่องสูบน้ำ และศูนย์พักพิงที่เปิดจริงก่อนส่งคนหรือสั่งปิดถนน",
      actionEn:"Ask district staff to verify repeat-flood locations, drains, pumps and actually open shelters before directing people or closing roads.",
      sourceUrl:"https://chiangmai.prd.go.th/th/content/category/detail/id/9/iid/328801", sourceLabel:"Chiang Mai PRD · historical report · 01 Oct 2024" },
  ];
}
