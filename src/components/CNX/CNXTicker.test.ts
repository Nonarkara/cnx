import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CnxTicker from "./CNXTicker";
import type { ExecutiveMetric } from "../../lib/cnx/executive-brief";
const metric = (id: ExecutiveMetric["id"], state: ExecutiveMetric["state"], value = "0"): ExecutiveMetric => ({ id, state, value, unit: "", level: state === "current" ? "good" : "unknown" } as ExecutiveMetric);
import type { CctvFeedResponse, CnxFiresResponse } from "../../types/cnx";

describe("operational feed summary", () => {
  it("distinguishes a provincial zero from nearby detections", () => {
    const html = renderToStaticMarkup(createElement(CnxTicker, {
      metrics: [metric("fire", "current")], social: null, story: null, flights: null, cctv: null,
      fires: { provenance: "live", totalCount: 3, provinceCount: 0 } as CnxFiresResponse,
    }));
    expect(html).toContain("FIRMS · เชียงใหม่");
    expect(html).toContain("0 จุด / 24 ชม. · นอกจังหวัด 3");
    expect(html).not.toContain("3 hotspots");
  });
  it("exposes one reachable-camera summary through keyboard-accessible scroll, without animation", () => {
    const html = renderToStaticMarkup(createElement(CnxTicker, {
      metrics: [], fires: null, social: null, story: null, flights: null,
      cctv: { reachableCount: 2, totalCount: 3 } as CctvFeedResponse,
    }));
    expect(html.match(/2\/3 ตอบสนอง/g)).toHaveLength(1);
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("overflow-x-auto");
    expect(html).not.toContain("animate-marquee");
    expect(html).not.toContain("live");
  });
  it("shows a real zero PM2.5 reading instead of omitting it", () => {
    const html = renderToStaticMarkup(createElement(CnxTicker, {
      metrics: [metric("air", "current", "0")], fires: null, social: null, story: null, flights: null, cctv: null,
    }));
    expect(html).toContain("0 µg/m³");
  });
  it("agrees with the pulse when formerly live air and fire readings expire", () => {
    const html = renderToStaticMarkup(createElement(CnxTicker, {
      metrics: [metric("air", "stale", "99"), metric("fire", "stale", "50")],
      fires: { provenance: "live", totalCount: 50, provinceCount: 50 } as CnxFiresResponse,
      social: null, story: null, flights: null, cctv: null,
    }));
    expect(html).not.toContain("99 µg/m³");
    expect(html).not.toContain("50 จุด");
    expect(html).toContain("ยังไม่มีค่าวัดปัจจุบัน");
    expect(html).toContain("ไม่มีข้อมูลดาวเทียมปัจจุบัน");
  });
});
