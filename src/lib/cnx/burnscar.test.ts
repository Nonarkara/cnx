import { describe, expect, it } from "vitest";
import { burnscarUpstream } from "./burnscar";

describe("burnscarUpstream", () => {
  it("flips XYZ rows to TMS and picks the season layer", () => {
    // z9 Chiang Mai tile: XYZ y=230 → TMS y = 511 − 230 = 281.
    expect(burnscarUpstream("agri", "9", "398", "230")).toBe(
      "https://tamroypao.hii.or.th/tms/2025/BURNSCAR_NORTH_20M_202512_202604_B3A_COLOR/9/398/281.png",
    );
    expect(burnscarUpstream("forest", "9", "398", "230")).toContain("_B3F_COLOR/9/398/281.png");
  });

  it("refuses anything that is not a tile of an allowed layer", () => {
    expect(burnscarUpstream("../../etc", "9", "1", "1")).toBeNull();
    expect(burnscarUpstream("agri", "5", "1", "1")).toBeNull(); // below HII's levels
    expect(burnscarUpstream("agri", "16", "1", "1")).toBeNull(); // above
    expect(burnscarUpstream("agri", "9", "512", "1")).toBeNull(); // off the grid
    expect(burnscarUpstream("agri", "9", "1", "-1")).toBeNull();
    expect(burnscarUpstream("agri", "9", "1x", "1")).toBeNull();
    expect(burnscarUpstream("agri", null, "1", "1")).toBeNull();
  });
});
