import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const apiOrigin = process.env.CORNERSHOPDEV_API_ORIGIN?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Lighthouse flagged the per-route CSS chunks as render-blocking
    // (~900ms wasted before LCP). Tailwind's atomic output is small per
    // page, so inlining trades that request waterfall for a few KB
    // duplicated into the HTML — the recommended tradeoff for atomic CSS
    // per `node_modules/next/dist/docs/.../inlineCss.md`.
    inlineCss: true,
  },
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
