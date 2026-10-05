/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PRD §5.8: data-light is a product requirement, not an optimisation.
  // Nigerian traffic is majority low-end Android on metered data.
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    // A selfie check posts one selfie and 6–8 liveness frames, which pass
    // straight through to Smile ID and are never stored. The 1 MB default
    // can refuse a full capture; 4 MB covers it with room to spare.
    serverActions: { bodySizeLimit: "4mb" },
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
