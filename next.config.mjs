/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PRD §5.8: data-light is a product requirement, not an optimisation.
  // Nigerian traffic is majority low-end Android on metered data.
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // The selfie check (0029) posts the selfie and 6–8 liveness frames from
  // Smile ID's camera through a server action, straight on to Smile ID —
  // more than Next's 1 MB default. Nothing in the request is stored.
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  // Prompt 17: the coin balance is never called a wallet (CLAUDE.md).
  async redirects() {
    return [{ source: "/wallet", destination: "/coins", permanent: true }];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
