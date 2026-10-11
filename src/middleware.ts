import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildCsp, API_CSP, SECURITY_HEADERS, rateLimitClass } from "./lib/security-policy";

// Every response gets the security headers; pages get a per-request nonce
// CSP. Next reads the nonce from the request's Content-Security-Policy
// header and stamps it on its own inline and chunk scripts, and
// 'strict-dynamic' lets those trusted scripts load the rest — so an
// injected <script> without the nonce cannot run. The page renders
// dynamically (src/app/layout.tsx) so every response carries a fresh nonce.
//
// API routes are rate-limited per client IP with the Workers Rate Limiting
// bindings (wrangler.cnx.jsonc). A missing binding (local dev, tests) skips
// the check rather than blocking the board.

type Limiter = { limit: (o: { key: string }) => Promise<{ success: boolean }> };

async function limiter(name: string): Promise<Limiter | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const binding = (env as unknown as Record<string, unknown>)[name];
    return binding && typeof (binding as Limiter).limit === "function" ? (binding as Limiter) : null;
  } catch {
    return null;
  }
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    const cls = rateLimitClass(pathname, request.method);
    const rl = await limiter(cls.binding);
    if (rl) {
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await rl.limit({ key: `${cls.binding}:${ip}` });
      if (!success) {
        const res = NextResponse.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": "60" } });
        res.headers.set("Content-Security-Policy", API_CSP);
        return withSecurityHeaders(res);
      }
    }
    const res = NextResponse.next();
    res.headers.set("Content-Security-Policy", API_CSP);
    return withSecurityHeaders(res);
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return withSecurityHeaders(res);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|maplibre/|logos/|data/).*)"],
};
