import { describe, expect, it } from "vitest";
import { API_CSP, SECURITY_HEADERS, buildCsp, rateLimitClass } from "./security-policy";

describe("content security policy", () => {
  const csp = buildCsp("abc123");
  const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

  it("runs scripts only with the request nonce — no unsafe-inline or eval", () => {
    expect(directive("script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
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
