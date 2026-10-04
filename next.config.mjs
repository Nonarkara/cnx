import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// maplibre-gl v6 is ESM-only: its package exports carry only an `import`
// condition, which Next's webpack passes that resolve with `require`
// conditions can't see ("Package path . is not exported"). Pin the bare
// specifier to the resolved ESM file so every pass — and react-map-gl's
// own import("maplibre-gl") — lands on the same module.
const MAPLIBRE_ESM = fileURLToPath(import.meta.resolve("maplibre-gl"));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Shown next to the title (top-left) so every deploy is identifiable.
  // The build metadata goes through the env config rather than bare
  // NEXT_PUBLIC_* shell exports: the env block is inlined into both the
  // server bundle and the client/prerender pass, so the badge shows the
  // same SHA the /api/cnx/build route reports.
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_GIT_SHA: process.env.NEXT_PUBLIC_GIT_SHA ?? "",
    NEXT_PUBLIC_GIT_BRANCH: process.env.NEXT_PUBLIC_GIT_BRANCH ?? "",
    NEXT_PUBLIC_BUILD_TIME: process.env.NEXT_PUBLIC_BUILD_TIME ?? "",
  },
  // No serverExternalPackages entry for maplibre-gl (see MAPLIBRE_ESM):
  // it is bundled instead. The map is `ssr: false`, so the server copy
  // never runs.
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, "maplibre-gl$": MAPLIBRE_ESM };
    return config;
  },
  // ESLint runs at build time. CI fails the build on lint errors —
  // prettier to fail early than ship a warning.
  async redirects() {
    if (process.env.NEXT_PUBLIC_PROVINCE === "cnx") {
      return [{ source: "/", destination: "/cnx", permanent: false }];
    }
    return [];
  },
};

export default nextConfig;
