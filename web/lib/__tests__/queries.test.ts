import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// point the DB at a throwaway file BEFORE importing anything that opens it
const TMP = path.join(os.tmpdir(), `jobs-test-${Date.now()}.db`);
process.env.JOBS_DB = TMP;

let getBoard: typeof import("../queries").getBoard;
let dbFn: typeof import("../db").db;

beforeAll(async () => {
  ({ db: dbFn } = await import("../db"));
  ({ getBoard } = await import("../queries"));
  const d = dbFn();
  const ins = d.prepare(
    "INSERT INTO applications (id, company, title, score, status, pf_ats, pf_status, pf_total, pf_covered) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  // "a" is pre-scanned (pf_ats='plugin' + total>0) -> Ready. "b" has no pre-scan -> Not ready.
  ins.run("a", "Coinbase", "SWE", 88, "kit_ready", "plugin", "ready", 19, 18);
  ins.run("b", "Linear", "Fullstack", 76, "kit_ready", null, null, 0, 0);
  ins.run("c", "Reddit", "Staff", 86, "applied", null, null, null, null);
  ins.run("d", "Old Co", "SWE", 50, "rejected", null, null, null, null);
});

afterAll(() => { try { fs.unlinkSync(TMP); fs.unlinkSync(TMP + "-wal"); fs.unlinkSync(TMP + "-shm"); } catch {} });

describe("getBoard", () => {
  it("groups by status and counts", () => {
    const { groups, counts } = getBoard();
    expect(counts.kit_ready).toBe(1); // only the pre-scanned one (Coinbase)
    expect(counts.kit_only).toBe(1);  // Linear - kit written but not pre-scanned
    expect(counts.applied).toBe(1);
    expect(counts.rejected).toBe(1);
    const ready = groups.find((g) => g.status === "kit_ready");
    expect(ready?.rows.map((r) => r.company)).toEqual(["Coinbase"]);
    const notReady = groups.find((g) => g.status === "kit_only");
    expect(notReady?.rows.map((r) => r.company)).toEqual(["Linear"]);
  });

  it("orders stages canonically (ready before applied, archived last)", () => {
    // Rejected + disliked now merge into the "archived" group at the bottom.
    const order = getBoard().groups.map((g) => g.status);
    expect(order.indexOf("kit_ready")).toBeLessThan(order.indexOf("applied"));
    expect(order.indexOf("applied")).toBeLessThan(order.indexOf("archived"));
    const archived = getBoard().groups.find((g) => g.status === "archived");
    expect(archived?.rows.map((r) => r.company)).toContain("Old Co"); // the rejected row lives here now
  });
});

