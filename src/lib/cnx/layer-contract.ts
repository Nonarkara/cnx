// CNX layer contract — what a derived-water layer must declare before it
// is allowed anywhere near the map or the verdict engine.
//
// WHY THIS FILE EXISTS
//
// On 2026-09-28 a resident sent a formal letter to GISTDA after comparing
// the national flood map against his own house, standing in the water,
// photographed. His finding was TWO-SIDED, and that is the part that
// matters:
//
//   OMISSION  — communities genuinely underwater (his own house in
//               Bang Phan, the Bang Ban community outside the levee,
//               Hua Wiang in Sen) were absent from the map.
//   COMMISSION — vast areas of rice paddy were painted as flood when
//               they were not flooded by this event: standing water
//               (perennial irrigation), residual ponding, and ordinary
//               terrain water that is water all year.
//
// A flood layer that confuses "there is water here" with "this event
// flooded here" fails in BOTH directions at once, and the two errors
// compound: the operator sees a confidently wrong picture, and the
// standing water makes the true flood harder to find in the noise.
//
// His closing line is the engineering requirement:
//
//   "แผนที่น้ำท่วมของประเทศ ควรบอกให้เราเห็นพื้นที่ที่ประชาชนกำลังถูกน้ำท่วมจริง
//    ไม่ใช่เห็นน้ำเต็มทุ่ง แต่กลับมองไม่เห็นคนที่กำลังยืนอยู่ในน้ำ"
//   — the national flood map should show where people are actually
//     being flooded, not just where there is water, and miss nobody
//     who is standing in it.
//
// HE ALSO GOT THE EPISTEMICS RIGHT, which is why this is worth encoding:
//
//   "ข้อจำกัดของเครื่องมืออธิบายได้ว่าทำไมแผนที่จึงผิด
//    ไม่ได้ทำให้แผนที่ที่ผิด กลายเป็นถูก"
//   — a tool's limits explain why a map is wrong; they do not make the
//     wrong map right. So: if ground truth and classification disagree,
//     you go back to the classification. Both ways.
//
// THE RULE WE ARE ADOPTING
//
// A water layer that cannot name its own error direction does not ship.
// Specifically, every derived-water layer must declare:
//
//   1. what it actually measures (open water? water this event? depth?)
//   2. how it treats PERMANENT water — masked, or not (this is the
//      commission-error axis; it is the single most common defect)
//   3. which direction it is KNOWN to err in, if any
//   4. whether it has EVER been validated against ground truth here
//   5. what it must never be used to conclude
//
// Point 4 is the one we are worst at and the one the letter is really
// about. `validation: "none"` is a legitimate, shippable value — it just
// has to be *stated*, and it has to block the layer from driving the
// province verdict on its own.

/** How a layer treats water that is present in every season. */
export type PermanentWaterHandling =
  /** Permanently-water pixels are subtracted before the layer is shown. */
  | "masked"
  /** Not handled. Expect standing water to appear as flood (commission error). */
  | "unhandled"
  /** No permanent water in the area of application, so the question is moot. */
  | "not-applicable";

/** Has this layer ever been checked against someone standing in the water? */
export type ValidationStatus =
  | "none"
  | "cross-checked"
  | "ground-truthed";

/** Which way this layer is known to be wrong. */
export type ErrorDirection =
  /** Under-reports flooding. The dangerous direction: people get missed. */
  | "omission"
  /** Over-reports flooding. Creates false alarms and dilutes attention. */
  | "commission"
  /** Both are possible; direction not characterised. */
  | "unknown";

export interface LayerContract {
  id: string;
  /** Thai label, shown in the layer palette. */
  labelTh: string;
  labelEn: string;
  /** What the layer actually measures, in one honest sentence. */
  measures: { th: string; en: string };
  permanentWater: PermanentWaterHandling;
  /** The axis the commission error lives on, spelled out for the operator. */
  standingWaterRisk: { th: string; en: string } | null;
  errorDirection: ErrorDirection;
  validation: ValidationStatus;
  /** The hard boundary. What an operator must NOT conclude from this. */
  mustNotConclude: { th: string; en: string };
  /** Provenance of the data itself, independent of the classification. */
  source: string;
}

/** Human-readable honesty check used by the tests. */
export function contractGaps(c: LayerContract): string[] {
  const gaps: string[] = [];
  if (!c.measures.en.trim() || !c.measures.th.trim()) gaps.push("no `measures` statement");
  if (!c.mustNotConclude.en.trim() || !c.mustNotConclude.th.trim()) gaps.push("no `mustNotConclude` boundary");
  if (c.permanentWater === "unhandled") gaps.push("permanent water unhandled (commission-error axis)");
  if (c.validation === "none") gaps.push("never validated against ground truth");
  return gaps;
}

// ─── The registry ───────────────────────────────────────────────

/**
 * Every water-derived layer CNX can display. A layer that is not in this
 * registry must not be added to the map.
 */
export const LAYER_CONTRACTS: Record<string, LayerContract> = {
  // ── The Ping river gauge set. Instrument readings, not classification.
  "ping-gauges": {
    id: "ping-gauges",
    labelTh: "สถานีวัดน้ำลำปาง",
    labelEn: "Ping basin gauges",
    measures: {
      th: "ระดับน้ำที่สถานีวัดจริง (เมตร) เทียบกับระดับตลิ่ง",
      en: "Measured water level at gauging stations (metres) against bank height",
    },
    permanentWater: "not-applicable",
    standingWaterRisk: null,
    errorDirection: "unknown",
    validation: "none",
    mustNotConclude: {
      th: "ระดับน้ำที่สถานีไม่ได้บอกว่าน้ำท่วมถึงบ้านใคร — ต้องดูพื้นที่ที่อยู่ใกล้สถานีด้วย",
      en: "A station level does not tell you whose house is flooded — you need the area near the gauge too",
    },
    source: "ThaiWater / HII",
  },

  // ── GISTDA flood extent, when it is ever wired in.
  //
  // NOTE THE HONEST PART: we have never validated this against ground
  // truth in Chiang Mai, and we do not know whether GISTDA's upstream
  // pipeline masks permanent water. Until someone answers that question
  // the layer is allowed on the map with its caveat attached, but it is
  // NOT allowed to drive the province verdict on its own. That is the
  // rule the GISTDA letter argues for, applied to ourselves.
  "gistda-flood-extent": {
    id: "gistda-flood-extent",
    labelTh: "น้ำท่วมจากดาวเทียม (GISTDA)",
    labelEn: "Satellite flood extent (GISTDA)",
    measures: {
      th: "พื้นที่ที่จำแนกได้ว่าเป็นน้ำในช่วงเวลาที่ผลิต — ไม่ใช่ความลึกน้ำ และไม่ใช่ความเสียหาย",
      en: "Pixels classified as water over the product's period — not depth, and not damage",
    },
    permanentWater: "unhandled",
    standingWaterRisk: {
      th: "น้ำทำนา น้ำค้างทุ่ง และน้ำตามสภาพพื้นที่ อาจถูกนับรวมเป็นน้ำท่วม — ให้ถือเป็นขอบเขตสูงสุดของพื้นที่ที่อาจท่วม ไม่ใช่พื้นที่ที่ท่วมจริง",
      en: "Perennial irrigation, standing water and ordinary terrain water may be counted as flood — read this as the upper bound of possibly-affected area, not confirmed flood",
    },
    errorDirection: "unknown",
    validation: "none",
    mustNotConclude: {
      th: "ห้ามใช้ชี้ว่าพื้นที่ใดปลอดภัย — การที่ไม่ปรากฏในแผนที่ไม่ได้แปลว่าไม่ท่วม",
      en: "Never use this to declare an area safe — absence from the map is not evidence of no flooding",
    },
    source: "GISTDA Disaster Platform",
  },

  // ── The rainfall set. Measured, but only at points.
  "rainfall-stations": {
    id: "rainfall-stations",
    labelTh: "ฝนสะสม 24 ชม.",
    labelEn: "24-hour rainfall",
    measures: {
      th: "ปริมาณฝนสะสมที่ตำแหน่งสถานีวัด (มม.)",
      en: "Accumulated rainfall at the station location (mm)",
    },
    permanentWater: "not-applicable",
    standingWaterRisk: null,
    errorDirection: "omission",
    validation: "none",
    mustNotConclude: {
      th: "ฝนที่วัดได้ที่สถานีไม่ได้แปลว่าฝนตกเท่ากันทั้งลุ่มน้ำ",
      en: "Rain at a station is not rain across the whole basin",
    },
    source: "ThaiWater",
  },

  // ── Reservoirs. Measured, and the only reliable forward indicator.
  "reservoirs": {
    id: "reservoirs",
    labelTh: "เขื่อน",
    labelEn: "Reservoirs",
    measures: {
      th: "ปริมาณน้ำกักเก็บเทียบกับความจุ (เปอร์เซ็นต์)",
      en: "Stored volume as a share of capacity",
    },
    permanentWater: "not-applicable",
    standingWaterRisk: null,
    errorDirection: "unknown",
    validation: "cross-checked",
    mustNotConclude: {
      th: "เปอร์เซ็นต์ที่เก็บน้ำไม่ใช่น้ำที่ปล่อย — ดูอัตราการระบายด้วย",
      en: "Storage percentage is not discharge — read the outflow rate too",
    },
    source: "Royal Irrigation Department",
  },
};

export function getLayerContract(id: string): LayerContract | null {
  return LAYER_CONTRACTS[id] ?? null;
}

/**
 * The standing caveat, phrased once, for any layer whose
 * `permanentWater` handling is `unhandled`.
 */
export function standingWaterWarning(lang: "th" | "en" = "en"): string {
  return lang === "th"
    ? "ชั้นข้อมูลนี้อาจรวมน้ำที่มีอยู่ตลอดปี (น้ำทำนา น้ำค้างทุ่ง) เป็นน้ำท่วม — ใช้เป็นขอบเขตสูงสุด ไม่ใช่พื้นที่ที่ท่วมยืนยันแล้ว"
    : "This layer may count perennial water (irrigation, standing water) as flood — treat it as the upper bound of possibly-affected area, not confirmed flood";
}
