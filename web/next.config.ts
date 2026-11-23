import type { NextConfig } from "next";

// The browser only talks to Next.js. proxy.ts forwards every /api/* call to the Python API
// (HELPDESK_API_URL, default http://127.0.0.1:8100), so there are no CORS issues.
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    proxyTimeout: 120_000,
    proxyClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
