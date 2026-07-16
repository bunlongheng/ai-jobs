#!/usr/bin/env node
/**
 * scrape_indeed.mjs - pull job cards from Indeed via a real (Playwright) browser.
 * Anonymous / logged-out. No API, no token (Indeed has none for job seekers).
 *
 * Usage:
 *   node scrape_indeed.mjs "Senior Full Stack Engineer" [--location Remote] [--pages 1] [--headful]
 *
 * Emits normalized job records as JSON on stdout. Personal, low-volume use.
 * Indeed has bot detection; if it walls us, we report it instead of faking data.
 */
import { createRequire } from 'module';
// Resolve Playwright from wherever it is installed (honors NODE_PATH). Falls back
// to the bheng project's node_modules so this works without a local install.
const require = createRequire(import.meta.url);
let chromium;
for (const p of [process.env.PLAYWRIGHT_PATH, 'playwright',
                 process.env.HOME + '/Sites/bheng/node_modules/playwright']) {
  if (!p) continue;
  try { ({ chromium } = require(p)); break; } catch (_) {}
}
if (!chromium) { console.error(JSON.stringify({ error: 'playwright not found (set PLAYWRIGHT_PATH or install it)' })); process.exit(1); }

const args = process.argv.slice(2);
if (!args[0]) { console.error('usage: node scrape_indeed.mjs "<keywords>" [--location X] [--pages N] [--headful]'); process.exit(1); }
const kw = args[0];
let location = 'Remote', pages = 1, headful = false;
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--location') location = args[++i];
  else if (args[i] === '--pages') pages = Math.max(1, parseInt(args[++i]) || 1);
  else if (args[i] === '--headful') headful = true;
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const jobs = [];
const seen = new Set();
let blocked = false;

const browser = await chromium.launch({ headless: !headful, args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 }, locale: 'en-US' });
const page = await ctx.newPage();

try {
  for (let p = 0; p < pages; p++) {
    const start = p * 10;
    const url = `https://www.indeed.com/jobs?q=${encodeURIComponent(kw)}&l=${encodeURIComponent(location)}&start=${start}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1500 + Math.floor(Math.random() * 1500));

    const title = (await page.title()).toLowerCase();
    const bodyTxt = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
    if (title.includes('just a moment') || bodyTxt.includes('verify you are human') ||
        bodyTxt.includes('additional verification') || bodyTxt.includes('unusual traffic')) {
      blocked = true; break;
    }

    const cards = await page.$$eval('div.job_seen_beacon, [data-testid="slider_item"], td.resultContent', (els) => {
      const pick = (el, sels) => { for (const s of sels) { const n = el.querySelector(s); if (n && n.innerText.trim()) return n.innerText.trim(); } return ''; };
      return els.map(el => {
        const a = el.querySelector('h2.jobTitle a, a.jcs-JobTitle, h2 a');
        const href = a ? a.getAttribute('href') : '';
        return {
          title: pick(el, ['h2.jobTitle span[title]', 'h2.jobTitle a', 'h2.jobTitle', '.jobTitle']),
          company: pick(el, ['[data-testid="company-name"]', '.companyName', 'span.companyName']),
          location: pick(el, ['[data-testid="text-location"]', '.companyLocation']),
          salary: pick(el, ['[data-testid="attribute_snippet_testid"]', '.salary-snippet-container', '.metadata.salary-snippet-container']),
          href,
        };
      }).filter(j => j.title && j.href);
    }).catch(() => []);

    for (const c of cards) {
      const jk = (c.href.match(/[?&]jk=([0-9a-f]+)/) || [])[1];
      const url2 = jk ? `https://www.indeed.com/viewjob?jk=${jk}` :
        (c.href.startsWith('http') ? c.href : `https://www.indeed.com${c.href}`);
      if (seen.has(url2)) continue;
      seen.add(url2);
      jobs.push({ source: 'indeed', title: c.title, company: c.company || 'n/a',
        location: c.location || 'n/a', salary: c.salary || 'n/a', url: url2, posted: 'n/a' });
    }
    if (!cards.length) break;
    await sleep(2000);
  }
} catch (e) {
  console.error(JSON.stringify({ error: String(e).slice(0, 160) }));
} finally {
  await browser.close();
}

console.log(JSON.stringify({ query: kw, location, blocked, count: jobs.length, jobs }, null, 2));
