import { NextRequest, NextResponse } from "next/server";
import { COOKIE, isValid } from "@/lib/auth";

// Gate EVERY route behind the session cookie. Public: the login page + its API.
// Unauthenticated page requests redirect to /login; API requests get 401.
const PUBLIC = ["/login", "/api/auth"];

export async function middleware(req: NextRequest) {
  // Local-only app: gate is off by default. Set JOBS_AUTH=on to require login.
  if (process.env.JOBS_AUTH !== "on") return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  const ok = await isValid(req.cookies.get(COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

// Run on everything except Next internals + static assets.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};
