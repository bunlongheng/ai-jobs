import { describe, it, expect, beforeAll } from "vitest";
import { sessionToken, isValid, checkPassword } from "../auth";

beforeAll(() => {
  process.env.JOBS_SECRET = "test-secret-abc";
  process.env.JOBS_PASSWORD = "hunter2";
});

describe("auth", () => {
  it("a fresh token validates", async () => {
    const t = await sessionToken();
    expect(await isValid(t)).toBe(true);
  });

  it("rejects a wrong / empty token", async () => {
    expect(await isValid("nope")).toBe(false);
    expect(await isValid(undefined)).toBe(false);
    expect(await isValid("")).toBe(false);
  });

  it("token is deterministic per secret and changes with the secret", async () => {
    const a = await sessionToken();
    process.env.JOBS_SECRET = "different-secret";
    const b = await sessionToken();
    expect(a).not.toBe(b);
    process.env.JOBS_SECRET = "test-secret-abc";
  });

  it("checkPassword is exact-match only", () => {
    expect(checkPassword("hunter2")).toBe(true);
    expect(checkPassword("hunter")).toBe(false);
    expect(checkPassword("hunter22")).toBe(false);
    expect(checkPassword("")).toBe(false);
  });
});
