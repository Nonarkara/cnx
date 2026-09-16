/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["maplibre-gl"],
  // Build-time speedup on Node 26 (ESLint hangs the opennextjs bundler).
  // Run `npx eslint src` separately to lint before push.
  eslint: { ignoreDuringBuilds: true },
  async redirects() {
    if (process.env.NEXT_PUBLIC_PROVINCE === "cnx") {
      return [{ source: "/", destination: "/cnx", permanent: false }];
    }
    return [];
  },
};

export default nextConfig;
