import { describe, expect, it } from "vitest";
import { createBackoff, parseRetryAfter } from "../../../scripts/provider-backoff.mjs";

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

  it("does not shorten an explicit one-hour provider rest to the exponential cap", () => {
    let t = Date.parse("2026-10-30T00:00:00Z");
    const b = createBackoff(() => t);
    b.failure("adsb", parseRetryAfter("3600", t));
    expect(b.remainingSec("adsb")).toBe(3600);
    t += 15 * 60_000;
    expect(b.blocked("adsb")).toBe(true);
    t += 45 * 60_000;
    expect(b.blocked("adsb")).toBe(false);
  });

  it("honours an HTTP-date Retry-After against the supplied decision clock", () => {
    let t = Date.parse("2026-10-30T00:00:00.500Z");
    const b = createBackoff(() => t);
    b.failure("adsb", parseRetryAfter("Fri, 30 Oct 2026 01:00:00 GMT", t));
    expect(b.remainingSec("adsb")).toBe(3600);
    t += 3_599_000;
    expect(b.blocked("adsb")).toBe(true);
    t += 1_000;
    expect(b.blocked("adsb")).toBe(false);
  });

  it("uses the normal failure rest for missing, invalid or elapsed provider dates", () => {
    const t = Date.parse("2026-10-30T00:00:00Z");
    expect(parseRetryAfter(null, t)).toBeNull();
    expect(parseRetryAfter("not a date", t)).toBeNull();
    expect(parseRetryAfter("", t)).toBeNull();
    expect(parseRetryAfter("-1", t)).toBeNull();
    expect(parseRetryAfter("1.5", t)).toBeNull();
    expect(parseRetryAfter("Thu, 29 Oct 2026 23:59:00 GMT", t)).toBe(0);
    const b = createBackoff(() => t);
    b.failure("adsb", parseRetryAfter("Thu, 29 Oct 2026 23:59:00 GMT", t));
    expect(b.remainingSec("adsb")).toBe(60);
  });
});
