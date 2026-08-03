// Gate every route through NextAuth (Google, single admin email). The `authorized`
// callback in auth.ts decides: dev/local is open, production requires a valid session.
// /login and /api/auth/* are excluded below so sign-in is always reachable.
export { auth as middleware } from "@/auth";

export const config = {
  // Public assets (icons, manifest, OG image) must bypass auth so home-screen install
  // and link-share previews resolve even over the auth-gated Tailscale URL.
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|icon-192.png|icon-512.png|manifest.webmanifest|opengraph-image|twitter-image).*)",
  ],
};
