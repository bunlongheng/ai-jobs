import { describe, it, expect } from "vitest";
// scoring.mjs lives at the repo root and is the shared scorer for every scraper.
import { slug, cleanUrl, normUrl, scoreJob, loadProfile, wordHit, salaryTopAnnual } from "../../../scoring.mjs";

describe("scoring helpers", () => {
  it("slug: lowercases, dashes non-alnum, trims edges", () => {
    expect(slug("Harris Allied - Senior SWE!")).toBe("harris-allied-senior-swe");
    expect(slug("  A.B/C  ")).toBe("a-b-c");
  });

  it("cleanUrl: strips the query string", () => {
    expect(cleanUrl("https://x.com/a?b=1&c=2")).toBe("https://x.com/a");
    expect(cleanUrl("https://x.com/a")).toBe("https://x.com/a");
  });

  it("normUrl: strips tracking but preserves Indeed jk + HN id identity", () => {
    expect(normUrl("https://www.linkedin.com/jobs/view/123?trk=x")).toBe("https://www.linkedin.com/jobs/view/123");
    expect(normUrl("https://www.indeed.com/viewjob?jk=AB12CD&from=serp")).toBe("https://www.indeed.com/viewjob?jk=ab12cd");
    expect(normUrl("https://news.ycombinator.com/item?id=49156683&ref=x")).toBe("https://news.ycombinator.com/item?id=49156683");
    expect(normUrl("")).toBe("");
  });

  it("wordHit: token-aware boundaries (no false 'rust' in 'trust', no 'java' in 'javascript')", () => {
    expect(wordHit("we value trust and grit", "rust")).toBe(false);
    expect(wordHit("built in rust and go", "rust")).toBe(true);
    expect(wordHit("deep javascript experience", "java")).toBe(false);
    expect(wordHit("jvm and java 21", "java")).toBe(true);
    expect(wordHit("strong c# and .net", "c#")).toBe(true);
    expect(wordHit("node.js on the backend", "node.js")).toBe(true);
  });

  it("salaryTopAnnual: parses annual ranges, ignores hourly/unknown", () => {
    expect(salaryTopAnnual("$120,000 - $150,000 a year")).toBe(150000);
    expect(salaryTopAnnual("$180K/year")).toBe(180000);
    expect(salaryTopAnnual("$60 an hour")).toBeNull();
    expect(salaryTopAnnual("competitive")).toBeNull();
    expect(salaryTopAnnual("")).toBeNull();
  });

  it("scoreJob: numeric 0-100, excluded words disqualify, remote beats hybrid", () => {
    const profile = loadProfile();
    const base = { company: "Acme", location: "Remote", url: "https://acme.com" };
    const r = scoreJob({ ...base, title: "Senior Full Stack Engineer" }, profile);
    expect(typeof r.score).toBe("number");
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    // an employment_exclude / tech_exclude word forces a hard 0
    const exWord = (profile.employment_exclude || profile.tech_exclude || [])[0];
    if (exWord) {
      const ex = scoreJob({ ...base, title: `Senior Engineer ${exWord}` }, profile);
      expect(ex.score).toBe(0);
    }
    const remote = scoreJob({ title: "Senior Full Stack Engineer", company: "A", location: "", url: "", remoteHint: "remote" }, profile).score;
    const hybrid = scoreJob({ title: "Senior Full Stack Engineer", company: "A", location: "", url: "", remoteHint: "hybrid" }, profile).score;
    expect(remote).toBeGreaterThanOrEqual(hybrid);
  });
});
