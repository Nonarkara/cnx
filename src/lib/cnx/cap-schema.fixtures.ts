// Test-only: a strict little XML reader for the board's own output, and the
// CAP 1.2 XSD sequences (element order, cardinality, enumerations, the
// dateTime pattern) as data, so cap.test.ts can check structure without a
// schema library. cap-1.2.test.xsd is the same schema for xmllint.

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e]);

/** Parses elements, attributes and text; throws on anything malformed (bare & or <, mismatched tags, two roots). */
export function parseXml(xml: string): XmlNode {
  const src = xml.replace(/^<\?xml[^?]*\?>\s*/, "");
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  const token = /<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|([^<]+)/gy;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = token.exec(src)) !== null) {
    consumed = token.lastIndex;
    const [, close, open, attrText, selfClose, text] = m;
    if (text !== undefined) {
      if (/&(?!(amp|lt|gt|quot|apos);)/.test(text)) throw new Error(`bare & in text: ${text.slice(0, 40)}`);
      if (stack.length) stack[stack.length - 1].text += unescape(text);
      else if (text.trim()) throw new Error("text outside the root element");
      continue;
    }
    if (close) {
      const top = stack.pop();
      if (!top || top.name !== close) throw new Error(`mismatched </${close}>`);
      if (!stack.length) root = top;
      continue;
    }
    if (root) throw new Error("second root element");
    const attrs: Record<string, string> = {};
    for (const a of attrText.matchAll(/([\w:.-]+)="([^"]*)"/g)) attrs[a[1]] = unescape(a[2]);
    const node: XmlNode = { name: open, attrs, children: [], text: "" };
    if (stack.length) stack[stack.length - 1].children.push(node);
    if (selfClose) {
      if (!stack.length) root = node;
    } else stack.push(node);
  }
  if (consumed !== src.length) throw new Error(`unparsed input at ${consumed}: ${src.slice(consumed, consumed + 40)}`);
  if (stack.length || !root) throw new Error("unclosed element");
  return root;
}

interface Particle {
  name: string;
  min: 0 | 1;
  max: 1 | "n";
  enum?: readonly string[];
  dateTime?: boolean;
  children?: readonly Particle[];
}

const one = (name: string, extra: Partial<Particle> = {}): Particle => ({ name, min: 1, max: 1, ...extra });
const opt = (name: string, extra: Partial<Particle> = {}): Particle => ({ name, min: 0, max: 1, ...extra });
const many = (name: string, min: 0 | 1, extra: Partial<Particle> = {}): Particle => ({ name, min, max: "n", ...extra });
const VALUE_PAIR = [one("valueName"), one("value")];

/** CAP 1.2 XSD, alert → info → area/resource, in sequence order. */
export const CAP_ALERT_SEQUENCE: readonly Particle[] = [
  one("identifier"), one("sender"), one("sent", { dateTime: true }),
  one("status", { enum: ["Actual", "Exercise", "System", "Test", "Draft"] }),
  one("msgType", { enum: ["Alert", "Update", "Cancel", "Ack", "Error"] }),
  opt("source"),
  one("scope", { enum: ["Public", "Restricted", "Private"] }),
  opt("restriction"), opt("addresses"), many("code", 0), opt("note"), opt("references"), opt("incidents"),
  many("info", 0, {
    children: [
      opt("language"),
      many("category", 1, { enum: ["Geo", "Met", "Safety", "Security", "Rescue", "Fire", "Health", "Env", "Transport", "Infra", "CBRNE", "Other"] }),
      one("event"),
      many("responseType", 0, { enum: ["Shelter", "Evacuate", "Prepare", "Execute", "Avoid", "Monitor", "Assess", "AllClear", "None"] }),
      one("urgency", { enum: ["Immediate", "Expected", "Future", "Past", "Unknown"] }),
      one("severity", { enum: ["Extreme", "Severe", "Moderate", "Minor", "Unknown"] }),
      one("certainty", { enum: ["Observed", "Likely", "Possible", "Unlikely", "Unknown"] }),
      opt("audience"), many("eventCode", 0, { children: VALUE_PAIR }),
      opt("effective", { dateTime: true }), opt("onset", { dateTime: true }), opt("expires", { dateTime: true }),
      opt("senderName"), opt("headline"), opt("description"), opt("instruction"), opt("web"), opt("contact"),
      many("parameter", 0, { children: VALUE_PAIR }),
      many("resource", 0, { children: [one("resourceDesc"), one("mimeType"), opt("size"), opt("uri"), opt("derefUri"), opt("digest")] }),
      many("area", 0, {
        children: [one("areaDesc"), many("polygon", 0), many("circle", 0), many("geocode", 0, { children: VALUE_PAIR }), opt("altitude"), opt("ceiling")],
      }),
    ],
  }),
];

const CAP_DATETIME = /^\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d[-+]\d\d:\d\d$/;

/** Problems with `nodes` against an XSD sequence; [] when it conforms. */
export function checkSequence(nodes: readonly XmlNode[], sequence: readonly Particle[], path: string): string[] {
  const problems: string[] = [];
  let i = 0;
  for (const p of sequence) {
    let count = 0;
    while (i < nodes.length && nodes[i].name === p.name && (p.max === "n" || count < 1)) {
      const n = nodes[i];
      const at = `${path}/${p.name}`;
      if (p.enum && !p.enum.includes(n.text)) problems.push(`${at}: "${n.text}" not in enumeration`);
      if (p.dateTime && !CAP_DATETIME.test(n.text)) problems.push(`${at}: "${n.text}" is not a CAP dateTime`);
      if (p.children) problems.push(...checkSequence(n.children, p.children, at));
      else if (n.children.length) problems.push(`${at}: unexpected child elements`);
      count += 1;
      i += 1;
    }
    if (count < p.min) problems.push(`${path}: missing required <${p.name}>`);
  }
  if (i < nodes.length) problems.push(`${path}: <${nodes[i].name}> is out of sequence or not allowed`);
  return problems;
}

export function checkCapAlert(alert: XmlNode): string[] {
  const problems = alert.name === "alert" ? [] : [`root is <${alert.name}>, not <alert>`];
  if (alert.attrs.xmlns !== "urn:oasis:names:tc:emergency:cap:1.2") problems.push("alert is not in the CAP 1.2 namespace");
  return [...problems, ...checkSequence(alert.children, CAP_ALERT_SEQUENCE, "alert")];
}

export const child = (n: XmlNode, name: string): XmlNode | undefined => n.children.find((c) => c.name === name);
export const children = (n: XmlNode, name: string): XmlNode[] => n.children.filter((c) => c.name === name);
