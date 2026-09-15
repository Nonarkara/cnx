import { NextResponse } from "next/server";

/**
 * Which build is live, in one request.
 *
 * Lets the operator (and any audit script) answer "is feature X
 * deployed?" without watching the page die. A 404 here means the
 * worker predates this file — every older build has no /api/cnx/build
 * at all.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface BuildInfo {
  app: "cnx-dashboard";
  build: string;
  commit: string;
  branch: string;
  buildTime: string;
  builtAt: string | null;
  province: string | undefined;
  siteUrl: string | undefined;
  nodeEnv: string;
  now: string;
  features: {
    flightOverlay: boolean;
    openskyLive: boolean;
  };
}

export function GET(): Response {
  const commit = process.env.NEXT_PUBLIC_GIT_SHA ?? process.env.NEXT_PUBLIC_CNX_BUILD ?? "unknown";
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME ?? process.env.NEXT_PUBLIC_CNX_BUILT_AT ?? new Date().toISOString();

  const info: BuildInfo = {
    app: "cnx-dashboard",
    build: commit,
    commit,
    branch: process.env.NEXT_PUBLIC_GIT_BRANCH ?? process.env.NEXT_PUBLIC_CNX_BRANCH ?? "unknown",
    buildTime,
    builtAt: buildTime,
    province: process.env.NEXT_PUBLIC_PROVINCE ?? "cnx",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://cnx.nonarkara.org",
    nodeEnv: process.env.NODE_ENV ?? "production",
    now: new Date().toISOString(),
    features: {
      flightOverlay: true,
      openskyLive: true,
    },
  };

  return NextResponse.json(info, {
    headers: { "Cache-Control": "no-store, must-revalidate" },
  });
}
