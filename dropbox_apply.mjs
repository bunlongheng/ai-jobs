#!/usr/bin/env node
/**
 * dropbox_apply.mjs - drive the Dropbox multi-step apply wizard end to end with a
 * REAL browser (Playwright), including the resume file upload a Chrome extension
 * cannot do. Headful so you watch it happen. Fills every step from profile.json +
 * work_history, clicks through, and STOPS before the final Submit for your review.
 *
 * Usage: node dropbox_apply.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
const require = createRequire(import.meta.url);
let chromium;
for (const p of ['playwright', process.env.PLAYWRIGHT_PATH_ALT].filter(Boolean)) {
  try { ({ chromium } = require(p)); break; } catch (_) {}
}
if (!chromium) { console.error('playwright not found'); process.exit(1); }

const HOME = os.homedir();
const JOB = process.env.JOBS_ROOT || `${HOME}/Sites/jobs`;
const prof = JSON.parse(fs.readFileSync(`${JOB}/profile.json`)).apply_answers;
const RESUME_NAME = process.env.MASTER_RESUME || 'resume-master.pdf';
const resume = `${JOB}/${RESUME_NAME}`;
// Args: --id <ghId> --jid <tracker-id> [--headless]. Defaults keep original behavior.
const argv = process.argv.slice(2);
const argOf = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const DID = argOf('--id', '7421149');
const JID = argOf('--jid', 'dropbox-staff-fullstack-software-engineer-core-performance');
const HEADLESS = argv.includes('--headless');
const SHOTDIR = `${JOB}/applications/${JID}`;
const APPLY = `https://www.dropbox.jobs/en/jobs/apply/?id=${DID}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// label-substring -> value (lowercase match). Truthful, from profile.
const first = prof.full_name.split(' ')[0], last = prof.full_name.split(' ').slice(1).join(' ');
const VALUES = [
  ['legal first name', first], ['preferred first name', first], ['first name', first],
  ['last name', last], ['family name', last], ['full name', prof.full_name],
  ['email', prof.email], ['phone', prof.phone], ['mobile', prof.phone],
  ['zip', '03076'], ['postal', '03076'], ['linkedin', prof.linkedin],
  ['github', prof.github], ['website', prof.portfolio], ['portfolio', prof.portfolio],
];
const CHOICE = [
  ['pronoun', 'He / Him / His'], ['current location', 'US - New Hampshire'],
  ['authorized to work', 'I am authorized'], ['sponsor', 'No'],
  ['how did you hear', 'LinkedIn'], ['previously worked', 'No, I have not'],
  ['future job', 'Yes'], ['email me about', 'Yes'],
];
const WORK = [
  { company: 'Thryv', title: 'Senior Full-Stack Web Developer & Architect', location: 'Dallas, TX (Remote)', start: '01/2023', current: true },
  { company: 'Monitaur.ai', title: 'Senior Web Developer', location: 'Danbury, CT (Remote)', start: '07/2022', end: '12/2022' },
  { company: 'Benu Networks', title: 'Senior Full-Stack Web Developer', location: 'Billerica, MA (Remote)', start: '10/2015', end: '06/2022' },
];

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

async function labelFor(el) {
  return await el.evaluate((e) => {
    const pick = (t) => (t || '').replace(/\s+/g, ' ').trim();
    if (e.id) { const l = document.querySelector(`label[for="${CSS.escape(e.id)}"]`); if (l) return pick(l.textContent); }
    const w = e.closest('label'); if (w) return pick(w.textContent);
    return pick(e.getAttribute('aria-label') || e.placeholder || e.name || '');
  }).catch(() => '');
}

async function fillStep(page) {
  let did = 0;
  // file inputs -> resume (THE thing the extension can't do)
  for (const fi of await page.locator('input[type=file]').all()) {
    if (await fi.evaluate((e) => !e.files.length).catch(() => true)) {
      await fi.setInputFiles(resume).then(() => did++).catch(() => {});
    }
  }
  // text / email / tel inputs + textareas
  for (const el of await page.locator('input:not([type=file]):not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea').all()) {
    if (!(await el.isVisible().catch(() => false))) continue;
    if (await el.inputValue().catch(() => '')) continue;
    const lab = norm(await labelFor(el));
    const m = VALUES.find(([k]) => lab.includes(k));
    if (m) { await el.fill(String(m[1])).then(() => did++).catch(() => {}); }
  }
  // selects
  for (const sel of await page.locator('select').all()) {
    if (!(await sel.isVisible().catch(() => false))) continue;
    const lab = norm(await labelFor(sel));
    const m = CHOICE.find(([k]) => lab.includes(k));
    if (m) {
      await sel.selectOption({ label: new RegExp(m[1], 'i') }).then(() => did++).catch(async () => {
        const opts = await sel.locator('option').allTextContents();
        const hit = opts.find((o) => norm(o).includes(norm(m[1])));
        if (hit) await sel.selectOption({ label: hit }).then(() => did++).catch(() => {});
      });
    }
  }
  return did;
}

async function fillEmployment(page) {
  // Employment step: click Add, fill the sub-form, repeat for each real job.
  for (const job of WORK) {
    const add = page.locator('button:has-text("Add"), a:has-text("Add")').first();
    if (!(await add.count().catch(() => 0))) break;
    await add.click().catch(() => {});
    await sleep(1200);
    const setBy = async (keys, val) => {
      for (const el of await page.locator('input:not([type=hidden]), textarea, select').all()) {
        if (!(await el.isVisible().catch(() => false)) || (await el.inputValue().catch(() => 'x'))) continue;
        const lab = norm(await labelFor(el));
        if (keys.some((k) => lab.includes(k))) {
          const tag = await el.evaluate((e) => e.tagName).catch(() => '');
          if (tag === 'SELECT') await el.selectOption({ label: new RegExp(val, 'i') }).catch(() => {});
          else await el.fill(String(val)).catch(() => {});
          return true;
        }
      }
      return false;
    };
    await setBy(['company', 'employer', 'organization'], job.company);
    await setBy(['title', 'role', 'position'], job.title);
    await setBy(['location', 'city'], job.location);
    await setBy(['start'], job.start);
    if (job.end) await setBy(['end'], job.end);
    if (job.current) { const cb = page.locator('input[type=checkbox]').filter({ hasText: /current|present/i }).first(); await cb.check().catch(() => {}); }
    // save the sub-entry (a modal "Save"/"Done"/"Add" that is NOT "Save & Continue")
    for (const t of ['Save entry', 'Add entry', 'Done', 'Save']) {
      const b = page.locator(`button:has-text("${t}")`).first();
      if (await b.count().catch(() => 0) && norm(await b.innerText().catch(() => '')) !== 'save & continue') {
        await b.click().catch(() => {}); await sleep(1000); break;
      }
    }
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: HEADLESS, args: ['--start-maximized'] })
  .catch(() => chromium.launch({ headless: HEADLESS, args: ['--start-maximized'] }));
const ctx = await browser.newContext({ viewport: null });
const page = await ctx.newPage();
const ZIP = '03076';

async function dismissOverlays(page) {
  // cookie banner -> Accept All
  for (const t of ['Accept All', 'Accept all', 'Accept']) {
    const b = page.locator(`button:has-text("${t}")`).first();
    if (await b.count().catch(() => 0)) { await b.click().catch(() => {}); await sleep(600); break; }
  }
  // ZIP-code splash: segmented boxes -> type the zip, then Continue/Skip
  const bodyTxt = norm(await page.locator('body').innerText().catch(() => ''));
  if (/zip code/.test(bodyTxt)) {
    const boxes = page.locator('input[maxlength="1"], input[type="tel"], input[inputmode="numeric"]');
    const n = await boxes.count().catch(() => 0);
    if (n >= 5) {
      await boxes.first().click().catch(() => {});
      await page.keyboard.type(ZIP, { delay: 120 }).catch(() => {});
      await sleep(800);
    } else {
      const one = page.locator('input').first();
      await one.fill(ZIP).catch(() => {});
    }
    await sleep(600);
    for (const t of ['Continue', 'Submit', 'Next', 'Done']) {
      const b = page.locator(`button:has-text("${t}")`).first();
      if (await b.count().catch(() => 0) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); await sleep(1500); break; }
    }
    // if it still shows zip, Skip it
    if (/zip code/.test(norm(await page.locator('body').innerText().catch(() => '')))) {
      const skip = page.locator('button:has-text("Skip"), a:has-text("Skip")').first();
      if (await skip.count().catch(() => 0)) { await skip.click().catch(() => {}); await sleep(1500); }
    }
    console.log('handled ZIP splash');
  }
}

console.log('opening Dropbox apply...');
await page.goto(APPLY, { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(2500);
await dismissOverlays(page);
await sleep(1000);
await dismissOverlays(page);

// gate: "Apply manually"
const manual = page.locator('button:has-text("Apply manually"), a:has-text("Apply manually")').first();
if (await manual.count().catch(() => 0)) { await manual.click().catch(() => {}); await sleep(2500); console.log('chose Apply manually'); }

let lastUrl = '', stuck = 0;
for (let step = 0; step < 14; step++) {
  await sleep(1500);
  await dismissOverlays(page);
  const heading = norm(await page.locator('h1,h2,h3,legend').first().innerText().catch(() => ''));
  const bodyTxt = norm(await page.locator('body').innerText().catch(() => ''));
  const isEmployment = /employment|work experience|work history/.test(bodyTxt) && await page.locator('button:has-text("Add"),a:has-text("Add")').count().catch(() => 0);
  console.log(`step ${step}: ${(await page.locator('.progress,[role=progressbar]').first().innerText().catch(() => '')) || heading || '(form)'}`);

  const filled = await fillStep(page);
  if (isEmployment) { await fillEmployment(page); }

  // STOP before anything that looks like a final submit or a human-only gate
  const finalSubmit = await page.locator('button:has-text("Submit application"), button:has-text("Submit Application")').count().catch(() => 0);
  const hasExp = /at least 12 years|years of.*experience|desired.*salary|salary expectation/.test(bodyTxt);
  if (finalSubmit || hasExp) {
    await page.screenshot({ path: `${SHOTDIR}/apply-preview.png`, fullPage: true }).catch(() => {});
    console.log(`STOP: ${finalSubmit ? 'final Submit reached' : 'human-only question (experience/salary)'} - your turn`);
    break;
  }

  const cont = page.locator('button:has-text("Save & Continue"), button:has-text("Continue"), button:has-text("Next")').first();
  if (await cont.count().catch(() => 0)) { await cont.click().catch(() => {}); await sleep(2500); }
  else { console.log('no continue button - stopping'); break; }

  const url = page.url();
  if (url === lastUrl && filled === 0) { if (++stuck >= 2) { console.log('no progress - stopping for you'); break; } }
  else stuck = 0;
  lastUrl = url;
}

await page.screenshot({ path: `${SHOTDIR}/apply-preview.png`, fullPage: true }).catch(() => {});
console.log(`\nDONE driving ${JID}. Screenshot -> ${SHOTDIR}/apply-preview.png`);
if (HEADLESS) { await ctx.close().catch(() => {}); await browser.close().catch(() => {}); }
// leave the browser open so the user can review and submit
