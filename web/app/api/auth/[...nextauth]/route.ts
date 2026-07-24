import { handlers } from "@/auth";

// NextAuth v5 route handlers - serves /api/auth/signin, /api/auth/callback/google, etc.
export const { GET, POST } = handlers;
