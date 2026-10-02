// CNX verdict engine — bilingual "what should the governor do" layer
// on top of the live flood + air + fires responses.
//
// Mirrors the FloodDash / AirDash pattern from the sibling systems:
// every level (safe / watch / prepare / danger) carries a deliberate,
// auditable threshold and a bilingual headline + checklist the operator
// can act on. Honest by construction — every reason is generated from
// data we have, with `scenario` / `live` provenance so the wall can't
// quietly present a fabricated number as ground truth.
//
// Two unique CNX rules that other dashboards don't need:
//   1. **Mountain-basin PM2.5 trap** — Chiang Mai sits in a bowl. The
//      wind-direction-aware `danger_score` weights PM2.5 higher when
//      wind is calm/light (smoke doesn't disperse → stays in basin).
//   2. **Ping-basin cascade** — when upstream Bhumibol or Sirikit dam
//      releases rise, the Ping gauge ETA compresses. The verdict engine
//      reads the reservoir outflow, not just the gauge level, so a
//      dam-release flood is "prepare" before the gauge shows it.
//
// Cross-domain join (the FloodDash / AirDash "twins" pattern): when
// flood is prepare/danger AND air is prepare/danger, we surface the
// bilingual joint reason so the operator sees "the air is also
// hazardous if you must move" before they order an evacuation.

export type VerdictLevel = "safe" | "watch" | "prepare" | "danger";
export type VerdictBand = "normal" | "watch" | "elevated" | "high";

export interface VerdictReason {
  th: string;
  en: string;
  /** Domain the reason came from — lets the UI render a chip. */
  domain: "flood" | "air" | "fire" | "haze" | "twins";
  /** Optional structured data point behind the headline. */
  evidence?: string;
  /**
   * True when this reason describes what we could NOT measure, rather than
   * something we observed. Caveats are always rendered, even when a UI caps
   * the reason list — the whole point is that a wall which is too busy to
   * show "we cannot see the river" is exactly the wall that shouldn't say
   * nothing to do.
   */
  isCaveat?: boolean;
}

export interface ChecklistItem {
  th: string;
  en: string;
}

export interface VerdictCard {
  level: VerdictLevel;
  band: VerdictBand;
  /** 0–100 composite watch score. */
  score: number;
  /** Bilingual one-line verdict headline. */
  head_th: string;
  head_en: string;
  /** Top reason driving the verdict — bilingual. */
  reasons: VerdictReason[];
  /** Operational checklist for the operator running the municipality. */
  checklist: ChecklistItem[];
  /** Honest-data provenance for the headline — never silent about it. */
  data_provenance: "live" | "scenario" | "mixed";
  /** Time the verdict was computed. */
  computedAt: string;
}

/** Phone numbers the operator should call — not for the dashboard to act on. */
export const HOTLINES = {
  ddpm: "1784", // ปภ. — Department of Disaster Prevention and Mitigation
  pcd: "1650", // กรมควบคุมมลพิษ — Pollution Control Department (PM2.5)
  ddc: "1422", // กรมควบคุมโรค — Department of Disease Control (smoke health)
  ems: "1669", // สายด่วนแพทย์ฉุกเฉิน — Emergency Medical Services
  cn_province: "053-111-555", // สำนักงานจังหวัดเชียงใหม่ — Chiang Mai provincial hall
} as const;

export const ACTIONS_TH_EN: Record<VerdictLevel, { th: string; en: string }> = {
  safe: {
    th: "ไม่ต้องทำอะไตอนนี้ — เปิดลิงก์จังหวัดเชียกอีกครั้งพรุ่งนี้",
    en: "Nothing to do right now — check Chiang Mai again tomorrow",
  },
  watch: {
    th: "ติดตามฝนสะสมและระดับน้ำสถานีใกล้บ้านวันละ 2 ครั้ง — เตรียม N95 ไว้สำหรับช่วงเผาป่า",
    en: "Check rain and your nearest station levels twice a day — keep N95 ready for burn season",
  },
  prepare: {
    th: "ยกของมีค่าขึ้นที่สูง เตรียมของจำเป็น ติดตามประกาศ ปภ. 1784 และ อปท. ใกล้ชิด",
    en: "Move valuables up, prepare essentials, follow DDPM 1784 and municipality announcements closely",
  },
  danger: {
    th: "ปฏิบัติตามประกาศทางการทันที — ถ้าอยู่พื้นที่เสี่ยง เตรียมอพยพตามคำแนะนำ ปภ.",
    en: "Follow official instructions now — if in a risk zone, be ready to evacuate per DDPM guidance",
  },
};

export const CHECKLIST: Record<VerdictLevel, ChecklistItem[]> = {
  safe: [
    { th: "เดินตรวจท่อ/รางระบายน้ำจุดเสี่ยงก่อนฤดูฝน", en: "Walk drainage weak points before monsoon" },
    { th: "อัปเดตทะเบียนกลุ่มเปราะบาง (ผู้ป่วยติดเตียง ผู้สูงอายุ ผู้พิการ)", en: "Update vulnerable-residents registry" },
    { th: "ตรวจนับกระสอบทราย เครื่องสูบน้ำ เรือ — พร้อมใช้งาน", en: "Inventory sandbags, pumps, boats" },
    { th: "ทบทวนจุดอพยพสำรองในอำเภอรอบเมืองเชียงใหม่", en: "Reconfirm fallback evacuation points in surrounding districts" },
  ],
  watch: [
    { th: "มอบเวรติดตามบอร์ดนี้ทุก 3 ชม.", en: "Assign a duty officer to this board every 3h" },
    { th: "แจ้งกำนัน/ผู้ใหญ่บ้านโซนลุ่มต่ำให้เริ่มเฝ้าระวัง", en: "Alert village heads in low-lying zones to start watching" },
    { th: "ทดสอบเครื่องสูบน้ำ + แจ้ง ปภ. 1784 ให้ทราบสถานะ", en: "Test pumps; notify DDPM 1784 of current status" },
    { th: "โทรยืนยันผู้ดูแล + พาหนะของกลุ่มเปราะบางทุกราย", en: "Call to confirm carer + transport for every vulnerable resident" },
    { th: "เตรียม N95 ที่ศูนย์อำเภอ — ช่วงเผาป่าจะมาเร็ว", en: "Stage N95 masks at district offices — burn season is near" },
  ],
  prepare: [
    { th: "เปิดศูนย์บัญชาการเหตุการณ์ระดับ อปท. — คนเฝ้าตลอด 24 ชม.", en: "Open municipal incident command — staffed 24/7" },
    { th: "ย้ายผู้ป่วยติดเตียง/ผู้สูงอายุโซนลุ่มต่ำ ก่อน — ใช้เวลานานที่สุด", en: "Move immobile residents in low zones FIRST" },
    { th: "วางกระสอบทราย + เครื่องสูบน้ำที่จุดอ่อนที่รู้จัก (สันกลาง, สุเทพ, ช้างคลาน)", en: "Stage sandbags + pumps at known weak points" },
    { th: "ย้ายรถ เวชภัณฑ์ เอกสารสำคัญขึ้นที่สูง", en: "Move vehicles, medicine, key documents to high ground" },
    { th: "ประกาศเสียงตามสาย + LINE กลุ่มเมืองทุก 6 ชม.", en: "Broadcast via village PA + city LINE group every 6h" },
    { th: "แจก N95 ที่ศูนย์อำเภอ ถ้าค่า PM2.5 ตะวันตก ≥ 75 µg/m³", en: "Distribute N95 at district offices if west-PM2.5 ≥ 75 µg/m³" },
  ],
  danger: [
    { th: "อพยพตามคำสั่ง ปภ. — กลุ่มเปราะบางออกก่อนเสมอ", en: "Evacuate per DDPM orders — vulnerable residents first" },
    { th: "ตัดไฟฟ้าโซนน้ำถึงก่อนน้ำแตะแผงมิเตอร์", en: "Cut power in flooded zones before water reaches meters" },
    { th: "เปิดศูนย์พักพิง รายงานยอดผู้เข้าพักต่ออำเภอทุกรอบ", en: "Open shelters; report headcounts to the district each cycle" },
    { th: "ปิดทางลอด/จุดข้ามน้ำเชี่ยว ห้ามรถและคนผ่าน", en: "Close underpasses and fast-water crossings" },
    { th: "สายด่วน: ปภ. 1784 · แพทย์ฉุกเฉิน 1669 · สนง.จังหวัด 053-111-555", en: "Hotlines: DDPM 1784 · EMS 1669 · Provincial Hall 053-111-555" },
  ],
};

// ─── Threshold tables (deliberate, auditable) ───────────────────

/** Air points from a PM2.5 reading. Wind under 12 km/h applies the
 *  mountain-basin trap (×1.25) because smoke does not leave the valley. */
function airPoints(pm: number, windKmh: number | null): number {
  const windFactor = windKmh !== null && windKmh < 12 ? 1.25 : 1;
  const effectivePm = pm * windFactor;
  if (effectivePm >= 150) return 40;
  if (effectivePm >= 90) return 30;
  if (effectivePm >= 50) return 20;
  if (effectivePm >= 25) return 10;
  return 0;
}

function airReason(pm: number, windKmh: number | null): VerdictReason | null {
  const points = airPoints(pm, windKmh);
  if (points >= 40) {
    return {
      domain: "air",
      th: `PM2.5 อันตราย (${Math.round(pm)} µg/m³) — ห้ามออกนอกอาคาร แจก N95`,
      en: `PM2.5 hazardous (${Math.round(pm)} µg/m³) — stay indoors, distribute N95`,
      evidence: `pm25=${pm} wind=${windKmh ?? "?"}`,
    };
  }
  if (points >= 30) {
    return {
      domain: "air",
      th: `PM2.5 มีผลกระทบต่อสุขภาพ (${Math.round(pm)} µg/m³)`,
      en: `PM2.5 unhealthy (${Math.round(pm)} µg/m³)`,
      evidence: `pm25=${pm}`,
    };
  }
  if (points >= 20) {
    return {
      domain: "air",
      th: `PM2.5 เริ่มมีผล (${Math.round(pm)} µg/m³) — กลุ่มเปราะบางควรอยู่ในอาคาร`,
      en: `PM2.5 moderate (${Math.round(pm)} µg/m³) — vulnerable groups indoors`,
      evidence: `pm25=${pm}`,
    };
  }
  if (points >= 10) {
    return {
      domain: "air",
      th: `PM2.5 ปานกลาง (${Math.round(pm)} µg/m³)`,
      en: `PM2.5 moderate-low (${Math.round(pm)} µg/m³)`,
      evidence: `pm25=${pm}`,
    };
  }
  return null;
}
export function bandForScore(score: number): VerdictBand {
  if (score >= 75) return "high";
  if (score >= 50) return "elevated";
  if (score >= 25) return "watch";
  return "normal";
}

/** Verdict level — the "what should I do" verdict. */
export function levelForBand(band: VerdictBand): VerdictLevel {
  switch (band) {
    case "high":
      return "danger";
    case "elevated":
      return "prepare";
    case "watch":
      return "watch";
    default:
      return "safe";
  }
}

/** Inverse of levelForBand — used to keep a card coherent when the level
 *  is capped by a data-availability rule rather than by the score. */
export function bandForLevel(level: VerdictLevel): VerdictBand {
  switch (level) {
    case "danger":
      return "high";
    case "prepare":
      return "elevated";
    case "watch":
      return "watch";
    default:
      return "normal";
  }
}

// ─── Inputs the engine reads ─────────────────────────────────────

/**
 * A real gauge reading, projected from the ThaiWater feed by
 * `river-level.ts`. This is the one flood input on this board that is a
 * measurement of a river rather than a number we generated.
 */
export interface PingMeasured {
  /** Upstream station code, e.g. "P.1". */
  stationCode: string | null;
  /** Thai station name as published. */
  stationNameTh: string;
  /** Metres of headroom to the station's OWN published critical level,
   *  when it publishes one. Null means it does not — never a guess. */
  headroomM: number | null;
  /** Metres of headroom to the published bank level. */
  belowBankM: number | null;
  /** Reading height above mean sea level, metres. */
  levelMsl: number;
  /** How many gauges in the basin reported at the time of the read. */
  reportingCount: number;
  /** Observation time, ISO-8601 UTC. The reason text ages it. */
  observedAt: string;
}

/** A current gauge needs a usable observation time, not a fresh fetch time. */
export function isCurrentGaugeReading(observedAt: string, nowMs = Date.now()): boolean {
  const elapsed = nowMs - Date.parse(observedAt);
  return Number.isFinite(elapsed) && elapsed >= -5 * 60_000 && elapsed <= 3 * 3_600_000;
}

export interface VerdictInputs {
  /** Worst live PM2.5 µg/m³ in CNX province. null = no signal. */
  pm25_now: number | null;
  /** 24 h ahead CAMS forecast PM2.5. null = no signal. */
  pm25_fc_24h: number | null;
  /** Forecast 24 h rain total (mm). null = no signal. */
  rain_fc_24h_mm: number | null;
  /** Worst 24 h gauge rainfall now (mm). null = no signal. */
  rain_now_24h_mm: number | null;
  /** Worst gauge level / bank ratio across the Ping basin (0..1). */
  ping_capacity_ratio: number | null;
  /**
   * A MEASURED river reading, from a real gauge, when one is available.
   *
   * This is separate from `ping_capacity_ratio` on purpose. That ratio
   * comes from the flood module, which bundles gauges, rainfall and
   * reservoirs under one provenance flag — two of those three are still
   * hash-seeded scenario. Flipping that flag to "live" to accommodate a
   * real gauge would assert that the rainfall and reservoir numbers are
   * measured too, which they are not. So the measurement arrives on its
   * own field and speaks for itself, and the scenario module keeps its
   * scenario label where an operator can still see it.
   */
  ping_measured?: PingMeasured | null;
  /** Reservoir outflow surge flag (any northern dam ≥ 1.5x inflow). */
  reservoir_surge: boolean;
  /** FIRMS / RFD fire hotspots within CNX bbox in the last 24 h. */
  fire_count: number | null;
  /** Wind speed at city centre, km/h. null = no signal. */
  wind_kmh: number | null;
  /** Provenance: are these live or scenario numbers? */
  provenance: "live" | "scenario" | "mixed";
  /**
   * Provenance of the FLOOD inputs specifically. Required, not optional:
   * the scenario flood module is wired in by default, so any caller that
   * forgets this field would otherwise silently feed hash-seeded numbers
   * into the verdict. Making it required turns that mistake into a
   * compile error instead of a fabricated evacuation checklist.
   */
  flood_provenance: "live" | "scenario";
  /** Chiang Mai DustBoy average, µg/m³. Omit when the feed is not live. */
  dustboy_pm25?: number | null;
  /** Plumes whose 6 h endpoint falls inside the province bbox. */
  smoke_hits_cnx?: number | null;
  /** Plumes whose 6 h endpoint is within 50 km of the city centre. */
  smoke_near_cnx?: number | null;
  smoke_origin_th?: string | null;
  smoke_origin_en?: string | null;
}

const EMPTY_CARD: VerdictCard = {
  level: "safe",
  band: "normal",
  score: 0,
  head_th: ACTIONS_TH_EN.safe.th,
  head_en: ACTIONS_TH_EN.safe.en,
  reasons: [],
  checklist: CHECKLIST.safe,
  data_provenance: "scenario",
  computedAt: "",
};

/**
 * Build the verdict from the live / scenario inputs.
 *
 * The score is a weighted composite: flood (0–40), air (0–40), fire (0–20).
 * Reasons are pushed in priority order — first match wins the headline,
 * but ALL are kept so the operator can see "what pushed the score up".
 *
 * The cross-domain "twins" reason is appended last if both air and flood
 * are prepare/danger — that's the documented FloodDash ↔ AirDash join.
 */
export function computeVerdict(input: VerdictInputs): VerdictCard {
  const reasons: VerdictReason[] = [];

  // ─── Flood contribution (0–40) ─────────────────────────────
  //
  // A scenario flood is not a weak signal, it is NO signal. Three separate
  // things follow from that, and all three have to hold or the wall can
  // still end up telling a governor something the river never said:
  //   1. it must not raise the score;
  //   2. it must not produce a reason phrased as an observation — once
  //      "Ping river above normal (65%)" is a string in `reasons` it is
  //      indistinguishable from a measurement to every downstream reader;
  //   3. it must not certify "safe" (see the level cap below).
  //
  // What it *does* get to do is state its own absence, because a blank
  // flood axis is not evidence that the river is quiet.
  const floodIsScenario = input.flood_provenance !== "live";
  const measured = input.ping_measured ?? null;
  // A gauge that reported a level but published no bank geometry and no
  // threshold cannot be graded. Its presence unblinds nothing: the axis
  // is still unable to say where the water stands, which is the same
  // position as having no gauge at all.
  const measuredGraded =
    measured !== null && isCurrentGaugeReading(measured.observedAt) && (measured.headroomM !== null || measured.belowBankM !== null);
  // "Blind" covers both ways the flood axis can fail to speak, because
  // neither is evidence of a quiet river: a scenario fill, and a live feed
  // whose gauge reading simply did not come through tonight.
  //
  // A real, GRADED gauge reading is what makes this axis speak. It is
  // checked before the scenario flag, because a live gauge is a
  // measurement even when the rest of the flood module is still a
  // scenario fill — and the axis is not blind just because its
  // neighbours are.
  const floodBlind = !measuredGraded && (floodIsScenario || input.ping_capacity_ratio === null);

  let floodScore = 0;
  // A calm gauge reading, held back until every other domain has spoken.
  // See the append at the bottom of the flood section for why.
  let calmReading: VerdictReason | null = null;
  if (floodIsScenario && !measuredGraded) {
    // Deliberately no points and no observation. The caveat reason is
    // pushed LAST, after every measured domain, so that a real air or fire
    // hazard still owns the headline — a governor must never be led by
    // "we can't see the river" while the air is at 200 µg/m³.
  } else {
    // A real gauge, when there is one. This is the only flood reason on
    // this board that is allowed to be phrased as an observation, and it
    // ages its own observation time in the sentence rather than in a
    // field an operator might not read.
    //
    // A calm reading is held back in `calmReading` and appended at the
    // end of the function, after every other domain has spoken.
    if (measuredGraded) {
      const head = measured.headroomM;
      const bank = measured.belowBankM;
      const at = measured.stationCode ?? measured.stationNameTh;
      const stamp = new Date(measured.observedAt);
      const ageMin = Number.isFinite(stamp.getTime())
        ? Math.max(0, Math.round((Date.now() - stamp.getTime()) / 60_000))
        : null;
      const ageTxt =
        ageMin === null
          ? ""
          : ageMin < 60
            ? ` (observed ${ageMin} min ago)`
            : ageMin < 1440
              ? ` (observed ${Math.round(ageMin / 60)} h ago)`
              : ` (observed ${Math.round(ageMin / 1440)} d ago)`;

      if (head !== null && head <= 0) {
        floodScore = 40;
        reasons.push({
          domain: "flood",
          th: `สถานี ${at} วัดได้ถึงหรือเลยระดับวิกฤตที่ประกาศไว้ — ตรวจสอบน้ำท่วมในพื้นที่${ageTxt}`,
          en: `Gauge ${at} is at or above its published critical level — verify local inundation${ageTxt}`,
          evidence: `gauge_headroom=${head.toFixed(2)}m`,
        });
      } else if (bank !== null && bank <= 1) {
        floodScore = bank <= 0 ? 40 : 25;
        reasons.push({
          domain: "flood",
          th: `สถานี ${at} อยู่ห่างตลิ่ง ${Math.abs(bank).toFixed(2)} ม.${ageTxt}`,
          en: `Gauge ${at} is ${Math.abs(bank).toFixed(2)} m from its bank level${ageTxt}`,
          evidence: `gauge_below_bank=${bank.toFixed(2)}m`,
        });
      } else if (bank !== null) {
        // Comfortably below the bank. Stated as a measurement, and NOT
        // as a clearance: one gauge reading the river is below its bank
        // is not the same statement as "the river is safe", and the
        // cap below keeps it from certifying that on its own.
        calmReading = {
          domain: "flood",
          th: `สถานี ${at} ระดับน้ำต่ำกว่าตลิ่ง ${bank.toFixed(2)} ม.${ageTxt}`,
          en: `Gauge ${at} is ${bank.toFixed(2)} m below its bank level${ageTxt}`,
          evidence: `gauge_below_bank=${bank.toFixed(2)}m`,
        };
      }
    }
    // The scenario-flood signals below (bank ratio, dam surge, gauge
    // rainfall) all come from the flood module, which is still a
    // hash-seeded fill for rainfall and reservoirs. Reaching this block
    // via a live gauge must NOT let them speak: a measured river level
    // standing next to an invented dam release is exactly the mixture
    // this board refuses to publish. They require the module itself to
    // be live.
    if (floodIsScenario) {
      // measured gauge spoke above; the scenario numbers stay silent.
    } else if (input.ping_capacity_ratio !== null) {
      const r = input.ping_capacity_ratio;
      if (r >= 0.95) {
        floodScore = 40;
        reasons.push({
          domain: "flood",
          th: `แม่น้ำปิงล้นตลิ่ง (${Math.round(r * 100)}% ของความจุ) — น้ำท่วมขังริมฝั่ง`,
          en: `Ping river overflowing (${Math.round(r * 100)}% of bank capacity) — flooding riverbanks`,
          evidence: `ping_ratio=${r.toFixed(2)}`,
        });
      } else if (r >= 0.85) {
        floodScore = 30;
        reasons.push({
          domain: "flood",
          th: `แม่น้ำปิงใกล้ล้นตลิ่ง (${Math.round(r * 100)}%)`,
          en: `Ping river near bank (${Math.round(r * 100)}%)`,
          evidence: `ping_ratio=${r.toFixed(2)}`,
        });
      } else if (r >= 0.6) {
        floodScore = 15;
        reasons.push({
          domain: "flood",
          th: `แม่น้ำปิงสูงกว่าปกติ (${Math.round(r * 100)}%) — ติดตามทุก 3 ชม.`,
          en: `Ping river above normal (${Math.round(r * 100)}%) — watch every 3h`,
          evidence: `ping_ratio=${r.toFixed(2)}`,
        });
      }
    }
    if (!floodIsScenario && input.reservoir_surge) {
      // Independent signal: a dam release is not the same as a gauge reading,
      // so it stacks on top of the gauge contribution. The composite total
      // is still capped at 100 below.
      floodScore += 15;
      reasons.push({
        domain: "flood",
        th: "เขื่อนภูมิพล/สิริกิติ์ ระบายน้ำเพิ่ม — ระดับน้ำปิงจะสูงขึ้นภายใน 24 ชม.",
        en: "Bhumibol/Sirikit dam releasing extra water — Ping level will rise within 24h",
        evidence: "reservoir_surge=true",
      });
    }
    if (!floodIsScenario && input.rain_now_24h_mm !== null && input.rain_now_24h_mm >= 80) {
      floodScore += 10;
      reasons.push({
        domain: "flood",
        th: `ฝนตกหนักใน 24 ชม. ${Math.round(input.rain_now_24h_mm)} มม.`,
        en: `Heavy rain in last 24h: ${Math.round(input.rain_now_24h_mm)} mm`,
        evidence: `rain_24h=${input.rain_now_24h_mm}`,
      });
    }
  }

  // ─── Air contribution (0–40) — mountain-basin trap weighting ─
  let airScore = 0;
  if (input.pm25_now !== null) {
    airScore = airPoints(input.pm25_now, input.wind_kmh);
    const reason = airReason(input.pm25_now, input.wind_kmh);
    if (reason) reasons.push(reason);
  }

  // DustBoy is a denser ground network than the PCD average. It becomes
  // a reason once it is in the watch band, and it raises the air score
  // only when it is the sole PM reading or clearly worse than that average
  // — otherwise the same haze would be counted twice.
  if (typeof input.dustboy_pm25 === "number" && input.dustboy_pm25 >= 25) {
    const pm = input.dustboy_pm25;
    reasons.push({
      domain: "haze",
      th: `DustBoy เชียงใหม่เฉลี่ย ${Math.round(pm)} µg/m³ (เซ็นเซอร์พื้นดิน มช.)`,
      en: `DustBoy Chiang Mai average ${Math.round(pm)} µg/m³ (CMU ground sensors)`,
      evidence: `dustboy_pm25=${pm}`,
    });
    const model = input.pm25_now;
    if (model === null || pm >= model + 15) {
      airScore = Math.max(airScore, airPoints(pm, input.wind_kmh));
    }
  }

  const near = input.smoke_near_cnx;
  const hits = input.smoke_hits_cnx;
  if ((typeof near === "number" && near > 0) || (typeof hits === "number" && hits > 0)) {
    const originTh = input.smoke_origin_th || "รอบเชียงใหม่";
    const originEn = input.smoke_origin_en || "around Chiang Mai";
    reasons.push({
      domain: "haze",
      th: `ควัน ${near ?? 0} กลุ่มเข้าใกล้เมืองใน 6 ชม. (${hits ?? 0} กลุ่มเข้าจังหวัด) — มาจาก${originTh} แนวลมตรง ไม่ใช่พยากรณ์`,
      en: `${near ?? 0} plume(s) within 50 km at 6 h (${hits ?? 0} enter the province) — from ${originEn}. Straight-line advection, not a forecast`,
      evidence: `near=${near ?? 0} hits=${hits ?? 0}`,
    });
  }

  // ─── Fire contribution (0–20) — burning season watch ─────────
  let fireScore = 0;
  if (input.fire_count !== null) {
    if (input.fire_count >= 100) {
      fireScore = 20;
      reasons.push({
        domain: "fire",
        th: `จุดความร้อน VIIRS ${input.fire_count} จุดใน 24 ชม. — เผาป่าเข้มข้น`,
        en: `VIIRS hotspots ${input.fire_count} in 24h — intense agricultural burning`,
        evidence: `hotspots=${input.fire_count}`,
      });
    } else if (input.fire_count >= 30) {
      fireScore = 12;
      reasons.push({
        domain: "fire",
        th: `จุดความร้อน VIIRS ${input.fire_count} จุด — เผาป่ากำลังขยาย`,
        en: `VIIRS hotspots ${input.fire_count} — burning expanding`,
        evidence: `hotspots=${input.fire_count}`,
      });
    } else if (input.fire_count >= 10) {
      fireScore = 6;
      reasons.push({
        domain: "fire",
        th: `จุดความร้อน VIIRS ${input.fire_count} จุด`,
        en: `VIIRS hotspots ${input.fire_count}`,
        evidence: `hotspots=${input.fire_count}`,
      });
    }
  }

  // ─── Cross-domain "twins" join (FloodDash ↔ AirDash pattern) ──
  // Gated on a live flood feed: joining a scenario ratio against a real
  // PM2.5 would assert a coincidence between a hash seed and the sky.
  const floodDomain = !floodIsScenario && input.ping_capacity_ratio !== null && input.ping_capacity_ratio >= 0.85;
  const airDomain = input.pm25_now !== null && input.pm25_now >= 90;
  if (floodDomain && airDomain) {
    reasons.push({
      domain: "twins",
      th: "อากาศก็อันตรายเช่นกัน (PM2.5 สูง) — ถ้าต้องอพยพ ให้สวม N95 จำกัดเวลากลางแจ้ง",
      en: "the air is also hazardous (high PM2.5) — if you must move, wear N95 and limit outdoor time",
    });
  }
  const washoutHope =
    input.rain_fc_24h_mm !== null && input.rain_fc_24h_mm >= 15 && airScore >= 20;
  if (washoutHope && !floodDomain) {
    reasons.push({
      domain: "twins",
      th: `ฝนจะมา ${Math.round(input.rain_fc_24h_mm!)} มม. ใน 24 ชม. — อาจชะล้างฝุ่น PM2.5 ลง`,
      en: `rain coming ${Math.round(input.rain_fc_24h_mm!)} mm in 24h — may wash out PM2.5`,
      evidence: `rain_fc=${input.rain_fc_24h_mm}`,
    });
  }

  const score = Math.min(100, floodScore + airScore + fireScore);
  const scoredBand = bandForScore(score);
  const scoredLevel = levelForBand(scoredBand);

  // The calm gauge reading is appended LAST, once EVERY domain has had
  // its say — flood escalation, air, fire and the cross-domain joins.
  //
  // It was appended inside the flood block first, and that put a river
  // sitting comfortably below its bank at the TOP of the card, above a
  // measured PM2.5 of 155 µg/m³. The headline of a governor-grade card
  // is read first and often read alone, so an absence of flood trouble
  // must never occupy that slot when a measured hazard is present. The
  // reading is still shown; it is simply last.
  if (calmReading) reasons.push(calmReading);

  // Absence of a flood feed is not evidence of a quiet river. "safe" is
  // the dashboard telling an operator "nothing to do right now", and we
  // cannot say that about a domain we did not measure — that is the
  // omission half of the same error the GISTDA letter made. So a blind
  // flood axis may never certify safe, and may only certify as far as
  // "watch" on its own (guaranteed by floodScore = 0 for scenario flood).
  const airBlind = input.pm25_now === null && typeof input.dustboy_pm25 !== "number";
  const level = (floodBlind || airBlind) && scoredLevel === "safe" ? "watch" : scoredLevel;
  // Keep score/band/level coherent: never publish `score 0 · band normal ·
  // level watch`, which reads as a contradiction rather than a caveat.
  const band = level === scoredLevel ? scoredBand : bandForLevel(level);

  if (airBlind) {
    reasons.push({ domain: "air", th: "ไม่มีค่าฝุ่น PM2.5 ปัจจุบัน — ไม่ใช่หลักฐานว่าอากาศปลอดภัย", en: "No current PM2.5 reading — air quality is unverified, not safe", evidence: "pm25_now=null", isCaveat: true });
  }

  if (floodBlind) {
    // Last, so a real air or fire hazard keeps the headline.
    reasons.push({
      domain: "flood",
      th: measured && !isCurrentGaugeReading(measured.observedAt) ? "ค่าระดับน้ำล่าสุดเก่าหรือเวลาไม่ถูกต้อง — ยังยืนยันสภาพน้ำปัจจุบันไม่ได้" : "ยังไม่มีค่าระดับน้ำจากสถานีวัดจริง — ไม่ใช่หลักฐานว่าน้ำปลอดภัย ดูค่าที่สถานีวัดในพื้นที่",
      en: measured && !isCurrentGaugeReading(measured.observedAt) ? `Supplied river-gauge reading is not current (stale, future or undated; stamp ${measured.observedAt}) — current river conditions are unverified` : "No live river-gauge reading — this is not evidence the river is safe; read the station gauges in your area",
      evidence: floodIsScenario
        ? "flood_provenance=scenario"
        : "ping_capacity_ratio=null",
      isCaveat: true,
    });
  }

  // Pick the top reason (first non-empty) for the headline, fall back to
  // the level's action text.
  const top = reasons[0];
  const card: VerdictCard = {
    level,
    band,
    score,
    head_th: top ? top.th : ACTIONS_TH_EN[level].th,
    head_en: top ? top.en : ACTIONS_TH_EN[level].en,
    reasons,
    checklist: CHECKLIST[level],
    data_provenance: input.provenance,
    computedAt: new Date().toISOString(),
  };
  return card;
}

/** Convenience for tests + dry-runs: returns an empty safe card. */
export function emptyVerdictCard(now: string): VerdictCard {
  return { ...EMPTY_CARD, computedAt: now };
}
