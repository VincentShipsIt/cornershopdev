import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const apiOrigin = process.env.CORNERSHOPDEV_API_ORIGIN?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    if (!apiOrigin) return [];

    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${apiOrigin}/api/:path*`,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  images: {
    // Images are delivered by the existing CDN/origin, without Vercel transforms.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default withWorkflow(nextConfig);
