// Minimal single-user auth for a personal-PII app. A signed session cookie
// (HMAC of a server secret) gates every route via middleware. Works in both the
// edge (middleware) and node (route handler) runtimes - uses only Web Crypto +
// btoa, which exist in both. No external dependency.

export const COOKIE = "jobs_session";
const MSG = "jobs-session-v1";

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return b64url(sig);
}

function secret(): string {
  const s = process.env.JOBS_SECRET;
  if (!s) throw new Error("JOBS_SECRET is not set");
  return s;
}

/** The valid session-cookie value (deterministic from the server secret). */
export async function sessionToken(): Promise<string> {
  return hmac(secret(), MSG);
}

/** Constant-time-ish check that a cookie token is the valid session token. */
export async function isValid(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const expected = await sessionToken();
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** Verify a submitted password against JOBS_PASSWORD. */
export function checkPassword(pw: string): boolean {
  const expected = process.env.JOBS_PASSWORD || "";
  if (!expected || !pw || pw.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < pw.length; i++) diff |= pw.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
