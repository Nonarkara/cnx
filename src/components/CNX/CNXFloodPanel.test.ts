// Flood desk honesty, rendered: unavailable feeds render as unavailable, a
// drill is labelled as one, and nothing on the desk is painted green.
// Server render uses the default language (Thai), one language per mode.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FloodDesk, type FloodDeskProps } from "./CNXFloodDesk";
import CnxFloodPanel from "./CNXFloodPanel";
import { fetchCnxFlood } from "../../lib/cnx/flood";
import { NOW, damsOk, gauge, rainOk, riverOk } from "../../lib/cnx/flood-desk.fixtures";
import { thaiCharCount } from "../../lib/i18n";

const allFailed: FloodDeskProps = {
  flood: null,
  river: { status: "failed" },
  dams: { status: "ok", data: { ...damsOk(), large: [], medium: [], provenance: "unavailable", unavailableReason: "relay silent" } },
  rain: { status: "failed" },
  floodHub: { status: "failed" },
  outlook: null,
  nowMs: NOW,
};

const render = (p: FloodDeskProps) => renderToStaticMarkup(createElement(FloodDesk, p));

describe("flood desk — unavailable is unavailable", () => {
  it("renders every failed part as an unavailable line, none as calm", () => {
    const html = render(allFailed);
    expect(html.match(/data-status="unavailable"/g)).toHaveLength(5);
    expect(html.match(/ไม่มีข้อมูล</g)).toHaveLength(5);
    expect(html).not.toContain("ไม่ถึงเกณฑ์"); // "below threshold" needs a reading
    expect(html).toContain("ยังตอบได้ไม่ครบ");
    expect(html).toContain("ไม่ใช่ว่าปกติ");
    expect(html).not.toContain("sev-fill-good");
  });

  it("shows loading as loading, not as an answer", () => {
    const html = render({ ...allFailed, river: { status: "loading" } });
    expect(html).toContain('data-line="river" data-status="loading"');
  });

  it("never paints a below-threshold reading green", () => {
    const html = render({ ...allFailed, rain: { status: "ok", data: rainOk(0) } });
    expect(html).toContain('data-line="rain" data-status="ok"');
    expect(html).toContain("ไม่ถึงเกณฑ์");
    expect(html).not.toContain("sev-fill-good");
  });
});

describe("flood desk — answer first, evidence after", () => {
  it("leads with the worst live signal and lists the evidence", () => {
    const river = riverOk([gauge(), gauge({ id: "t", code: "P.67", nameTh: "บ้านแม่แตง", belowBankM: 0.6, headroomM: null, severity: "alert" })]);
    const html = render({ ...allFailed, river: { status: "ok", data: river }, dams: { status: "ok", data: damsOk() } });
    const answerAt = html.indexOf("แม่น้ำ: 1 สถานีถึงระดับเตือนสูงหรือวิกฤต");
    expect(answerAt).toBeGreaterThan(-1);
    expect(html.indexOf("สถานีใกล้ตลิ่งที่สุด")).toBeGreaterThan(answerAt);
    expect(html).toContain("แม่งัดสมบูรณ์ชล");
    expect(html).toContain("รายงานวันนี้");
  });
});

describe("flood desk — drill mode", () => {
  it("labels the scenario as a drill and its rows as simulated", async () => {
    const flood = await fetchCnxFlood("monsoon-flood-watch");
    const html = render({ ...allFailed, flood });
    expect(html).toContain("ซ้อมแผน — ข้อมูลจำลอง");
    expect(html).toContain("monsoon-flood-watch");
    expect(html.match(/>จำลอง</g)?.length).toBe(flood.gauges.length + flood.reservoirs.length);
    // The live answer still stands beside it, under its own heading.
    expect(html).toContain("ข้อมูลจริง ณ ตอนนี้");
  });

  it("shows no drill block and no scenario numbers without ?scenario", async () => {
    const flood = await fetchCnxFlood();
    const html = render({ ...allFailed, flood });
    expect(html).not.toContain("ซ้อมแผน");
    expect(html).not.toContain("Nawarat Bridge");
  });
});

describe("panel shell", () => {
  it("renders Thai tab labels with no English stacked beside them", () => {
    const html = renderToStaticMarkup(createElement(CnxFloodPanel, { flood: null, air: null, fires: null }));
    expect(html).toContain("น้ำท่วม");
    expect(html).not.toContain(">Flood<");
    expect(thaiCharCount(html)).toBeGreaterThan(0);
    expect(html).toContain("min-h-11");
  });
});
