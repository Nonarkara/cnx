import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Shown next to the title (top-left) so every deploy is identifiable.
  env: { NEXT_PUBLIC_APP_VERSION: version },
  serverExternalPackages: ["maplibre-gl"],
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
