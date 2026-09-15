/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["maplibre-gl"],
  // When deploying with NEXT_PUBLIC_PROVINCE=cnx the root redirects
  // to the province's war-room page. The redirect is server-side
  // (Next.js redirects()) — it works on Cloudflare Workers through
  // the OpenNext adapter without needing static export.
  async redirects() {
    if (process.env.NEXT_PUBLIC_PROVINCE === "cnx") {
      return [{ source: "/", destination: "/cnx", permanent: false }];
    }
    return [];
  },
};

export default nextConfig;
