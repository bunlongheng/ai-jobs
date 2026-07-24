// Gate every route through NextAuth (Google, single admin email). The `authorized`
// callback in auth.ts decides: dev/local is open, production requires a valid session.
// /login and /api/auth/* are excluded below so sign-in is always reachable.
export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico|icon.png).*)"],
};
