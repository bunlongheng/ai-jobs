/**
 * Detect whether a request originates from a local / LAN host, to bypass auth during
 * local development while keeping remote/production access gated. Matches ONLY the Host
 * header: localhost, 127.0.0.1, 10.x.x.x, 192.168.x.x, *.localhost.
 *
 * SECURITY: x-forwarded-for is deliberately NOT consulted (attacker-controlled). This
 * must never be the sole gate in production - callers also require NODE_ENV !== production.
 */
// Loopback + private LAN ranges (owner decision 2026-08-05: trust the home LAN so the
// iPad can open the board at http://10.0.0.218:3017 without a login, as it used to).
// Trade-off accepted: any device on the home WiFi can reach this PII app unauthenticated;
// remote access is still gated (only localhost + RFC1918 hosts match, never public IPs).
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|.*\.localhost)(:\d+)?$/;

export function isLocal(request: { headers: { get(name: string): string | null } }): boolean {
  // Host-based bypass. NOTE (2026-07-25): a forwarded-header check was tried to close the
  // Host-spoof edge but Next sets x-forwarded-* on every request (incl. direct localhost),
  // so it over-gated. Accepted for the single-user tailnet: the only party who could spoof
  // Host: localhost over the tunnel is the owner (sole tailnet member). Revisit if shared.
  const host = request.headers.get("host") || "";
  return LOCAL_HOST_RE.test(host);
}
