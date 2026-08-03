// hn_search.mjs - source adapter #3: Hacker News "Ask HN: Who is hiring?"
// Uses the public Algolia HN API (no scraping, no ToS risk). Finds the latest
// monthly thread, parses each top-level comment into a normalized job, and hands
// them to the SHARED scoring/dedupe/insert pipeline (scoring.mjs) - same contract
// as scrape_linkedin.mjs / scrape_indeed.mjs. Re-runs are safe (dedupe by url +
// company|title), so a daily cron on the monthly thread inserts once then no-ops.

import { openDb, loadProfile, scoreDedupeInsert, printSummary } from "./scoring.mjs";

const ALGOLIA = "https://hn.algolia.com/api/v1";
const UA = { "User-Agent": "Mozilla/5.0 jobs-hn-adapter" };

// Roles we care about (the shared scoreJob still does the real filtering + threshold).
const ROLE_RE = /((?:senior|sr\.?|staff|principal|lead)\s+)?(?:full[\s-]?stack|front[\s-]?end|back[\s-]?end|software|web|platform)\s+(?:engineer|developer)|(?:full[\s-]?stack|software)\s+engineer/i;

function unescapeHtml(s) {
  return s
    .replace(/<a\b[^>]*>(.*?)<\/a>/gis, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x2f;/gi, "/").replace(/&#x27;|&#39;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ").trim();
}

const clean = (s) => s.replace(/\s+/g, " ").trim().replace(/[,:;|.\-]+$/, "").trim().slice(0, 45);
const looksBad = (co) =>
  !co || co.length < 2 ||
  /\b(hiring|we['’]re|we are|change this|following|job title|is hiring|apply|looking for|our team|position)\b/i.test(co) ||
  co.split(" ").length > 6 || ROLE_RE.test(co); // a company should not read like a role/sentence

function extractCompany(text) {
  // "Company: X | Job title: Y ..."  or  "Company - X"
  let m = text.match(/^company:?\s*([^|•]+?)(?:\s+(?:job title|role|position|location|about)\b|\s*[|•]|$)/i);
  if (m && !looksBad(clean(m[1]))) return clean(m[1]);
  // "At <Company> we're / is / are hiring ..."
  m = text.match(/^at\s+([A-Z][\w.&'’ -]{1,40}?)\s+(?:we|is|are|hiring|\()/);
  if (m && !looksBad(clean(m[1]))) return clean(m[1]);
  // default: first delimited segment, parens stripped ("Acme (YC S23) | ..." -> "Acme")
  const seg = text.split(/[|•·]|\s[—–-]\s/)[0].replace(/\s*\(.*?\)\s*/g, " ").trim();
  return clean(seg);
}

function parseComment(c) {
  const html = c.text || "";
  if (!html) return null;
  const text = unescapeHtml(html);
  if (text.length < 20) return null;

  const role = text.match(ROLE_RE);
  if (!role) return null; // not a role posting we track

  const company = extractCompany(text);
  if (looksBad(company) || /^https?:/i.test(company)) return null; // drop garbage, don't insert it

  const remoteHint = /\bremote\b/i.test(text) ? "remote" : /\bhybrid\b/i.test(text) ? "hybrid" : "";
  const sal = text.match(/\$\s?\d{2,3}[k,]\d{0,3}k?(?:\s*[-–to]+\s*\$?\s?\d{2,3}[k,]?\d{0,3}k?)?/i);
  // Canonical URL = the HN comment permalink: unique per posting, keeps HN as the
  // visible source, and the comment itself carries the apply link/email.
  const url = `https://news.ycombinator.com/item?id=${c.id}`;

  return {
    company,
    title: role[0].replace(/\s+/g, " ").trim(),
    location: remoteHint === "remote" ? "Remote" : "",
    url,
    remoteHint,
    salary: sal ? sal[0] : "",
  };
}

async function latestThread() {
  const r = await fetch(`${ALGOLIA}/search_by_date?tags=story,author_whoishiring&query=who%20is%20hiring&hitsPerPage=10`, { headers: UA });
  const { hits } = await r.json();
  const hit = (hits || []).find((h) => /who is hiring/i.test(h.title || "") && !/wants to be hired|freelancer/i.test(h.title || ""));
  return hit ? { id: hit.objectID, title: hit.title } : null;
}

async function main() {
  const thread = await latestThread();
  if (!thread) { console.error("no 'Who is hiring?' thread found"); process.exit(1); }
  console.log(`thread: "${thread.title}" (id ${thread.id})`);

  const r = await fetch(`${ALGOLIA}/items/${thread.id}`, { headers: UA });
  const item = await r.json();
  const comments = (item.children || []).filter((c) => c && c.text);

  const jobs = [];
  for (const c of comments) { const j = parseComment(c); if (j) jobs.push(j); }
  console.log(`comments: ${comments.length}  parsed as roles: ${jobs.length}`);

  const db = openDb();
  const profile = loadProfile();
  const today = new Date().toISOString().slice(0, 10);
  const { results, deduped, inserted, skippedNoUrl } = await scoreDedupeInsert(
    db, jobs, profile, `hackernews-${today}`, "HN Who is Hiring"
  );
  printSummary(results, { fetched: 1, parsed: jobs.length, deduped, inserted }, []);
  console.log(`skipped (no url): ${skippedNoUrl}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
