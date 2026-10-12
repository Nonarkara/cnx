// Strip personal phone numbers and personal email addresses from public
// listings. Official organisation landlines and organisational mailboxes
// (for example *.go.th) stay. Thai mobiles (06/08/09) are treated as
// personal handsets. Consumer mailbox domains are treated as personal.
//
// The match is a whole token. A decimal such as a UTM northing, a UUID,
// and a budget figure are not phone numbers.

const CONSUMER_EMAIL =
  /(?<![\w.+-])[A-Za-z0-9._%+-]+@(?:gmail\.com|googlemail\.com|hotmail\.com|outlook\.com|live\.com|yahoo\.com|yahoo\.co\.th|icloud\.com|msn\.com)(?![\w.-])/gi;

// 0[689]xxxxxxxx, with spaces or hyphens. Not the fractional part of a
// decimal, and not a slice of a UUID or other identifier.
const MOBILE_LOCAL =
  /(?<![\dA-Za-z])(?<!\d\.)0[689](?:[\s-]?\d){8}(?![\dA-Za-z])/g;

// +66 8xxxxxxxx (the trunk 0 is dropped).
const MOBILE_INTL =
  /(?<![\dA-Za-z])\+66[\s-]?[689](?:[\s-]?\d){8}(?![\dA-Za-z])/g;

/** @param {string} input */
export function redactPersonalContactText(input) {
  if (typeof input !== "string" || input === "") return input;
  let s = input.replace(CONSUMER_EMAIL, "").replace(MOBILE_LOCAL, "").replace(MOBILE_INTL, "");
  if (s === input) return input;
  // A label that only introduced a number we just removed.
  s = s.replace(/(?:โทรศัพท์|โทร)\s*[:：.]?\s*(?=(?:\s*[,;/|]|$))/g, "");
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/\s*[,;/|]\s*(?=[,;/|]|$)/g, "");
  s = s.replace(/^[\s,;/|]+|[\s,;/|]+$/g, "");
  s = s.replace(/\s+([,;/])/g, "$1");
  return s.trim();
}

/**
 * @param {{ org?: string, portalUrl?: string }} source
 * @returns {string}
 */
export function personalContactCredit(source = {}) {
  const cited = [source.org, source.portalUrl].filter((part) => typeof part === "string" && part.trim()).join(" — ");
  const credit = cited ? ` แหล่งที่มา: ${cited}` : "";
  return `ข้อมูลติดต่อส่วนบุคคล (เบอร์โทรศัพท์มือถือและอีเมลโดเมนส่วนตัว) ถูกนำออกจากข้อมูลที่เก็บในที่เก็บนี้แล้ว เบอร์โทรศัพท์ของหน่วยงานและอีเมลโดเมนหน่วยงานที่เป็นช่องทางติดต่อทางการยังคงไว้${credit}.`;
}

const CREDIT_MARK = "ข้อมูลติดต่อส่วนบุคคล (เบอร์โทรศัพท์มือถือและอีเมลโดเมนส่วนตัว) ถูกนำออก";

/** @param {string} notes @param {{ org?: string, portalUrl?: string }} source */
export function withPersonalContactCredit(notes, source) {
  const base = typeof notes === "string" ? notes.trim() : "";
  if (base.includes(CREDIT_MARK)) return base;
  const line = personalContactCredit(source);
  return base ? `${base} ${line}` : line;
}

/** Count personal tokens in a string. Does not return the tokens. */
export function countPersonalContacts(input) {
  if (typeof input !== "string" || input === "") return { mobiles: 0, emails: 0 };
  const emails = input.match(new RegExp(CONSUMER_EMAIL.source, "gi"))?.length ?? 0;
  const local = input.match(new RegExp(MOBILE_LOCAL.source, "g"))?.length ?? 0;
  const intl = input.match(new RegExp(MOBILE_INTL.source, "g"))?.length ?? 0;
  return { mobiles: local + intl, emails };
}
