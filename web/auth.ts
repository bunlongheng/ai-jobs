/**
 * NextAuth v5 (Auth.js) - single-user gate.
 *
 * Only ADMIN_EMAIL (default bheng.code@gmail.com) can sign in; every other Google
 * identity is rejected in the signIn callback before any session is issued.
 *
 * JWT sessions (no DB adapter) - the app's store is SQLite, and a single user needs
 * no session table. Local/dev requests bypass the gate entirely (authorized callback),
 * so the local workflow is unchanged; only production requires Google sign-in.
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isLocal } from "@/lib/is-local";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "bheng.code@gmail.com").trim().toLowerCase();

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    // Gate sign-in: only the admin email passes, before any session is issued.
    async signIn({ user }) {
      return !!user.email && user.email.toLowerCase() === ADMIN_EMAIL;
    },
    // Used by middleware. Bypass ONLY local/LAN dev requests (localhost/192.168/10.x) and
    // ONLY when not in production - so an exposed dev server still gates remote hosts, and
    // production always requires a valid session (obtainable only by the admin email above).
    authorized({ auth, request }) {
      if (process.env.NODE_ENV !== "production" && isLocal(request)) return true;
      return !!auth?.user;
    },
  },
});
