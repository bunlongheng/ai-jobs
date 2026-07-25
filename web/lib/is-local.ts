/**
 * Detect whether a request originates from a local / LAN host, to bypass auth during
 * local development while keeping remote/production access gated. Matches ONLY the Host
 * header: localhost, 127.0.0.1, 10.x.x.x, 192.168.x.x, *.localhost.
 *
 * SECURITY: x-forwarded-for is deliberately NOT consulted (attacker-controlled). This
 * must never be the sole gate in production - callers also require NODE_ENV !== production.
 */
// Loopback only (this Mac). LAN ranges are deliberately NOT bypassed - a PII app should
// require login for any device that isn't this machine.
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|.*\.localhost)(:\d+)?$/;

export function isLocal(request: { headers: { get(name: string): string | null } }): boolean {
  // A proxied request (Tailscale serve, Caddy) always carries a forwarding header; a
  // genuinely-local request straight to 127.0.0.1 does not. Reject proxied ones so a
  // spoofed "Host: localhost" arriving through the tunnel cannot satisfy the bypass.
  if (request.headers.get("x-forwarded-for") || request.headers.get("x-forwarded-host")) return false;
  const host = request.headers.get("host") || "";
  return LOCAL_HOST_RE.test(host);
}
