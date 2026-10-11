import { describe, expect, it } from "vitest";
import { pick, thaiCharCount } from "./i18n";

describe("i18n", () => {
  it("picks one language and falls back to Thai when English is missing", () => {
    expect(pick("th", "น้ำ", "Water")).toBe("น้ำ");
    expect(pick("en", "น้ำ", "Water")).toBe("Water");
    expect(pick("en", "น้ำ", null)).toBe("น้ำ");
  });
  it("counts Thai characters", () => {
    expect(thaiCharCount("Water น้ำ")).toBe(3);
    expect(thaiCharCount("Water")).toBe(0);
  });
});
