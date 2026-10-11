// TMD CAP parsing and Chiang Mai selection. Real documents captured from the
// live feed on 2026-10-11 (tmd-cap-fixtures/) plus synthetic alerts for the
// cases the feed did not contain that day (a TH-50 alert in force, Cancel).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CNX_PROVINCE_RING, inChiangMaiProvince } from "./province-boundary";
import {
  capBaseId,
  decodeXml,
  parseCapAlert,
  parseCapPolygon,
  parseCapRss,
  rssItemBaseId,
  selectChiangMaiAlerts,
  type CapAlert,
} from "./tmd-cap-core";

const fixture = (name: string) => readFileSync(new URL(`./tmd-cap-fixtures/${name}`, import.meta.url), "utf8");
const lons = CNX_PROVINCE_RING.map(([lon]) => lon);
const lats = CNX_PROVINCE_RING.map(([, lat]) => lat);
const opts = (iso: string) => ({
  now: Date.parse(iso),
  inside: inChiangMaiProvince,
  bbox: { west: Math.min(...lons), east: Math.max(...lons), south: Math.min(...lats), north: Math.max(...lats) },
});
const MIDDAY_11_OCT = "2026-10-11T12:00:00+07:00";

// A small box around the old city, "lat,lon" as CAP writes it.
const CITY_POLYGON = "18.70,98.90 18.70,99.10 18.90,99.10 18.90,98.90 18.70,98.90";
const BANGKOK_POLYGON = "13.60,100.40 13.60,100.70 13.90,100.70 13.90,100.40 13.60,100.40";

function capXml(o: {
  id: string;
  lang?: "th-TH" | "en-US";
  msgType?: string;
  status?: string;
  references?: string;
  headline?: string;
  severity?: string;
  effective?: string;
  expires?: string;
  geocodes?: string[];
  polygon?: string;
}): string {
  const geocodes = (o.geocodes ?? []).map((v) => `<geocode><valueName>ISO3166-2</valueName><value>${v}</value></geocode>`).join("");
  return `﻿<?xml version="1.0" encoding="utf-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>${o.id}</identifier><sender>TMD</sender><sent>2026-10-11T05:00:00+07:00</sent>
  <status>${o.status ?? "Actual"}</status><msgType>${o.msgType ?? "Alert"}</msgType><scope>Public</scope>
  ${o.references ? `<references>${o.references}</references>` : ""}
  <info>
    <language>${o.lang ?? "en-US"}</language><category>Met</category><event>Heavy Rain</event>
    <urgency>Expected</urgency><severity>${o.severity ?? "Severe"}</severity><certainty>Likely</certainty>
    <effective>${o.effective ?? "2026-10-11T06:00:00+07:00"}</effective><expires>${o.expires ?? "2026-10-11T18:00:00+07:00"}</expires>
    <headline>${o.headline ?? "Heavy Rain Risk Area"}</headline>
    <instruction>${o.lang === "th-TH" ? "ระวังน้ำท่วมฉับพลัน" : "Beware of flash floods &amp; overflow"}</instruction>
    <web>https://www.tmd.go.th/forecast/daily</web>
    <area><areaDesc>${o.lang === "th-TH" ? "เชียงใหม่ ลำพูน" : "Chiang Mai Lamphun"}</areaDesc>${o.polygon ? `<polygon>${o.polygon}</polygon>` : ""}${geocodes}</area>
  </info>
</alert>`;
}
const parse = (xml: string): CapAlert => {
  const a = parseCapAlert(xml);
  if (!a) throw new Error("fixture did not parse");
  return a;
};

describe("XML reading", () => {
  it("decodes entities and CDATA", () => {
    expect(decodeXml("a &amp; b &lt;c&gt; &#3648;&#x0e0a;")).toBe("a & b <c> เช");
    expect(decodeXml("<![CDATA[<b>raw</b> & more]]>")).toBe("<b>raw</b> & more");
  });

  it("reads CAP polygons as [lon, lat] and rejects junk", () => {
    expect(parseCapPolygon("18.7,98.9 18.8,99.0 18.9,98.9")).toEqual([[98.9, 18.7], [99.0, 18.8], [98.9, 18.9]]);
    expect(parseCapPolygon("18.7,98.9 nonsense")).toBeNull();
    expect(parseCapPolygon("18.7,98.9 18.8,99.0")).toBeNull();
  });

  it("maps identifiers to the base id shared by both languages", () => {
    expect(capBaseId("TMD20261011062847_2-en")).toBe("TMD20261011062847_2");
    expect(capBaseId("TMD20261011062847_2")).toBe("TMD20261011062847_2");
    expect(rssItemBaseId({ link: "https://www.tmd.go.th/uploads/CAP/CAPTMD20261011062847_2.xml", guid: null, title: null, pubDate: null })).toBe("TMD20261011062847_2");
  });
});

describe("real TMD feed, 2026-10-11", () => {
  it("parses the English RSS index", () => {
    const items = parseCapRss(fixture("rss-en-2026-10-11.xml"));
    expect(items).toHaveLength(11);
    expect(items[0]).toMatchObject({ link: "https://www.tmd.go.th/uploads/CAP/en/CAPTMD20261011164117_2.xml", guid: "TMD20261011164117_2-en", title: "Very Heavy Rain" });
    expect(items.every((i) => i.link.endsWith(".xml"))).toBe(true);
    expect(parseCapRss(fixture("rss-en-2026-10-11.xml"), 3)).toHaveLength(3);
  });

  it("parses a signed CAP 1.2 document", () => {
    const a = parse(fixture("TMD20261011062839_2-en.xml"));
    expect(a).toMatchObject({ identifier: "TMD20261011062839_2-en", sender: "TMD", status: "Actual", msgType: "Update", scope: "Public", references: ["TMD20261010165731_2"] });
    expect(a.infos).toHaveLength(1);
    const info = a.infos[0];
    expect(info).toMatchObject({ language: "en-US", event: "Very Heavy Rain", severity: "Extreme", urgency: "Expected", certainty: "Likely", headline: "Very Heavy Rain Risk Area" });
    expect(info.expires).toBe("2026-10-11T18:00:00+07:00");
    const geocodes = info.areas.flatMap((x) => x.geocodes.map((g) => g.value));
    expect(geocodes).toEqual(["TH-70", "TH-71", "TH-75", "TH-76", "TH-77"]);
    const polygons = info.areas.flatMap((x) => x.polygons);
    expect(polygons).toHaveLength(6);
    // [lon, lat]: western Thailand is ~99–100°E, ~12–14°N.
    const [lon, lat] = polygons[0][0];
    expect(lon).toBeGreaterThan(97);
    expect(lat).toBeLessThan(16);
  });

  it("filters out TMD20261011062839_2 — it does not include TH-50", () => {
    const en = parse(fixture("TMD20261011062839_2-en.xml"));
    const th = parse(fixture("TMD20261011062839_2-th.xml"));
    expect(th.infos[0].language).toBe("th-TH");
    expect(selectChiangMaiAlerts([en, th], opts(MIDDAY_11_OCT))).toEqual([]);
  });

  it("does not let a neighbour's outline make a Chiang Mai warning (TMD20261011062847_2, Tak but not TH-50)", () => {
    // 37 vertices of TMD's Tak outline fall inside our OSM province ring;
    // the alert's own geocode list is what decides.
    const a = parse(fixture("TMD20261011062847_2-en.xml"));
    const vertexInside = a.infos[0].areas.some((ar) => ar.polygons.some((r) => r.some(([x, y]) => inChiangMaiProvince(x, y))));
    expect(vertexInside).toBe(true);
    expect(selectChiangMaiAlerts([a], opts(MIDDAY_11_OCT))).toEqual([]);
  });
});

describe("Chiang Mai selection", () => {
  const th50en = capXml({ id: "TMD20261011090000_2-en", geocodes: ["TH-50", "TH-51"], polygon: CITY_POLYGON, severity: "Extreme", headline: "Very Heavy Rain Risk Area" });
  const th50th = capXml({ id: "TMD20261011090000_2", lang: "th-TH", geocodes: ["TH-50", "TH-51"], polygon: CITY_POLYGON, severity: "Extreme", headline: "พื้นที่เสี่ยงภัยฝนตกหนักมาก" });

  it("keeps a TH-50 alert and pairs its Thai and English documents", () => {
    const [alert, ...rest] = selectChiangMaiAlerts([parse(th50en), parse(th50th)], opts(MIDDAY_11_OCT));
    expect(rest).toEqual([]);
    expect(alert).toMatchObject({
      identifier: "TMD20261011090000_2",
      severity: "Extreme",
      headline_en: "Very Heavy Rain Risk Area",
      headline_th: "พื้นที่เสี่ยงภัยฝนตกหนักมาก",
      instruction_en: "Beware of flash floods & overflow",
      instruction_th: "ระวังน้ำท่วมฉับพลัน",
      areaDesc_th: "เชียงใหม่ ลำพูน",
      areaDesc_en: "Chiang Mai Lamphun",
      geocodeMatch: true,
      effective: "2026-10-11T06:00:00+07:00",
      expires: "2026-10-11T18:00:00+07:00",
    });
    expect(alert.polygons).toHaveLength(1);
    expect(alert.polygons[0][0]).toEqual([98.9, 18.7]);
  });

  it("keeps an alert issued ahead of its effective time", () => {
    const later = capXml({ id: "TMD1_2-en", geocodes: ["TH-50"], effective: "2026-10-11T18:00:00+07:00", expires: "2026-10-12T06:00:00+07:00" });
    expect(selectChiangMaiAlerts([parse(later)], opts(MIDDAY_11_OCT))).toHaveLength(1);
  });

  it("drops polygons far from the province but keeps the alert", () => {
    const xml = capXml({ id: "TMD2_2-en", geocodes: ["TH-50", "TH-10"], polygon: BANGKOK_POLYGON });
    const [alert] = selectChiangMaiAlerts([parse(xml)], opts(MIDDAY_11_OCT));
    expect(alert.polygons).toEqual([]);
  });

  it("uses the polygon when an area carries no province geocode", () => {
    const inCity = capXml({ id: "TMD3_2-en", polygon: CITY_POLYGON });
    const inBangkok = capXml({ id: "TMD4_2-en", polygon: BANGKOK_POLYGON });
    const kept = selectChiangMaiAlerts([parse(inCity), parse(inBangkok)], opts(MIDDAY_11_OCT));
    expect(kept.map((a) => a.identifier)).toEqual(["TMD3_2"]);
    expect(kept[0].geocodeMatch).toBe(false);
  });

  it("drops expired alerts", () => {
    expect(selectChiangMaiAlerts([parse(th50en)], opts("2026-10-11T18:00:01+07:00"))).toEqual([]);
  });

  it("drops a Cancel and the alert it cancels", () => {
    const cancel = capXml({ id: "TMD20261011100000_2-en", msgType: "Cancel", geocodes: ["TH-50"], references: "TMD,TMD20261011090000_2,2026-10-11T05:00:00+07:00" });
    expect(selectChiangMaiAlerts([parse(th50en), parse(th50th), parse(cancel)], opts(MIDDAY_11_OCT))).toEqual([]);
  });

  it("drops exercises and tests", () => {
    const test = capXml({ id: "TMD5_2-en", status: "Test", geocodes: ["TH-50"] });
    expect(selectChiangMaiAlerts([parse(test)], opts(MIDDAY_11_OCT))).toEqual([]);
  });

  it("keeps only the latest of a references chain", () => {
    const update = capXml({ id: "TMD20261011110000_2-en", msgType: "Update", geocodes: ["TH-50"], severity: "Severe", headline: "Heavy Rain Risk Area", references: "TMD,TMD20261011090000_2,2026-10-11T05:00:00+07:00" });
    const kept = selectChiangMaiAlerts([parse(th50en), parse(th50th), parse(update)], opts(MIDDAY_11_OCT));
    expect(kept.map((a) => [a.identifier, a.severity])).toEqual([["TMD20261011110000_2", "Severe"]]);
  });

  it("lifts the warning when the latest Update no longer names Chiang Mai", () => {
    const update = capXml({ id: "TMD20261011110000_2-en", msgType: "Update", geocodes: ["TH-63"], references: "TMD,TMD20261011090000_2,2026-10-11T05:00:00+07:00" });
    expect(selectChiangMaiAlerts([parse(th50en), parse(update)], opts(MIDDAY_11_OCT))).toEqual([]);
  });

  it("orders the most severe first", () => {
    const severe = capXml({ id: "TMD6_2-en", geocodes: ["TH-50"], severity: "Severe" });
    const extreme = capXml({ id: "TMD7_2-en", geocodes: ["TH-50"], severity: "Extreme" });
    expect(selectChiangMaiAlerts([parse(severe), parse(extreme)], opts(MIDDAY_11_OCT)).map((a) => a.severity)).toEqual(["Extreme", "Severe"]);
  });

  it("refuses documents that are not CAP alerts", () => {
    expect(parseCapAlert("<rss><channel/></rss>")).toBeNull();
    expect(parseCapAlert("<alert><sender>x</sender></alert>")).toBeNull();
  });
});
