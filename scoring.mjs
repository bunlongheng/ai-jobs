// scoring.mjs - shared scoring + insert pipeline for the job scrapers
// (scrape_linkedin.mjs, scrape_indeed.mjs). No deps beyond better-sqlite3.
//
// Rubric (profile.json scoring.weights, 0-100):
//   title_seniority_match 25 | stack_overlap 25 | remote_comp_fit 20
//   domain_relevance 15 | company_quality 15
// Owner rules: insert threshold 50; salary floor 140k (no penalty 140-160k);
// remote + hybrid OK (hybrid scored slightly below remote, never disqualified);
// any tech_exclude / employment_exclude word-boundary hit disqualifies to 0.

import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const ROOT = dirname(fileURLToPath(import.meta.url));
const Database = require(join(ROOT, "web/node_modules/better-sqlite3"));

export const DB_PATH = process.env.JOBS_DB || join(ROOT, "web/jobs.db");
export const PROFILE_PATH = process.env.PROFILE_PATH || join(ROOT, "profile.json");
export const INSERT_THRESHOLD = 50; // score >= 50 inserts
export const SHOW_THRESHOLD = 40;   // summary table shows >= 40

const GENERIC_GLOBE_MD5 = "b8a0bf372c762e966cc99ede8682bc71";

export function loadProfile() {
  // Fall back to the committed example so a fresh clone (no `npm run setup` yet) still works,
  // and so CI can score without the gitignored profile.json present.
  const p = existsSync(PROFILE_PATH) ? PROFILE_PATH : join(ROOT, "profile.example.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

export function openDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  // Create the tables on a fresh clone so a scraper works before the app has ever run.
  // Same schema.sql the app loads - single source of truth. (open-source fix 2026-08-11)
  db.exec(readFileSync(join(ROOT, "web/lib/schema.sql"), "utf8"));
  return db;
}

// Word-boundary match that works for plain words AND tokens like "c#", ".net",
// "node.js". "rust" must not match "trust"; "java" must not match "javascript".
export function wordHit(text, word) {
  const esc = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![a-z0-9#.+])${esc}(?![a-z0-9])`, "i");
  return re.test(text);
}

export function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

export function cleanUrl(u) {
  const q = u.indexOf("?");
  return q === -1 ? u : u.slice(0, q);
}

// Canonical URL for dedupe/storage. Indeed's job identity lives in ?jk=, so it
// must survive; everything else (refId, tracking) is stripped.
export function normUrl(u) {
  if (!u) return "";
  const jk = u.match(/[?&]jk=([0-9a-f]+)/i);
  if (/indeed\.com/i.test(u) && jk) return `https://www.indeed.com/viewjob?jk=${jk[1].toLowerCase()}`;
  // HN "Who is hiring" comment identity lives in ?id= (like Indeed's ?jk=) - keep it.
  const hn = u.match(/[?&]id=(\d+)/);
  if (/news\.ycombinator\.com/i.test(u) && hn) return `https://news.ycombinator.com/item?id=${hn[1]}`;
  return cleanUrl(u);
}

// Parse a salary snippet like "$120,000 - $150,000 a year" -> top annual number.
// Returns null when unknown / hourly / unparseable (unknown never penalizes).
export function salaryTopAnnual(s) {
  if (!s || !/year|annual|yr/i.test(s)) return null;
  const nums = [...s.matchAll(/\$?([\d,]+(?:\.\d+)?)\s*([kK])?/g)]
    .map((m) => parseFloat(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1))
    .filter((n) => n > 1000);
  return nums.length ? Math.max(...nums) : null;
}

// job: { title, company, location, url, salary?, remoteHint? }
// remoteHint: "remote" | "hybrid" | "" (from the source's own filter/labels)
export function scoreJob(job, profile) {
  const techExclude = profile.tech_exclude || [];
  const empExclude = profile.employment_exclude || [];
  const stackWords = Object.values(profile.stack || {}).flat();
  const text = `${job.title} ${job.location || ""} ${job.salary || ""}`.toLowerCase();

  // Hard disqualifiers (hybrid is NOT one - owner rule).
  for (const w of [...techExclude, ...empExclude]) {
    if (wordHit(text, w)) return { score: 0, reason: `excluded: ${w}` };
  }

  let score = 0;
  const t = job.title.toLowerCase();

  // title_seniority_match (25)
  if (wordHit(t, "staff") || wordHit(t, "principal")) score += 25;
  else if (wordHit(t, "senior") || wordHit(t, "sr")) score += 22;
  else if (wordHit(t, "lead")) score += 14;
  else score += 5;

  // stack_overlap (25) - word-boundary hits of profile stack keywords
  let hits = 0;
  for (const w of stackWords) if (wordHit(text, w)) hits++;
  if (wordHit(text, "node") || wordHit(text, "nodejs")) hits++; // node.js alias
  if (wordHit(text, "fullstack")) hits++;
  score += Math.min(25, hits * 9);

  // remote_comp_fit (20): remote 20, hybrid 16 (slightly below, never DQ),
  // unknown 14. Salary floor 140k: only penalize when a known annual top < 140k.
  const loc = `${job.location || ""} ${job.title}`.toLowerCase();
  const isRemote = job.remoteHint === "remote" || /remote/.test(loc);
  const isHybrid = job.remoteHint === "hybrid" || /hybrid/.test(loc);
  let comp = isRemote ? 20 : isHybrid ? 16 : 14;
  const top = salaryTopAnnual(job.salary);
  if (top !== null && top < 140000) comp = Math.min(comp, 6);
  score += comp;

  // domain_relevance (15) - role shape matches full-stack/web IC work
  if (/full[ -]?stack/i.test(t)) score += 15;
  else if (/front[ -]?end|back[ -]?end|web|platform|product/i.test(t)) score += 12;
  else if (/software engineer|swe/i.test(t)) score += 10;
  else score += 3;

  // company_quality (15) - unknown at card level; neutral baseline
  score += 8;

  return { score: Math.min(100, score), reason: "" };
}

// ---------- logos (pattern from web/lib/logos.ts) ----------
export async function fetchLogo(company) {
  const domain = company.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".com";
  try {
    const r = await fetch(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 120) return null;
    if (crypto.createHash("md5").update(buf).digest("hex") === GENERIC_GLOBE_MD5) return null;
    return "data:image/png;base64," + buf.toString("base64");
  } catch {
    return null;
  }
}

// ---------- dedupe + insert pipeline ----------
// jobs: [{ title, company, location, url, salary?, remoteHint? }]
// Returns { results, deduped, inserted } where results carry {score, insertedThis}.
export async function scoreDedupeInsert(db, jobs, profile, sourceRun, sourceNote, minScore = INSERT_THRESHOLD) {
  const existing = db.prepare("SELECT id, url, company, title FROM applications").all();
  const existingUrls = new Set(
    existing.map((r) => normUrl((r.url || "").toLowerCase())).filter((u) => u && u !== "n/a")
  );
  const existingCoTitle = new Set(
    existing.map((r) => `${(r.company || "").toLowerCase()}|${(r.title || "").toLowerCase()}`)
  );
  const existingIds = new Set(existing.map((r) => r.id));

  const insertApp = db.prepare(
    `INSERT INTO applications (id, company, title, score, status, url, location, source_run, notes, easy_apply)
     VALUES (?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?)`
  );
  const hasLogo = db.prepare("SELECT 1 FROM logos WHERE company = ?");
  const insertLogo = db.prepare(
    "INSERT INTO logos (company, data_uri, updated_at) VALUES (?, ?, datetime('now'))"
  );
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let deduped = 0, inserted = 0, skippedNoUrl = 0;
  const results = [];
  for (const job of jobs) {
    // never accept an empty/invalid source URL - a job with no real link can't be
    // applied to and shows a "-" src on the board (owner rule 2026-07-24)
    if (!job.url || !/^https?:\/\//i.test(String(job.url))) { skippedNoUrl++; continue; }
    const { score } = scoreJob(job, profile);
    const isDupe =
      existingUrls.has(normUrl(job.url).toLowerCase()) ||
      existingCoTitle.has(`${job.company.toLowerCase()}|${job.title.toLowerCase()}`);
    if (isDupe) {
      deduped++;
      continue;
    }
    let insertedThis = false;
    if (score >= minScore) {
      let id = slug(`${job.company}-${job.title}`);
      let n = 2;
      while (existingIds.has(id)) id = slug(`${job.company}-${job.title}`) + `-${n++}`;
      existingIds.add(id);
      insertApp.run(id, job.company, job.title, score, normUrl(job.url), job.location || "", sourceRun, sourceNote, job.easy_apply ? 1 : 0);
      existingCoTitle.add(`${job.company.toLowerCase()}|${job.title.toLowerCase()}`);
      existingUrls.add(normUrl(job.url).toLowerCase());
      inserted++;
      insertedThis = true;
      if (!hasLogo.get(job.company)) {
        const uri = await fetchLogo(job.company);
        insertLogo.run(job.company, uri);
        await sleep(400);
      }
    }
    results.push({ ...job, score, insertedThis });
  }
  return { results, deduped, inserted, skippedNoUrl };
}

export function printSummary(results, counts, walls) {
  const show = results.filter((r) => r.score >= SHOW_THRESHOLD).sort((a, b) => b.score - a.score);
  console.log("\nscore | company | title | url");
  console.log("------|---------|-------|----");
  for (const r of show) {
    const mark = r.insertedThis ? "" : " [NOT INSERTED]";
    console.log(`${String(r.score).padStart(5)} | ${r.company} | ${r.title}${mark} | ${r.url}`);
  }
  if (show.length === 0) console.log(`(no jobs scored >= ${SHOW_THRESHOLD})`);
  console.log(
    `\nfetched pages: ${counts.fetched}  parsed: ${counts.parsed}  deduped: ${counts.deduped}  inserted: ${counts.inserted}`
  );
  if (walls.length) {
    console.log("\nWALLS ENCOUNTERED:");
    for (const w of walls) console.log("  - " + w);
  }
}
