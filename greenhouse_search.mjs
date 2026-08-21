// greenhouse_search.mjs - source adapter #4: direct Greenhouse ATS boards.
// Queries each company's PUBLIC boards-api.greenhouse.io board (zero auth, zero LLM
// tokens), pulls engineering roles, and hands them to the SHARED scoring/dedupe/insert
// pipeline (scoring.mjs) - same contract as scrape_linkedin/indeed/hn. The absolute_url
// is a DIRECT ATS apply page (the green, extension-autofillable kind). Re-runs are safe
// (dedupe by normUrl + company|title), so a daily cron inserts new reqs and no-ops the rest.
// Board list lives in greenhouse_boards.json (verified live tokens); add/remove there.

import { openDb, loadProfile, scoreDedupeInsert, printSummary } from "./scoring.mjs";
import { readFileSync } from "node:fs";

const UA = { "User-Agent": "Mozilla/5.0 jobs-gh-adapter" };
const BOARDS = JSON.parse(readFileSync(new URL("./greenhouse_boards.json", import.meta.url), "utf8"));

// Keep only REMOTE senior/staff IC engineering roles (owner's profile: remote preferred,
// SF/NYC hybrid does not work from NH; no people-management). scoreJob still applies the
// full rubric + >=50 threshold on top.
const ENG = /\b(software|engineer|engineering|developer|full[\s-]?stack|front[\s-]?end|back[\s-]?end|swe|web|platform|infrastructure)\b/i;
const SENIOR = /\b(senior|sr\.?|staff|principal|lead)\b/i;
const MGMT = /\b(manager|director|head of|vp|vice president|people lead|em)\b/i;

async function fetchBoard(b) {
  try {
    const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${b.token}/jobs`, { headers: UA });
    if (!r.ok) return [];
    const { jobs } = await r.json();
    return (jobs || [])
      .filter((j) => {
        const t = j.title || "";
        const loc = (j.location && j.location.name) || "";
        return ENG.test(t) && SENIOR.test(t) && !MGMT.test(t) && /\bremote\b/i.test(loc);
      })
      .map((j) => {
        const loc = (j.location && j.location.name) || "";
        return {
          title: j.title,
          company: b.name,
          location: loc,
          url: j.absolute_url,
          remoteHint: /remote/i.test(loc) ? "remote" : /hybrid/i.test(loc) ? "hybrid" : "",
        };
      });
  } catch {
    return [];
  }
}

async function main() {
  const jobs = [];
  for (const b of BOARDS) {
    const js = await fetchBoard(b);
    jobs.push(...js);
    await new Promise((r) => setTimeout(r, 150)); // gentle pacing between boards
  }
  console.log(`boards: ${BOARDS.length}  engineering roles pulled: ${jobs.length}`);

  const db = openDb();
  const profile = loadProfile();
  const today = new Date().toISOString().slice(0, 10);
  // Direct-ATS boards are a rich source - hold them to a higher bar (60) than the
  // LinkedIn/HN default (50) so only strong remote senior/staff matches land.
  const { results, deduped, inserted, skippedNoUrl, blockedSkipped } = await scoreDedupeInsert(
    db, jobs, profile, `greenhouse-${today}`, "Greenhouse boards", 60
  );
  printSummary(results, { fetched: BOARDS.length, parsed: jobs.length, deduped, inserted, blockedSkipped }, []);
  console.log(`skipped (no url): ${skippedNoUrl}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
