import { describe, it, expect } from "vitest";
import { isLocal } from "../is-local";

// tiny request stub: case-insensitive header getter
const req = (h: Record<string, string>) => ({ headers: { get: (n: string) => h[n.toLowerCase()] ?? null } });

describe("isLocal", () => {
  it("bypasses direct loopback / *.localhost hosts", () => {
    expect(isLocal(req({ host: "localhost:3017" }))).toBe(true);
    expect(isLocal(req({ host: "127.0.0.1:3017" }))).toBe(true);
    expect(isLocal(req({ host: "jobs.localhost" }))).toBe(true);
  });

  it("gates LAN, tailnet, and public hosts", () => {
    expect(isLocal(req({ host: "192.168.1.9:3017" }))).toBe(false);
    expect(isLocal(req({ host: "10.0.0.5:3017" }))).toBe(false);
    expect(isLocal(req({ host: "m4.tailc55bed.ts.net" }))).toBe(false);
    expect(isLocal(req({ host: "evil.example.com" }))).toBe(false);
  });

  it("never bypasses a PROXIED request even if Host is spoofed to localhost", () => {
    // Tailscale serve / Caddy always add a forwarding header - a real loopback hit never does.
    expect(isLocal(req({ host: "localhost", "x-forwarded-for": "100.99.41.27" }))).toBe(false);
    expect(isLocal(req({ host: "localhost:3017", "x-forwarded-host": "m4.tailc55bed.ts.net" }))).toBe(false);
  });

  it("handles a missing Host header", () => {
    expect(isLocal(req({}))).toBe(false);
  });
});
