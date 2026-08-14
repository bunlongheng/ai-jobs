import type { NextConfig } from "next";

// The Content-Security-Policy is set per-request in middleware.ts with a fresh nonce, so
// production script-src can drop 'unsafe-inline'. These are the static, non-nonce headers.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
