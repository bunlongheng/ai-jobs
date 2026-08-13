#!/usr/bin/env node
/**
 * scrape_indeed.mjs - pull job cards from Indeed via a real (Playwright) browser.
 * Anonymous / logged-out. No API, no token (Indeed has none for job seekers).
 *
 * Now a full pipeline: multi-query fetch -> score (scoring.mjs) -> dedupe vs
 * jobs.db -> insert score >= 50 -> logo cache -> ranked summary.
 *
 * Usage:
 *   node scrape_indeed.mjs [--limit 60] [--headful] ["override keywords"]
 *
 * Indeed has bot detection (Cloudflare); if it walls us, we report it honestly
 * instead of faking data. Headless first; retry with --headful if walled.
 */
import { createRequire } from 'module';
import {
  loadProfile, openDb, scoreDedupeInsert, printSummary,
} from './scoring.mjs';

// Resolve Playwright from wherever it is installed (honors PLAYWRIGHT_PATH).
// Falls back to the bheng project's node_modules so this works without a local install.
const require = createRequire(import.meta.url);
let chromium;
for (const p of [process.env.PLAYWRIGHT_PATH, 'playwright',
                 (process.env.PLAYWRIGHT_PATH || "playwright")]) {
  if (!p) continue;
  try { ({ chromium } = require(p)); break; } catch (_) {}
}
if (!chromium) { console.error(JSON.stringify({ error: 'playwright not found (set PLAYWRIGHT_PATH or install it)' })); process.exit(1); }

const args = process.argv.slice(2);
let LIMIT = 60, headful = false, override = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit') LIMIT = Math.max(1, parseInt(args[++i]) || 60);
  else if (args[i] === '--headful') headful = true;
  else if (!args[i].startsWith('--')) override = args[i];
}

// Broadened queries (owner rule): staff/senior/principal variants + salary-floor
// query. l=Remote pulls remote; l=United States also surfaces hybrid postings.
const QUERIES = override ? [{ q: override, l: 'Remote' }] : [
  { q: 'senior full stack engineer', l: 'Remote' },
  { q: 'staff software engineer', l: 'Remote' },
  { q: 'principal software engineer', l: 'Remote' },
  { q: 'senior software engineer typescript react', l: 'Remote' },
  { q: 'software engineer remote 140000', l: 'United States' },
  { q: 'senior full stack engineer hybrid', l: 'United States' },
  // PHP / Laravel full-stack (owner: Laravel 4->13, 12+ yrs; wants these surfaced 2026-08-05)
  { q: 'senior php laravel engineer', l: 'Remote' },
  { q: 'full stack laravel developer', l: 'United States' },
  // Local on-site/hybrid queries - EDIT these to your own area (or delete this block).
  { q: 'software engineer', l: 'Your City, ST' },
  { q: 'full stack developer', l: 'Your City, ST' },
  { q: 'software engineer', l: 'Your City, ST' },
  // AI-assisted / build-with-AI product roles (owner target 2026-08-03, e.g. Origami "AI Product Engineer")
  { q: 'AI product engineer', l: 'Remote' },
  { q: 'forward deployed engineer', l: 'Remote' },
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PAGES_PER_QUERY = 2; // Indeed serves 10-15 cards/page

async function scrape(headless) {
  const jobs = [];
  const seen = new Set();
  const walls = [];
  let fetched = 0;

  // Prefer real installed Chrome (channel:'chrome') - survives Cloudflare better
  // and avoids needing `npx playwright install`. Fall back to bundled chromium.
  let browser;
  const launchOpts = { headless, args: ['--disable-blink-features=AutomationControlled'] };
  try {
    browser = await chromium.launch({ ...launchOpts, channel: 'chrome' });
  } catch (_) {
    browser = await chromium.launch(launchOpts);
  }
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  const page = await ctx.newPage();

  try {
    outer: for (const { q, l } of QUERIES) {
      for (let p = 0; p < PAGES_PER_QUERY; p++) {
        const start = p * 10;
        const url = `https://www.indeed.com/jobs?q=${encodeURIComponent(q)}&l=${encodeURIComponent(l)}&start=${start}`;
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e) {
          walls.push(`"${q}" start=${start}: ${String(e).slice(0, 120)}`);
          break;
        }
        fetched++;
        await sleep(1500 + Math.floor(Math.random() * 1500));

        const title = (await page.title()).toLowerCase();
        const bodyTxt = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
        if (title.includes('just a moment') || bodyTxt.includes('verify you are human') ||
            bodyTxt.includes('additional verification') || bodyTxt.includes('unusual traffic')) {
          walls.push(`"${q}" start=${start}: Cloudflare/bot wall (page title: "${await page.title()}")`);
          break outer; // walled - no point hammering more queries in this mode
        }

        // NOTE: match ONLY the outer card container. The old selector list
        // (job_seen_beacon + slider_item + resultContent) triple-matched each
        // nested card, and sponsored pagead hrefs are unique per impression -
        // together that inflated raw counts and made everything look duplicated.
        let sel = 'div.job_seen_beacon';
        if ((await page.locator(sel).count()) === 0) sel = '[data-testid="slider_item"], td.resultContent';
        const cards = await page.$$eval(sel, (els) => {
          const pick = (el, sels) => { for (const s of sels) { const n = el.querySelector(s); if (n && n.innerText.trim()) return n.innerText.trim(); } return ''; };
          return els.map(el => {
            const a = el.querySelector('h2.jobTitle a, a.jcs-JobTitle, h2 a');
            const href = a ? a.getAttribute('href') : '';
            const jk = (a && a.getAttribute('data-jk')) ||
              (el.querySelector('[data-jk]') ? el.querySelector('[data-jk]').getAttribute('data-jk') : '') ||
              ((href.match(/[?&]jk=([0-9a-f]+)/) || [])[1] || '');
            return {
              title: pick(el, ['h2.jobTitle span[title]', 'h2.jobTitle a', 'h2.jobTitle', '.jobTitle']),
              company: pick(el, ['[data-testid="company-name"]', '.companyName', 'span.companyName']),
              location: pick(el, ['[data-testid="text-location"]', '.companyLocation']),
              salary: pick(el, ['[data-testid="attribute_snippet_testid"]', '.salary-snippet-container', '.metadata.salary-snippet-container']),
              href, jk,
            };
          }).filter(j => j.title && (j.jk || j.href));
        }).catch(() => []);

        for (const c of cards) {
          // Stable identity = jk job key; pagead tracking URLs change per impression.
          const url2 = c.jk ? `https://www.indeed.com/viewjob?jk=${c.jk}` :
            (c.href.startsWith('http') ? c.href : `https://www.indeed.com${c.href}`);
          const runKey = c.jk || `${c.company}|${c.title}`.toLowerCase();
          if (seen.has(url2) || seen.has(runKey)) continue;
          seen.add(url2); seen.add(runKey);
          jobs.push({
            title: c.title, company: c.company || 'n/a', location: c.location || '',
            salary: c.salary || '', url: url2,
            remoteHint: /remote/i.test(l) ? 'remote' : (/hybrid/i.test(c.location) ? 'hybrid' : ''),
            easy_apply: c.easyApply ? 1 : (/easily apply/i.test(c.cardText || '') ? 1 : 0),
          });
          if (jobs.length >= LIMIT) break outer;
        }
        if (!cards.length) break;
        await sleep(2000);
      }
      await sleep(2000);
    }
  } finally {
    await browser.close();
  }
  return { jobs, walls, fetched };
}

async function main() {
  const profile = loadProfile();
  const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD

  // Headless first; if Cloudflare walls it and the user allows, retry headful.
  let mode = headful ? 'headful' : 'headless';
  let { jobs, walls, fetched } = await scrape(!headful);
  const walled = walls.some(w => w.includes('Cloudflare'));
  if (walled && !headful) {
    console.log('headless walled by Cloudflare - retrying with visible Chrome (headless:false)...');
    mode = 'headful-retry';
    const second = await scrape(false);
    if (second.jobs.length > 0 || !second.walls.some(w => w.includes('Cloudflare'))) {
      ({ jobs, walls, fetched } = second);
    } else {
      walls = [...walls, ...second.walls];
    }
  }
  console.log(`mode: ${mode}  raw cards: ${jobs.length}`);

  const db = openDb();
  const { results, deduped, inserted } = await scoreDedupeInsert(
    db, jobs, profile, `indeed-${today}`, 'from Indeed Playwright scrape'
  );
  printSummary(results, { fetched, parsed: jobs.length, deduped, inserted }, walls);
  db.close();
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
