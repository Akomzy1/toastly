/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PRD §5.8: data-light is a product requirement, not an optimisation.
  // Nigerian traffic is majority low-end Android on metered data.
  images: {
    formats: ["image/avif", "image/webp"],
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
