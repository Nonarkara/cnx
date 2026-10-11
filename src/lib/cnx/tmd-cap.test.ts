import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOfficialWarnings, readOfficialWarnings, resetOfficialWarningsCache, TMD_CAP_INDEX } from "./tmd-cap";

const fixture = (name: string) => readFileSync(new URL(`./tmd-cap-fixtures/${name}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-10-11T12:00:00+07:00");
const DOC_EN = "https://www.tmd.go.th/uploads/CAP/en/CAPTMD20261011090000_2.xml";
const DOC_TH = "https://www.tmd.go.th/uploads/CAP/CAPTMD20261011090000_2.xml";

const rss = (link: string, guid: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title><link>${TMD_CAP_INDEX.en}</link><item><title>Heavy Rain</title><link>${link}</link><guid isPermaLink="false">${guid}</guid></item></channel></rss>`;
const alertXml = (id: string, lang: string, headline: string) =>
  `<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>${id}</identifier><sender>TMD</sender><sent>2026-10-11T05:00:00+07:00</sent><status>Actual</status><msgType>Alert</msgType><scope>Public</scope><info><language>${lang}</language><event>Heavy Rain</event><urgency>Expected</urgency><severity>Severe</severity><certainty>Likely</certainty><effective>2026-10-11T06:00:00+07:00</effective><expires>2026-10-11T18:00:00+07:00</expires><headline>${headline}</headline><area><areaDesc>Chiang Mai</areaDesc><geocode><valueName>ISO3166-2</valueName><value>TH-50</value></geocode></area></info></alert>`;

function route(table: Record<string, string | number>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const body = table[String(input)];
    if (body === undefined || typeof body === "number") return new Response("no", { status: typeof body === "number" ? body : 404 });
    return new Response(body, { status: 200 });
  });
}

beforeEach(() => resetOfficialWarningsCache());
afterEach(() => vi.unstubAllGlobals());

describe("readOfficialWarnings", () => {
  it("reads the English documents and the Thai counterpart of the selected alert", async () => {
    const fetch = route({
      [TMD_CAP_INDEX.en]: rss(DOC_EN, "TMD20261011090000_2-en"),
      [TMD_CAP_INDEX.th]: rss(DOC_TH, "TMD20261011090000_2"),
      [DOC_EN]: alertXml("TMD20261011090000_2-en", "en-US", "Heavy Rain Risk Area"),
      [DOC_TH]: alertXml("TMD20261011090000_2", "th-TH", "พื้นที่เสี่ยงภัยฝนตกหนัก"),
    });
    vi.stubGlobal("fetch", fetch);
    const r = await readOfficialWarnings(NOW);
    expect(r).toMatchObject({ provenance: "live", reason: null, documentsRead: 1, documentsListed: 1 });
    expect(r.alerts.map((a) => [a.identifier, a.headline_en, a.headline_th])).toEqual([["TMD20261011090000_2", "Heavy Rain Risk Area", "พื้นที่เสี่ยงภัยฝนตกหนัก"]]);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("reports no alert from the real 2026-10-11 document and skips the Thai fetch", async () => {
    const link = "https://www.tmd.go.th/uploads/CAP/en/CAPTMD20261011062839_2.xml";
    const fetch = route({
      [TMD_CAP_INDEX.en]: rss(link, "TMD20261011062839_2-en"),
      [TMD_CAP_INDEX.th]: rss("https://www.tmd.go.th/uploads/CAP/CAPTMD20261011062839_2.xml", "TMD20261011062839_2"),
      [link]: fixture("TMD20261011062839_2-en.xml"),
    });
    vi.stubGlobal("fetch", fetch);
    const r = await readOfficialWarnings(NOW);
    expect(r).toMatchObject({ provenance: "live", alerts: [], documentsRead: 1 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("is unavailable, with a reason, when both indexes refuse", async () => {
    vi.stubGlobal("fetch", route({ [TMD_CAP_INDEX.en]: 403, [TMD_CAP_INDEX.th]: 429 }));
    const r = await readOfficialWarnings(NOW);
    expect(r.provenance).toBe("unavailable");
    expect(r.reason).toContain("HTTP 403");
    expect(r.reason).toContain("HTTP 429");
    expect(r.reason_th).toContain("กรมอุตุนิยมวิทยา");
  });

  it("does not claim 'no alert' when a listed document could not be read", async () => {
    const other = "https://www.tmd.go.th/uploads/CAP/en/CAPTMD20261011062839_2.xml";
    const index = `<rss><channel><item><link>${DOC_EN}</link><guid>A-en</guid></item><item><link>${other}</link><guid>B-en</guid></item></channel></rss>`;
    vi.stubGlobal("fetch", route({ [TMD_CAP_INDEX.en]: index, [TMD_CAP_INDEX.th]: 500, [other]: fixture("TMD20261011062839_2-en.xml"), [DOC_EN]: 503 }));
    const r = await readOfficialWarnings(NOW);
    expect(r.provenance).toBe("unavailable");
    expect(r.reason).toMatch(/read 1 of 2/);
  });

  it("falls back to the Thai index when the English one fails", async () => {
    vi.stubGlobal("fetch", route({ [TMD_CAP_INDEX.en]: 500, [TMD_CAP_INDEX.th]: rss(DOC_TH, "TMD20261011090000_2"), [DOC_TH]: alertXml("TMD20261011090000_2", "th-TH", "พื้นที่เสี่ยงภัยฝนตกหนัก") }));
    const r = await readOfficialWarnings(NOW);
    expect(r.provenance).toBe("live");
    expect(r.alerts[0]).toMatchObject({ headline_th: "พื้นที่เสี่ยงภัยฝนตกหนัก", headline_en: null });
  });
});

describe("fetchOfficialWarnings cache", () => {
  it("serves a failure from cache instead of re-asking a refusing upstream", async () => {
    const fetch = route({ [TMD_CAP_INDEX.en]: 429, [TMD_CAP_INDEX.th]: 429 });
    vi.stubGlobal("fetch", fetch);
    expect((await fetchOfficialWarnings()).provenance).toBe("unavailable");
    expect((await fetchOfficialWarnings()).provenance).toBe("unavailable");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("serves a success from cache", async () => {
    const fetch = route({ [TMD_CAP_INDEX.en]: "<rss><channel></channel></rss>", [TMD_CAP_INDEX.th]: "<rss><channel></channel></rss>" });
    vi.stubGlobal("fetch", fetch);
    expect(await fetchOfficialWarnings()).toMatchObject({ provenance: "live", alerts: [] });
    await fetchOfficialWarnings();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
