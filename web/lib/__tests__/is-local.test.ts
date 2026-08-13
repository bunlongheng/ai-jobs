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

  it("trusts private LAN hosts (deliberate: LAN board access for a tablet)", () => {
    expect(isLocal(req({ host: "192.168.1.9:3017" }))).toBe(true);
    expect(isLocal(req({ host: "10.0.0.5:3017" }))).toBe(true);
    expect(isLocal(req({ host: "172.16.4.2:3017" }))).toBe(true);
  });

  it("gates tailnet and public hosts", () => {
    expect(isLocal(req({ host: "remote.example.com" }))).toBe(false);
    expect(isLocal(req({ host: "evil.example.com" }))).toBe(false);
  });

  it("decides purely on Host (single-user tailnet trust boundary)", () => {
    // A forwarded-header check was tried but Next sets x-forwarded-* on every request, so
    // the decision is Host-only. A localhost Host bypasses regardless of forwarding.
    expect(isLocal(req({ host: "localhost", "x-forwarded-for": "127.0.0.1" }))).toBe(true);
    expect(isLocal(req({ host: "remote.example.com", "x-forwarded-for": "100.99.41.27" }))).toBe(false);
  });

  it("handles a missing Host header", () => {
    expect(isLocal(req({}))).toBe(false);
  });
});
