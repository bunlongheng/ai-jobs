#!/usr/bin/env node
// scrape_linkedin.mjs - LinkedIn guest-API job scraper (no login, no cookies).
// Fetches public job cards (remote + hybrid), scores them against profile.json
// via scoring.mjs, dedupes against jobs.db, inserts >=50 matches, caches logos.
//
// Usage: node scrape_linkedin.mjs [--limit 60]

import {
  loadProfile, openDb, cleanUrl, scoreDedupeInsert, printSummary,
} from "/Users/bheng/Sites/jobs/scoring.mjs";

const BASE = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const RATE_MS = 2000;
const PAGE_SIZE = 25;

const args = process.argv.slice(2);
let LIMIT = 60;
const li = args.indexOf("--limit");
if (li !== -1 && args[li + 1]) LIMIT = Math.max(1, parseInt(args[li + 1], 10) || 60);

// Keyword queries built from profile targets.titles + stack emphasis.
const QUERIES = [
  "staff software engineer",
  "senior full stack engineer typescript",
  "staff frontend engineer react",
  "principal software engineer node",
  "senior software engineer react node",
  // AI-assisted / build-with-AI product roles (owner target 2026-08-03, e.g. Origami "AI Product Engineer")
  "AI product engineer",
  "AI engineer full stack",
  "forward deployed engineer",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ");
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

async function fetchPage(keywords, start) {
  const qs = new URLSearchParams({
    keywords,
    location: "United States",
    f_WT: "2,3", // 2 = remote, 3 = hybrid (owner rule: hybrid up to 2 days/week OK)
    start: String(start),
  });
  return fetch(`${BASE}?${qs}`, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "manual",
  });
}

function parseCards(html) {
  const out = [];
  const chunks = html.split(/<li[^>]*>/).slice(1);
  for (const c of chunks) {
    const grab = (re) => {
      const m = c.match(re);
      return m ? stripTags(m[1]) : "";
    };
    const title = grab(/class="base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/);
    const company = grab(/class="base-search-card__subtitle[^"]*"[^>]*>([\s\S]*?)<\/h4>/);
    const location = grab(/class="job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    const posted = (c.match(/datetime="([^"]+)"/) || [])[1] || "";
    const urlM = c.match(/href="(https:\/\/[a-z.]*linkedin\.com\/jobs\/view\/[^"]+)"/);
    const url = urlM ? cleanUrl(decodeEntities(urlM[1])) : "";
    if (title && company && url) out.push({ title, company, location, posted, url, easy_apply: /easy apply/i.test(c) ? 1 : 0 });
  }
  return out;
}

async function main() {
  const profile = loadProfile();
  const db = openDb();
  const today = new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD

  let fetched = 0, parsed = 0;
  const walls = [];
  const seen = new Set();
  const jobs = [];
  const perQuery = Math.ceil(LIMIT / QUERIES.length);

  outer: for (const q of QUERIES) {
    for (let start = 0; start < perQuery; start += PAGE_SIZE) {
      let res;
      try {
        res = await fetchPage(q, start);
      } catch (e) {
        walls.push(`"${q}" start=${start}: network error ${e.message}`);
        break;
      }
      fetched++;
      if (res.status === 429 || res.status === 999) {
        walls.push(`"${q}" start=${start}: HTTP ${res.status} (rate-limited/blocked)`);
        break;
      }
      if (res.status >= 300 && res.status < 400) {
        walls.push(`"${q}" start=${start}: HTTP ${res.status} redirect -> ${res.headers.get("location") || "?"}`);
        break;
      }
      if (!res.ok) {
        walls.push(`"${q}" start=${start}: HTTP ${res.status}`);
        break;
      }
      const html = await res.text();
      const cards = parseCards(html);
      if (cards.length === 0) break;
      for (const job of cards) {
        if (seen.has(job.url)) continue;
        seen.add(job.url);
        parsed++;
        jobs.push({ ...job, remoteHint: "" }); // f_WT=2,3 - card text decides remote vs hybrid
        if (jobs.length >= LIMIT) break outer;
      }
      await sleep(RATE_MS);
    }
    await sleep(RATE_MS);
  }

  const { results, deduped, inserted } = await scoreDedupeInsert(
    db, jobs, profile, `linkedin-${today}`, "from LinkedIn guest scrape"
  );
  printSummary(results, { fetched, parsed, deduped, inserted }, walls);
  db.close();
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
