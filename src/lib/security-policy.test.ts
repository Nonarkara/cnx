import { afterEach, describe, expect, it, vi } from "vitest";
import { API_CSP, SECURITY_HEADERS, buildCsp, rateLimitClass } from "./security-policy";

describe("content security policy", () => {
  afterEach(() => vi.unstubAllEnvs());
  const csp = buildCsp("abc123");
  const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

  it("runs scripts only with the request nonce — no unsafe-inline or eval", () => {
    expect(directive("script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
  });

  it("allows Next development eval only on exact loopback hosts without changing other directives", () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const host of ["localhost", "127.0.0.1", "[::1]", "::1"]) {
      const local = buildCsp("abc123", host);
      expect(local).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic' 'unsafe-eval'");
      expect(local.replace(" 'unsafe-eval'", "")).toBe(csp);
    }
    for (const host of [undefined, "cnx.nonarkara.org", "localhost.example.com", "127.0.0.1.example.com", "192.168.1.2"]) {
      expect(buildCsp("abc123", host)).toBe(csp);
    }
  });

  it("never permits eval in production or test, including loopback requests", () => {
    for (const env of ["production", "test"]) {
      vi.stubEnv("NODE_ENV", env);
      for (const host of [undefined, "localhost", "127.0.0.1", "[::1]", "cnx.nonarkara.org"]) {
        expect(buildCsp("abc123", host)).toBe(csp);
      }
    }
  });

  it("refuses plugins, framing, base hijack and plain http", () => {
    for (const d of ["object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "upgrade-insecure-requests"]) expect(csp).toContain(d);
    expect(csp).not.toMatch(/\shttp:/);
  });

  it("allows frames only from the two embedded players", () => {
    expect(directive("frame-src").split(" ").slice(1)).toEqual(["https://webcams.windy.com", "https://www.windy.com", "https://public.tableau.com"]);
  });

  it("lets MapLibre fetch the forecast data: URL and reach the shuttle broker on its port", () => {
    expect(directive("connect-src")).toContain("data:");
    expect(directive("connect-src")).toContain("blob:");
    expect(directive("connect-src")).toContain("wss://cmutransit-ws.bda.co.th:8883");
  });

  it("locks API responses down completely", () => {
    expect(API_CSP).toBe("default-src 'none'; frame-ancestors 'none'");
  });

  it("sends the hardening headers and disables the legacy XSS auditor", () => {
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toMatch(/max-age=63072000/);
    expect(SECURITY_HEADERS["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(SECURITY_HEADERS["X-XSS-Protection"]).toBe("0");
    expect(SECURITY_HEADERS["Permissions-Policy"]).toContain("camera=()");
  });
});

describe("rate-limit classes", () => {
  it("puts relay writes, heavy reads and ordinary reads in separate buckets", () => {
    expect(rateLimitClass("/api/cnx/rain/ingest", "POST").binding).toBe("CNX_RL_INGEST");
    expect(rateLimitClass("/api/cnx/ask", "GET").binding).toBe("CNX_RL_HEAVY");
    expect(rateLimitClass("/api/cnx/forecast-field", "GET").binding).toBe("CNX_RL_HEAVY");
    expect(rateLimitClass("/api/cnx/rain", "GET").binding).toBe("CNX_RL_API");
    expect(rateLimitClass("/api/cnx/asked", "GET").binding).toBe("CNX_RL_API");
  });
});
