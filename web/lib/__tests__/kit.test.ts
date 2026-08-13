import { describe, it, expect, beforeAll } from "vitest";
import os from "os"; import path from "path";

const TMP = path.join(os.tmpdir(), `jobs-kit-${Date.now()}.db`);
process.env.JOBS_DB = TMP;
let getKit: typeof import("../kit").getKit; let dbFn: typeof import("../db").db;

beforeAll(async () => {
  ({ db: dbFn } = await import("../db"));
  ({ getKit } = await import("../kit"));
  dbFn().prepare("INSERT INTO applications (id, status, resume_md, screening_md) VALUES (?,?,?,?)").run(
    "k", "kit_ready",
    "# Resume\n**Alex** builds things.\n\n<img src=x onerror=alert(1)>",
    "| Field | Answer |\n|---|---|\n| Name | Alex |",
  );
});

describe("getKit", () => {
  it("renders markdown to HTML", () => {
    const k = getKit("k");
    expect(k.resumeHtml).toContain("<strong>Alex</strong>");
    expect(k.screeningHtml).toContain("<table");
  });
  it("sanitizes dangerous markup (no onerror)", () => {
    const k = getKit("k");
    expect(k.resumeHtml).not.toContain("onerror");
  });
  it("usedMaster when no content", () => {
    dbFn().prepare("INSERT INTO applications (id, status) VALUES (?,?)").run("empty", "planned");
    expect(getKit("empty").usedMaster).toBe(true);
  });
});
