import { COOKIE, sessionToken, checkPassword } from "@/lib/auth";

// naive in-memory brute-force guard: max 8 attempts / 5 min per IP
const attempts = new Map<string, number[]>();
const WINDOW = 5 * 60_000, MAX = 8;

function limited(ip: string): boolean {
  const now = Date.now();
  const hits = (attempts.get(ip) || []).filter((t) => now - t < WINDOW);
  hits.push(now);
  attempts.set(ip, hits);
  return hits.length > MAX;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (limited(ip)) {
    return new Response(JSON.stringify({ error: "too many attempts" }), { status: 429, headers: { "Content-Type": "application/json" } });
  }
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (!checkPassword(password || "")) {
    return new Response(JSON.stringify({ error: "wrong password" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const token = await sessionToken();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${60 * 60 * 24 * 30}`,
    },
  });
}
