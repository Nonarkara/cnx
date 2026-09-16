/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
