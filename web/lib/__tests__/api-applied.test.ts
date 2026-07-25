import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// throwaway DB before anything opens it
const TMP = path.join(os.tmpdir(), `jobs-api-test-${Date.now()}.db`);
process.env.JOBS_DB = TMP;

let POST: typeof import("../../app/api/jobs/applied/route").POST;
let dbFn: typeof import("../db").db;

beforeAll(async () => {
  ({ db: dbFn } = await import("../db"));
  ({ POST } = await import("../../app/api/jobs/applied/route"));
  dbFn().prepare("INSERT INTO applications (id, company, title, score, status) VALUES ('x','Acme','SWE',80,'kit_ready')").run();
});
afterAll(() => { try { fs.unlinkSync(TMP); fs.unlinkSync(TMP + "-wal"); fs.unlinkSync(TMP + "-shm"); } catch {} });

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/jobs/applied", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
const row = () => dbFn().prepare("SELECT status, applied_at FROM applications WHERE id='x'").get() as { status: string; applied_at: string | null };

describe("/api/jobs/applied", () => {
  it("marks a job applied with a date, then undoes it back to kit_ready", async () => {
    const r1 = await post({ id: "x", applied: true });
    expect((await r1.json()).ok).toBe(true);
    expect(row().status).toBe("applied");
    expect(row().applied_at).toBeTruthy();

    await post({ id: "x", applied: false });
    expect(row().status).toBe("kit_ready");
    expect(row().applied_at).toBeNull();
  });

  it("rejects a request with no id", async () => {
    const r = await post({ applied: true });
    expect(r.status).toBe(400);
  });
});
