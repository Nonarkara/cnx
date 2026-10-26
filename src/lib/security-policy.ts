// Security policy for every response, in one place so it can be tested.
//
// CSP: scripts run only with this request's nonce ('strict-dynamic' lets
// Next's nonce-stamped scripts load their own chunks). Everything else is
// pinned to what the board actually uses:
//   - workers: MapLibre's worker is served from /maplibre (same origin);
//     blob: covers deck.gl/loaders.gl worker bootstraps.
//   - images/tiles/video: base maps, NASA GIBS, RainViewer, camera stills
//     and HLS come from many public hosts and from data, so https: — never
//     plain http.
//   - frames: only the Windy webcam day-player and the CMU SCMC Tableau
//     dashboard on the About page.
//   - styles: 'unsafe-inline' is required by React style attributes and
//     MapLibre's inline styles; style injection cannot execute script.
//   - connect: MapLibre v6 fetch()es image sources, and the forecast layer
//     hands it a data: URL — so data: and blob: must be allowed here.
//   - no plugins, no <base> hijack, forms post only here, nobody may frame us.

export const FRAME_HOSTS = ["https://webcams.windy.com", "https://www.windy.com", "https://public.tableau.com"];
// Host sources without a port match only the default port; the broker is on 8883.
export const SOCKET_HOSTS = ["wss://cmutransit-ws.bda.co.th:8883"];

export function buildCsp(nonce: string, hostname?: string): string {
  // Next's webpack development runtime uses eval for refresh/debugging.
  // This exception is owned by the server environment and exact loopback
  // hostname, never a query parameter or a caller-supplied CSP header.
  const localDevelopment = process.env.NODE_ENV === "development"
    && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname ?? "");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${localDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' data: blob: https: ${SOCKET_HOSTS.join(" ")}`,
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    `frame-src ${FRAME_HOSTS.join(" ")}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** JSON never needs to load anything. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-site",
  "X-Permitted-Cross-Domain-Policies": "none",
  // The legacy XSS auditor is removed from browsers and could itself be abused; OWASP: disable.
  "X-XSS-Protection": "0",
};

/**
 * Which per-IP limiter a request falls under (Workers Rate Limiting
 * bindings in wrangler.cnx.jsonc; period 60 s):
 *   ingest  — relay writes, 60/min (the relay posts a few per minute)
 *   heavy   — routes that fan out upstream or compute, 150/min
 *   api     — every other read, 1500/min
 * Generous on purpose: a provincial office puts many screens behind one
 * NAT address, and each board polls ~30 routes. The limits stop floods and
 * quota-burning loops, not a room full of officials.
 */
export function rateLimitClass(pathname: string, method: string): { binding: "CNX_RL_INGEST" | "CNX_RL_HEAVY" | "CNX_RL_API" } {
  if (pathname.endsWith("/ingest") || method === "POST") return { binding: "CNX_RL_INGEST" };
  if (/^\/api\/cnx\/(ask|forecast-field|social|smoke-trajectory|twin|story|og|visitors|outbound|cap\.xml|cap\.atom|official-warnings|warning-log|manifest\.json)(\/|$)/.test(pathname)) return { binding: "CNX_RL_HEAVY" };
  return { binding: "CNX_RL_API" };
}
