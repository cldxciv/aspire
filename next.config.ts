import type { NextConfig } from "next";

// Baseline security headers for every route. A Content-Security-Policy is
// tracked in docs/integration-status.md (needs nonce support before enabling).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    // D-028: the root layout lives under app/[lang], so URLs matching no route use
    // app/global-not-found.tsx (bilingual) instead of a layout-less default 404.
    globalNotFound: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // /faculty was removed (owner instruction 2026-10-20); keep old links working (both locales, D-028).
  async redirects() {
    return [
      { source: "/faculty", destination: "/about", permanent: false },
      { source: "/hi/faculty", destination: "/hi/about", permanent: false },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
