import type { NextConfig } from "next";

// Turbopack/React need 'unsafe-eval' in dev (callstack reconstruction, HMR); production
// stays strict without it.
const scriptSrc = process.env.NODE_ENV === "production"
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: `default-src 'self'; img-src 'self' https://cdn.simpleicons.org https://icons.duckduckgo.com https://www.google.com data:; style-src 'self' 'unsafe-inline'; ${scriptSrc}` },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
