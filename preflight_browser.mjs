#!/usr/bin/env node
/**
 * preflight_browser.mjs - READ-ONLY form audit for ATS pages with no public API.
 *
 * Opens the apply URL headlessly, follows an Indeed "apply on company site"
 * hop when present, clicks a bare Apply button if the form is behind one, then
 * ENUMERATES the form fields (labels, types, required, select options) without
 * typing a single value. Never fills, never submits, never logs in.
 *
 * Output: one JSON object on stdout:
 *   { url, finalUrl, wall: null|"login"|"captcha"|"none-found", fields: [...] }
 *
 * Usage: node preflight_browser.mjs <url>
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
for (const p of [process.env.PLAYWRIGHT_PATH, 'playwright',
                 process.env.HOME + '/Sites/bheng/node_modules/playwright']) {
  if (!p) continue;
  try { ({ chromium } = require(p)); break; } catch (_) {}
}
if (!chromium) { console.log(JSON.stringify({ error: 'playwright not found' })); process.exit(0); }

const url = process.argv[2];
if (!url) { console.log(JSON.stringify({ error: 'usage: preflight_browser.mjs <url>' })); process.exit(0); }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 1600 }, locale: 'en-US' });
const page = await ctx.newPage();
const out = { url, finalUrl: '', wall: null, fields: [] };

const wallOf = async () => {
  const t = ((await page.locator('body').innerText().catch(() => '')) || '').toLowerCase();
  const u = page.url().toLowerCase();
  if (/just a moment|verify you are human|unusual traffic|additional verification/.test(t)) return 'captcha';
  if (/\/login|\/signin|sign in to continue|create an account to apply|log in to apply|password/.test(u + ' ' + t.slice(0, 3000))
      && !(await page.locator('input[type=file], textarea').count().catch(() => 0))) return 'login';
  return null;
};

const enumerate = () => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('input,textarea,select').forEach((el) => {
    if (el.type === 'hidden' || el.type === 'password') return;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    let label = (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('aria-label') || '';
    if (!label) {
      const lb = el.getAttribute('aria-labelledby');
      if (lb) label = lb.split(/\s+/).map(i => document.getElementById(i)?.innerText || '').join(' ');
    }
    if (!label) label = el.placeholder || el.name || '';
    const required = el.required || el.getAttribute('aria-required') === 'true' || /\*/.test(label);
    const options = el.tagName === 'SELECT'
      ? [...el.options].map(o => o.text.trim()).filter(t => t && !/^select/i.test(t)).slice(0, 25) : [];
    label = (label || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    if (label) out.push({ label, type: (el.type || el.tagName).toLowerCase(), required, options });
  });
  return out;
});

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await sleep(2500);

  // Indeed hop: follow "apply on company site" to the real ATS
  if (/indeed\.com/.test(page.url())) {
    const w = await wallOf();
    if (w === 'captcha') { out.wall = 'captcha'; out.finalUrl = page.url(); throw 'walled'; }
    let href = await page.evaluate(() => {
      const a = document.querySelector('a[href*="applystart"], [data-testid*="applyButton"] a, a[aria-label*="company site"]');
      return a ? a.href : null;
    });
    if (!href) {
      // the Apply button is JS-only; the target lives in the embedded page JSON
      const html = await page.content();
      const m = html.match(/"applyUrl":"([^"]{10,500})"/) || html.match(/href="(https?:\/\/www\.indeed\.com\/applystart[^"]+)"/);
      if (m) href = m[1].replace(/&amp;/g, '&').replace(/\\u002[Ff]/g, '/').replace(/\\u0026/g, '&');
    }
    if (href) { await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {}); await sleep(4000); }
  }

  // Reveal a form hidden behind a bare Apply button (never a submit)
  if (!(await page.locator('input[type=file], form input[type=text]').count().catch(() => 0))) {
    for (const t of ['Apply for this job', 'Apply now', 'Apply']) {
      const b = page.locator(`button:has-text("${t}"), a:has-text("${t}")`).first();
      if (await b.count().catch(() => 0)) { await b.click({ timeout: 4000 }).catch(() => {}); await sleep(2500); break; }
    }
  }

  out.finalUrl = page.url();
  out.wall = await wallOf();
  if (!out.wall) {
    out.fields = await enumerate();
    if (!out.fields.length) out.wall = 'none-found';
  }
} catch (_) { /* verdict already in out */ }
await browser.close();
console.log(JSON.stringify(out, null, 1));
