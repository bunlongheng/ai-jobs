/**
 * Detect whether a request originates from a local / LAN host, to bypass auth during
 * local development while keeping remote/production access gated. Matches ONLY the Host
 * header: localhost, 127.0.0.1, 10.x.x.x, 192.168.x.x, *.localhost.
 *
 * SECURITY: x-forwarded-for is deliberately NOT consulted (attacker-controlled). This
 * must never be the sole gate in production - callers also require NODE_ENV !== production.
 */
const LOCAL_HOST_RE =
  /^(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|.*\.localhost)(:\d+)?$/;

export function isLocal(request: { headers: { get(name: string): string | null } }): boolean {
  const host = request.headers.get("host") || "";
  return LOCAL_HOST_RE.test(host);
}
