// Gate every route through NextAuth (Google, single admin email). The `authorized` callback in
// auth.ts decides: dev/local is open, production requires a valid session. Wrapping `auth` lets us
// ALSO attach a per-request CSP nonce so production script-src can drop 'unsafe-inline' - Next.js
// reads the nonce from the request's CSP header and applies it to its own inline bootstrap scripts.
// The gate still runs first: unauthorized requests are redirected before this handler responds.
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { isLocal } from "@/lib/is-local";

function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    "img-src 'self' https://cdn.simpleicons.org https://icons.duckduckgo.com https://www.google.com data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export default auth((req) => {
  // Enforce the same gate as auth.ts's `authorized` callback (wrapping auth does NOT auto-apply it):
  // loopback/local is open; any remote host (Tailscale/LAN) needs a valid session, else -> /login.
  if (!isLocal(req) && !req.auth?.user) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(url);
  }
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("content-security-policy", csp);
  return res;
});

export const config = {
  // Public assets (icons, manifest, OG image) must bypass auth so home-screen install
  // and link-share previews resolve even over the auth-gated Tailscale URL.
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|icon-192.png|icon-512.png|manifest.webmanifest|opengraph-image|twitter-image).*)",
  ],
};
