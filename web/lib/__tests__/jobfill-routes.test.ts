import { describe, it, expect } from "vitest";
import os from "os";
import path from "path";

// Point the DB at a throwaway file BEFORE importing any route (they open it on import).
process.env.JOBS_DB = path.join(os.tmpdir(), `jobs-routes-${Date.now()}.db`);

// A cross-origin POST: the guard runs FIRST, so it 403s before any DB write or process spawn.
const xo = (p: string) =>
  new Request(`http://localhost:3017${p}`, { method: "POST", headers: { origin: "http://evil.example", host: "localhost:3017" } });

// Every side-effect route must be wired to a same-origin/CSRF guard - not just the guard function
// tested in isolation. A cross-origin request must be refused before the handler does its work.
describe("side-effect routes reject cross-origin (guard is wired, not just defined)", () => {
  it("jobs/like", async () => {
    const { POST } = await import("@/app/api/jobs/like/route");
    expect((await POST(xo("/api/jobs/like"))).status).toBe(403);
  });
  it("jobs/applied", async () => {
    const { POST } = await import("@/app/api/jobs/applied/route");
    expect((await POST(xo("/api/jobs/applied"))).status).toBe(403);
  });
  it("jobs/hold-company", async () => {
    const { POST } = await import("@/app/api/jobs/hold-company/route");
    expect((await POST(xo("/api/jobs/hold-company"))).status).toBe(403);
  });
  it("jobfill/recruiter-status", async () => {
    const { POST } = await import("@/app/api/jobfill/recruiter-status/route");
    expect((await POST(xo("/api/jobfill/recruiter-status"))).status).toBe(403);
  });
  it("jobfill/prescan", async () => {
    const { POST } = await import("@/app/api/jobfill/prescan/route");
    expect((await POST(xo("/api/jobfill/prescan"))).status).toBe(403);
  });
  it("jobfill/readyscan", async () => {
    const { POST } = await import("@/app/api/jobfill/readyscan/route");
    expect((await POST(xo("/api/jobfill/readyscan"))).status).toBe(403);
  });
  it("jobfill/find-email/[id]", async () => {
    const { POST } = await import("@/app/api/jobfill/find-email/[id]/route");
    expect((await POST(xo("/api/jobfill/find-email/x"), { params: Promise.resolve({ id: "x" }) })).status).toBe(403);
  });
});
