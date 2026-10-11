import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { boardWarnings, VERDICT_KEY, type BoardWarning } from "./board-warnings";
import { CAP_RESTRICTION, capAlertDocument, capAtom, capDateTime, capIdentifier, capListDocument, capMessages, isCapIdentifier, xmlEscape } from "./cap";
import { checkCapAlert, child, children, parseXml, type XmlNode } from "./cap-schema.fixtures";
import { buildOutlook } from "./outlook";
import type { Shelter } from "./shelters";
import type { VerdictCard } from "./verdict";
import { diffWarnings, type WarningSnapshot } from "./warning-log-core";
import type { ForecastFieldResponse } from "./wind-field";
import type { DistrictOutlook } from "./wind-field-core";

const NOW = Date.parse("2026-10-11T05:20:00Z");
const PEAK = Date.parse("2026-10-11T14:00:00Z") / 1000;
const WEB = "https://cnx.example/";

const d = (nameTh: string, nameEn: string, over: Partial<DistrictOutlook> = {}): DistrictOutlook => ({
  nameTh, nameEn, rain6h: 0, rain24h: 0, rain48h: 0, peakRainMmH: 0, peakRainAt: null, pm25Peak: 10, pm25PeakAt: PEAK, ...over,
});

const forecast = (outlook: DistrictOutlook[]): ForecastFieldResponse => ({
  generatedAt: "2026-10-11T05:00:00Z", fetchedAt: "2026-10-11T04:40:00Z", provenance: "model", source: "test", note: "",
  field: { grid: { lon0: 98, lat0: 18, d: 1, nx: 2, ny: 2 }, times: [1], u10: [], v10: [], u850: [], v850: [], precip: [], pm25: [] },
  outlook,
});

const shelter: Shelter = {
  id: "s1", nameTh: "โรงเรียนแม่แจ่ม", amphoeTh: "แม่แจ่ม", tambonTh: null, capacity: 300, electricity: true, water: true, toilets: 4,
  lat: 18.5, lon: 98.3, precision: "place", matchedName: null, osm: null,
};

const verdict = (over: Partial<VerdictCard> = {}): VerdictCard => ({
  level: "danger", band: "high", score: 82, head_th: "แม่น้ำปิงใกล้ตลิ่ง", head_en: "The Ping is near its bank", checklist: [],
  reasons: [
    { th: "ข้อมูลฝุ่นขาด", en: "PM2.5 sensors offline", domain: "air", isCaveat: true },
    { th: "ปิง P.1 ต่ำกว่าตลิ่ง 0.3 ม.", en: "Ping P.1 0.3 m below bank", domain: "flood" },
  ],
  data_provenance: "live", computedAt: "2026-10-11T05:19:00Z", ...over,
});

const outlook = buildOutlook(
  forecast([
    d("แม่แจ่ม", "Mae Chaem", { rain24h: 96.4, peakRainAt: PEAK }),
    d("สารภี", "Saraphi", { pm25Peak: 61, pm25PeakAt: PEAK }),
    d("ฝาง", "Fang", { rain24h: 5 }),
  ]),
  [shelter],
  null,
);

async function build(prev: WarningSnapshot | null, v: VerdictCard | null = verdict(), at = NOW) {
  const warnings = boardWarnings(outlook, v);
  const { next } = diffWarnings(prev, {
    verdict: v ? { level: v.level, score: v.score, reasonEn: null, provenance: v.data_provenance } : undefined,
    outlook: { domains: ["rain", "pm25"], items: warnings.filter((w) => w.domain !== "verdict").map((w) => ({ key: w.key, domain: w.domain as "rain" | "pm25", district: w.district, level: w.level, peakAt: w.peakAt, value: w.value, reasonEn: w.reasonEn })) },
  }, new Date(at).toISOString(), "abc1234");
  return { warnings, next, messages: await capMessages(warnings, next, at) };
}

const leaf = (n: XmlNode, name: string) => child(n, name)?.text;

describe("board warnings", () => {
  it("exports outlook items ≥ watch and the verdict only at prepare or danger, never a scenario", () => {
    expect(boardWarnings(outlook, verdict()).map((w) => w.key)).toEqual([VERDICT_KEY, "cnx-rain-mae-chaem", "cnx-pm25-saraphi"]);
    expect(boardWarnings(outlook, verdict({ level: "watch" })).map((w) => w.key)).not.toContain(VERDICT_KEY);
    expect(boardWarnings(outlook, verdict({ data_provenance: "scenario" })).map((w) => w.key)).not.toContain(VERDICT_KEY);
  });

  it("names the district's shelter and the general action in the instruction", () => {
    const rain = boardWarnings(outlook, null).find((w) => w.domain === "rain") as BoardWarning;
    expect(rain.level).toBe("alert");
    expect(rain.instructionTh).toContain("โรงเรียนแม่แจ่ม");
    expect(rain.instructionEn).toContain("follow DDPM 1784");
  });
});

describe("CAP 1.2 alert", () => {
  it("conforms to the CAP 1.2 XSD sequence, cardinality and enumerations for every alert", async () => {
    const { messages } = await build(null);
    expect(messages).toHaveLength(3);
    for (const m of messages) expect(checkCapAlert(parseXml(capAlertDocument(m, WEB)))).toEqual([]);
  });

  it("is Restricted, from the board's sender, with the exact restriction text and TH + EN info blocks", async () => {
    const { messages } = await build(null);
    const alert = parseXml(capAlertDocument(messages[1], WEB));
    expect(leaf(alert, "sender")).toBe("cap@cnx.nonarkara.org");
    expect(leaf(alert, "status")).toBe("Actual");
    expect(leaf(alert, "scope")).toBe("Restricted");
    expect(leaf(alert, "restriction")).toBe("Decision support for Chiang Mai Provincial Office. Not an official public warning; official sources: TMD, DDPM.");
    expect(children(alert, "info").map((i) => leaf(i, "language"))).toEqual(["th-TH", "en-US"]);
  });

  it("maps a forecast very-heavy-rain item to Met / Expected / Moderate / Possible / Prepare with a 10 km district circle and TH-50", async () => {
    const { messages } = await build(null);
    const info = children(parseXml(capAlertDocument(messages[1], WEB)), "info")[1];
    expect([leaf(info, "category"), leaf(info, "urgency"), leaf(info, "severity"), leaf(info, "certainty"), leaf(info, "responseType")])
      .toEqual(["Met", "Expected", "Moderate", "Possible", "Prepare"]);
    expect(leaf(info, "event")).toBe("Forecast very heavy rain");
    expect(leaf(info, "onset")).toBe("2026-10-11T21:00:00+07:00");
    expect(leaf(info, "effective")).toBe("2026-10-11T12:20:00+07:00");
    expect(leaf(info, "expires")).toBe("2026-10-12T12:00:00+07:00");
    const area = child(info, "area") as XmlNode;
    expect(leaf(area, "areaDesc")).toBe("Mae Chaem District, Chiang Mai");
    expect(leaf(area, "circle")).toBe("18.57394,98.31687 10");
    const geocode = child(area, "geocode") as XmlNode;
    expect([leaf(geocode, "valueName"), leaf(geocode, "value")]).toEqual(["ISO3166-2", "TH-50"]);
  });

  it("maps forecast PM2.5 alert to Env / Moderate and a measured danger verdict to Immediate / Severe / Observed, province-wide", async () => {
    const { messages } = await build(null);
    const pm = children(parseXml(capAlertDocument(messages[2], WEB)), "info")[1];
    expect([leaf(pm, "category"), leaf(pm, "severity"), leaf(pm, "urgency")]).toEqual(["Env", "Moderate", "Expected"]);
    const v = children(parseXml(capAlertDocument(messages[0], WEB)), "info")[1];
    expect([leaf(v, "category"), leaf(v, "urgency"), leaf(v, "severity"), leaf(v, "certainty")]).toEqual(["Met", "Immediate", "Severe", "Observed"]);
    const area = child(v, "area") as XmlNode;
    expect(leaf(area, "areaDesc")).toBe("Chiang Mai Province");
    expect(child(area, "circle")).toBeUndefined();
    expect(leaf(v, "instruction")).toContain("Follow official instructions now");
  });

  it("uses cnx-{domain}-{district}-{sha1(level + peakAt)} identifiers that hold across requests", async () => {
    const first = await build(null);
    const peakIso = new Date(PEAK * 1000).toISOString();
    expect(first.messages[1].identifier).toBe(`cnx-rain-mae-chaem-${createHash("sha1").update(`alert${peakIso}`).digest("hex")}`);
    const later = await build(first.next, verdict(), NOW + 20 * 60_000);
    expect(later.messages.map((m) => m.identifier)).toEqual(first.messages.map((m) => m.identifier));
    expect(later.messages.map((m) => m.sent)).toEqual(first.messages.map((m) => m.sent));
    expect(first.messages.every((m) => isCapIdentifier(m.identifier))).toBe(true);
    expect(isCapIdentifier("cnx-rain-x-<script>")).toBe(false);
  });

  it("is an Alert when a level is entered and an Update, referencing the earlier message, when an exported level changes", async () => {
    const prepare = await build(null, verdict({ level: "prepare" }));
    expect(prepare.messages[0].msgType).toBe("Alert");
    const danger = await build(prepare.next, verdict(), NOW + 3_600_000);
    const m = danger.messages[0];
    expect(m.msgType).toBe("Update");
    expect(m.references).toBe(`cap@cnx.nonarkara.org,${prepare.messages[0].identifier},${prepare.messages[0].sent}`);
    expect(m.identifier).not.toBe(prepare.messages[0].identifier);
    expect(checkCapAlert(parseXml(capAlertDocument(m, WEB)))).toEqual([]);
    // Rising from watch (never exported) is a new Alert, not an Update.
    const fromWatch = await build((await build(null, verdict({ level: "watch" }))).next, verdict(), NOW + 3_600_000);
    expect(fromWatch.messages[0].msgType).toBe("Alert");
  });

  it("escapes markup in every field and keeps the document well-formed", async () => {
    const { messages } = await build(null);
    const nasty = { ...messages[0], warning: { ...messages[0].warning, headlineEn: `Ping <b>&"rising"'` } };
    const doc = capAlertDocument(nasty, WEB);
    expect(doc).toContain("Ping &lt;b&gt;&amp;&quot;rising&quot;&apos;");
    expect(leaf(children(parseXml(doc), "info")[1], "headline")).toBe(`Ping <b>&"rising"'`);
    expect(xmlEscape("a\u0001b")).toBe("ab");
  });

  it("writes CAP dateTimes with an offset and no fractional seconds or Z", () => {
    expect(capDateTime(Date.parse("2026-10-11T17:30:45.123Z"))).toBe("2026-10-12T00:30:45+07:00");
  });

  it("validates against the CAP 1.2 schema with xmllint when it is installed", async () => {
    if (spawnSync("xmllint", ["--version"]).status !== 0) return;
    const { messages } = await build(null);
    const dir = mkdtempSync(join(tmpdir(), "cnx-cap-"));
    try {
      const files = messages.map((m, i) => {
        const file = join(dir, `alert-${i}.xml`);
        writeFileSync(file, capAlertDocument(m, WEB));
        return file;
      });
      const xsd = join(process.cwd(), "src/lib/cnx/cap-1.2.test.xsd");
      const out = execFileSync("xmllint", ["--noout", "--schema", xsd, ...files], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      expect(out).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("CAP list and Atom index", () => {
  it("lists every alert as a complete CAP alert under one root", async () => {
    const { messages } = await build(null);
    const list = parseXml(capListDocument(messages, WEB, "2026-10-11T05:20:00.000Z"));
    expect(list.attrs.count).toBe("3");
    expect(list.children.map((a) => checkCapAlert(a))).toEqual([[], [], []]);
    expect(parseXml(capListDocument([], WEB, "2026-10-11T05:20:00.000Z")).children).toEqual([]);
  });

  it("indexes each alert with its CAP link, and stays valid when nothing is active", async () => {
    const { messages } = await build(null);
    const feed = parseXml(capAtom(messages, "https://cnx.example", "2026-10-11T05:20:00.000Z"));
    expect(feed.attrs.xmlns).toBe("http://www.w3.org/2005/Atom");
    for (const name of ["id", "title", "updated", "author"]) expect(child(feed, name)).toBeDefined();
    expect(leaf(feed, "subtitle")).toBe(CAP_RESTRICTION);
    const entries = children(feed, "entry");
    expect(entries).toHaveLength(3);
    const link = child(entries[1], "link") as XmlNode;
    expect(link.attrs).toMatchObject({ rel: "alternate", type: "application/cap+xml", href: `https://cnx.example/api/cnx/cap.xml?id=${messages[1].identifier}` });
    for (const e of entries) for (const name of ["id", "title", "updated"]) expect(child(e, name)).toBeDefined();
    const empty = parseXml(capAtom([], "https://cnx.example", "2026-10-11T05:20:00.000Z"));
    expect(children(empty, "entry")).toEqual([]);
    expect(leaf(empty, "updated")).toBe("2026-10-11T12:20:00+07:00");
  });

  it("hashes identifiers the same way in Workers and Node (WebCrypto SHA-1)", async () => {
    expect(await capIdentifier("cnx-pm25-fang", "watch", null)).toBe(`cnx-pm25-fang-${createHash("sha1").update("watch").digest("hex")}`);
  });
});
