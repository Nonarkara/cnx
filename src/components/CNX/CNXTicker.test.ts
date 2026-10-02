import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CnxTicker from "./CNXTicker";
import type { AirQualityResponse, CctvFeedResponse } from "../../types/cnx";

describe("operational feed summary", () => {
  it("exposes one reachable-camera summary through keyboard-accessible scroll, without animation", () => {
    const html = renderToStaticMarkup(createElement(CnxTicker, {
      air: null, flood: null, fires: null, social: null, story: null, flights: null,
      cctv: { reachableCount: 2, totalCount: 3 } as CctvFeedResponse,
    }));
    expect(html.match(/2\/3 reachable/g)).toHaveLength(1);
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("overflow-x-auto");
    expect(html).not.toContain("animate-marquee");
    expect(html).not.toContain("live");
  });
  it("shows a real zero PM2.5 reading instead of omitting it", () => {
    const html = renderToStaticMarkup(createElement(CnxTicker, {
      air: { provinceAvgPm25: 0, provinceAvgAqiLevel: "good" } as AirQualityResponse,
      flood: null, fires: null, social: null, story: null, flights: null, cctv: null,
    }));
    expect(html).toContain("0 µg/m³");
  });
});
