import { describe, expect, it } from "vitest";
import { createBackoff } from "../../../scripts/provider-backoff.mjs";

describe("provider backoff", () => {
  it("cools a provider down after a failure and doubles up to a cap", () => {
    let t = 0;
    const b = createBackoff(() => t);
    expect(b.blocked("adsb")).toBe(false);
    b.failure("adsb");
    expect(b.blocked("adsb")).toBe(true);
    t = 61_000;
    expect(b.blocked("adsb")).toBe(false);
    b.failure("adsb");
    t += 100_000;
    expect(b.blocked("adsb")).toBe(true); // 2nd failure = 120 s
    for (let i = 0; i < 10; i += 1) b.failure("adsb");
    expect(b.remainingSec("adsb")).toBeLessThanOrEqual(900);
  });

  it("honours Retry-After and clears on success; providers are independent", () => {
    const t = 0;
    const b = createBackoff(() => t);
    b.failure("adsb", 300);
    expect(b.remainingSec("adsb")).toBe(300);
    expect(b.blocked("opensky")).toBe(false);
    b.success("adsb");
    expect(b.blocked("adsb")).toBe(false);
  });
});
