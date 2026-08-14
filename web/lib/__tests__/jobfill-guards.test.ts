import { describe, it, expect } from "vitest";
import { originBlocked, crossOriginBlocked, isLoopback } from "../jobfill";

// Minimal Request stub: only the headers.get() the guards read.
const req = (h: Record<string, string>) =>
  ({ headers: { get: (n: string) => h[n.toLowerCase()] ?? null } }) as unknown as Request;

describe("isLoopback", () => {
  it("is true only for loopback hosts", () => {
    expect(isLoopback(req({ host: "127.0.0.1:3017" }))).toBe(true);
    expect(isLoopback(req({ host: "localhost:3017" }))).toBe(true);
    expect(isLoopback(req({ host: "[::1]:3017" }))).toBe(true);
  });
  it("is false for LAN / public hosts", () => {
    expect(isLoopback(req({ host: "10.1.2.3:3017" }))).toBe(false);
    expect(isLoopback(req({ host: "192.168.1.9:3017" }))).toBe(false);
    expect(isLoopback(req({ host: "remote.example.com" }))).toBe(false);
  });
});

describe("originBlocked (extension-only routes)", () => {
  const loop = { host: "127.0.0.1:3017" };
  it("allows the extension (no Origin, loopback)", () => {
    expect(originBlocked(req({ ...loop }))).toBeNull();
  });
  it("allows a chrome-extension origin on loopback", () => {
    expect(originBlocked(req({ ...loop, origin: "chrome-extension://abc" }))).toBeNull();
  });
  it("blocks an http page Origin", () => {
    expect(originBlocked(req({ ...loop, origin: "http://evil.example" }))?.status).toBe(403);
  });
  it("blocks the literal 'null' Origin (sandboxed-iframe CSRF gap)", () => {
    expect(originBlocked(req({ ...loop, origin: "null" }))?.status).toBe(403);
  });
  it("blocks a non-loopback (LAN) client even with no Origin", () => {
    expect(originBlocked(req({ host: "10.1.2.3:3017" }))?.status).toBe(403);
  });
});

describe("crossOriginBlocked (board-mutation routes)", () => {
  it("allows a same-origin request", () => {
    expect(crossOriginBlocked(req({ host: "localhost:3017", origin: "http://localhost:3017" }))).toBeNull();
  });
  it("allows a request with no Origin (server nav)", () => {
    expect(crossOriginBlocked(req({ host: "localhost:3017" }))).toBeNull();
  });
  it("blocks a cross-origin request", () => {
    expect(crossOriginBlocked(req({ host: "localhost:3017", origin: "http://evil.example" }))?.status).toBe(403);
  });
});
