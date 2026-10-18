import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { DESIGN_REFERENCES } from "./design-references";

describe("credited design references", () => {
  it("preserves all 47 catalogue entries without inventing a link for the unopened one", () => {
    expect(DESIGN_REFERENCES).toHaveLength(47);
    expect(new Set(DESIGN_REFERENCES.map((r) => r.sourceIndex)).size).toBe(47);
    expect(DESIGN_REFERENCES.filter((r) => r.url)).toHaveLength(46);
    expect(DESIGN_REFERENCES.find((r) => r.sourceIndex === 40)?.url).toBeNull();
    for (const ref of DESIGN_REFERENCES) if (ref.url) expect(new URL(ref.url).protocol).toBe("https:");
  });
  it("requires real repository evidence for every adoption claim", () => {
    for (const ref of DESIGN_REFERENCES) {
      if (ref.status === "reference") expect(ref.evidence).toEqual([]);
      else {
        expect(ref.evidence.length).toBeGreaterThan(0);
        for (const path of ref.evidence) expect(existsSync(path), path).toBe(true);
      }
    }
    expect(DESIGN_REFERENCES.filter((r) => r.status === "improved").map((r) => r.sourceIndex)).toEqual([19, 35, 46]);
  });
});
