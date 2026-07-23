import { describe, it, expect } from "vitest";
// domainFor is internal; test the exported getLogo returns null for uncached, and
// the domain map covers key companies via a re-export shim.
import { getLogo } from "../logos";
process.env.JOBS_DB = ":memory:";

describe("logos", () => {
  it("getLogo returns null for an uncached company", () => {
    expect(getLogo("Nonexistent Co")).toBeNull();
    expect(getLogo(null)).toBeNull();
  });
});
