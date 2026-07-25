import { describe, it, expect } from "vitest";
// scoring.mjs lives at the repo root and is the shared scorer for every scraper.
import { slug, cleanUrl, normUrl, scoreJob, loadProfile } from "../../../scoring.mjs";

describe("scoring helpers", () => {
  it("slug: lowercases, dashes non-alnum, trims edges", () => {
    expect(slug("Harris Allied - Senior SWE!")).toBe("harris-allied-senior-swe");
    expect(slug("  A.B/C  ")).toBe("a-b-c");
  });

  it("cleanUrl: strips the query string", () => {
    expect(cleanUrl("https://x.com/a?b=1&c=2")).toBe("https://x.com/a");
    expect(cleanUrl("https://x.com/a")).toBe("https://x.com/a");
  });

  it("normUrl: strips tracking but preserves Indeed's jk identity", () => {
    expect(normUrl("https://www.linkedin.com/jobs/view/123?trk=x")).toBe("https://www.linkedin.com/jobs/view/123");
    expect(normUrl("https://www.indeed.com/viewjob?jk=AB12CD&from=serp")).toBe("https://www.indeed.com/viewjob?jk=ab12cd");
    expect(normUrl("")).toBe("");
  });

  it("scoreJob: returns a 0-100 numeric score against the real profile", () => {
    const profile = loadProfile();
    const r = scoreJob({ title: "Senior Full Stack Engineer", company: "Acme", location: "Remote", url: "https://acme.com" }, profile);
    expect(typeof r.score).toBe("number");
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
