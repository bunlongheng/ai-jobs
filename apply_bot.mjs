#!/usr/bin/env node
/**
 * DEPRECATED (2026-07-21): superseded by jobfill/ (server + Chrome extension).
 * This engine produced unreliable unattended submissions (captcha walls, junk field
 * values). Use the JobFill extension + jobfill/server.py instead. Kept for reference.
 *
 * apply_bot.mjs - ASSISTED job-application filler (Playwright, headful).
 *
 * Fills an application form from your kit + profile, uploads your resume PDF,
 * screenshots the filled form, then STOPS. It NEVER clicks Submit - you review
 * in the open browser and submit yourself. Close the browser window when done.
 *
 * Usage:
 *   node apply_bot.mjs <job-id> [--url <applyUrl>]
 *   (reads ~/Sites/job/applications/<job-id>/ + profile.json apply_answers)
 */
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
let chromium;
for (const p of ['playwright', os.homedir() + '/Sites/bheng/node_modules/playwright']) {
  try { ({ chromium } = require(p)); break; } catch (_) {}
}
if (!chromium) { console.error('playwright not found'); process.exit(1); }

const HOME = os.homedir();
const id = process.argv[2];
if (!id) { console.error('usage: node apply_bot.mjs <job-id> [--url <applyUrl>]'); process.exit(1); }
let urlArg = null;
// The user (Bunlong) explicitly authorized autonomous submission on 2026-07-14
// ("I am fine you submit for me"), on the conditions that EVERY submission is
// logged with a full copy of the submitted values, the tracker is updated, and a
// Stickies note is posted per job. --auto honors that: it only submits forms it
// verifies are 100% complete, and holds+logs anything it cannot.
let AUTO = false, SHOW = false, FILLONLY = false, PROFILE = false;
for (let i = 3; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--url') urlArg = process.argv[++i];
  else if (a === '--auto') AUTO = true;
  else if (a === '--fill-only') FILLONLY = true;  // headless: fill + screenshot, NEVER submit (you click)
  else if (a === '--show') SHOW = true;
  else if (a === '--profile') PROFILE = true;      // use the persistent logged-in Greenhouse profile
}

const dir = `${HOME}/Sites/job/applications/${id}`;
const prof = JSON.parse(fs.readFileSync(`${HOME}/Sites/job/profile.json`));
const A = prof.apply_answers || {};
const read = (f) => { try { return fs.readFileSync(`${dir}/${f}`, 'utf8'); } catch { return ''; } };
const cover = read('cover-letter.md');
// per-job custom answers for free-text essays / one-off questions - keys are
// lowercase substrings of the question, values are the answer to type/select.
let CUSTOM = {};
try { CUSTOM = JSON.parse(fs.readFileSync(`${dir}/answers.json`, 'utf8')); } catch (_) {}
// ALWAYS prefer Bunlong's master resume PDF (his stated preference - never a
// generated/tailored substitute). Fall back to a kit resume.pdf only if missing.
const master = (A.resume_pdf || '').replace(/^~/, os.homedir());
const resumePdf = master && fs.existsSync(master) ? master
  : (fs.existsSync(`${dir}/resume.pdf`) ? `${dir}/resume.pdf` : null);

// resolve apply URL from arg or README
let url = urlArg;
if (!url) { const m = read('README.md').match(/https?:\/\/\S+/); if (m) url = m[0].replace(/[)>\].,]+$/, ''); }
if (!url) { console.error('no apply URL (pass --url)'); process.exit(1); }

const nameParts = (A.full_name || '').split(' ');
const VALUES = {
  first_name: nameParts[0] || '', last_name: nameParts.slice(1).join(' ') || '',
  full_name: A.full_name || '', name: A.full_name || '',
  email: A.email || '', phone: A.phone || '',
  location: A.location || '', city: A.location || '',
  linkedin: A.linkedin || '', github: A.github || '',
  website: A.portfolio || '', portfolio: A.portfolio || '',
  salary: A.desired_base_salary_usd || '', notice: A.notice_period || '',
  start: A.earliest_start || '', years: String(A.years_experience || '').replace(/\D/g, '') || '10',
  current_company: A.current_company || 'Thryv',
  current_title: A.current_title || 'Technical Engineering Manager',
  cover: cover.replace(/\r/g, ''),
  school: (prof.education && prof.education.school) || 'University of Massachusetts Lowell',
  degree: (prof.education && prof.education.degree) || "Bachelor's Degree",
  field: (prof.education && prof.education.field) || 'Computer Science',
};
// typeahead/combobox fields (Ashby/Greenhouse): type then pick first match
const TYPEAHEAD = new Set(['school', 'location', 'field']);
// yes/no questions answered from the profile (regex on the question text)
const YESNO = [
  { re: 'sponsor', ans: 'No', tag: 'sponsorship' },
  { re: 'authoriz(ed|ation) to work|legally authorized|eligible to work', ans: 'Yes', tag: 'work-auth' },
  { re: '18 years|at least 18|over 18|age of 18', ans: 'Yes', tag: '18+' },
  { re: 'still.*student|current student', ans: 'No', tag: 'still-student' },
  { re: 'relocat', ans: 'No', tag: 'relocate' },
  { re: 'citizen or resident of (any|the following)|sanctioned countr|comprehensively (sanctioned|embargoed)|export.?control', ans: 'No', tag: 'export-control' },
  { re: 'currently (located|based|residing) in the (us|u\\.s\\.|united states)|located in the (us|united states)', ans: 'Yes', tag: 'in-us' },
  // "How did you hear" as a checkbox/radio GROUP (not a dropdown) -> tick LinkedIn
  { re: 'how did you hear|hear about (this|the|us|our|the company|[a-z]+\\?)', ans: 'LinkedIn', tag: 'hearabout-box' },
];
// dropdown/select answers: for each kind, the option keywords to look for IN ORDER
// (first match wins). We ALWAYS read the field's real options first, then pick the
// best match from what we actually know. Unknowns -> "I don't wish to answer".
const eeo = (A.eeo || {});
const CHOICE = {
  country: ['united states', 'usa', 'u.s.', 'us'],
  workauth: ['yes', 'authorized', 'i am authorized'],
  sponsorship: ['no'],
  gender: eeo.gender && /female|woman/i.test(eeo.gender) ? ['woman', 'female'] : ['man', 'male'],
  // things Bunlong has NOT explicitly told us -> default to "I don't wish to
  // answer", never assume (no guessing Heterosexual / cisgender / a sub-ethnicity).
  transgender: eeo.transgender ? [eeo.transgender.toLowerCase(), "i don't wish", "don't wish"] : ["i don't wish", "don't wish", 'decline', 'prefer not'],
  orientation: eeo.orientation ? [eeo.orientation.toLowerCase(), "i don't wish", "don't wish"] : ["i don't wish", "don't wish", 'decline', 'prefer not'],
  disability: ["i don't wish", "don't wish", 'decline', 'no, i do not', "i do not have"],
  veteran: ['i am not a', 'not a protected veteran', 'not a veteran', 'no military', "don't wish"],
  // prefer his exact ethnicity; if a form lacks it (e.g. no "Southeast Asian"),
  // DECLINE rather than assert a wrong sub-category; bare "asian" is last resort.
  ethnicity: [...(eeo.ethnicity_options ? eeo.ethnicity_options.map(s => s.toLowerCase()) : []), "i don't wish to answer", "i don't wish", "don't wish", "prefer not", "asian"],
  hearabout: ['linkedin', 'company website', 'other', 'job board'],
  agree: ['i agree', 'agree', 'yes', 'i understand', 'i consent'],
  export_control: ['no', 'none', 'i am not', 'not a citizen or resident', 'none of the above'],
};

function classify(key) {
  const k = key;
  // agreement dropdowns ("By selecting I agree...") -> choose "I agree". Plain
  // consent CHECKBOXES are handled separately (ticked in the consent pass).
  if (/consent|i agree|agree that|by (checking|selecting)|acknowledge/.test(k)) return 'agree';
  // dropdown "choice" kinds - each reads the field's REAL options, then matches
  // the best from what we know (see CHOICE). Unknowns default to "don't wish".
  if (/authoriz(ed|ation) to work|legally authorized|eligible to work|work authorization/.test(k)) return 'workauth';
  if (/sponsor/.test(k)) return 'sponsorship';
  if (/(^|\W)country(\W|$)|country of/.test(k)) return 'country';
  if (/transgender/.test(k)) return 'transgender';
  if (/sexual orientation|(^|\W)orientation(\W|$)/.test(k)) return 'orientation';
  if (/gender/.test(k)) return 'gender';
  if (/disabilit/.test(k)) return 'disability';
  if (/veteran|served in the milit|military service/.test(k)) return 'veteran';
  if (/ethnicit|(^|\W)race(\W|$)|racial|hispanic|latino/.test(k)) return 'ethnicity';
  if (/citizen or resident of (any|the following)|sanctioned countr|export.?control|comprehensively (sanctioned|embargoed)/.test(k)) return 'export_control';
  if (/how did you hear|hear about (this|the)/.test(k)) return 'hearabout';
  if (/current.{0,20}(job )?title|most recent.{0,10}(job )?title|present.{0,10}title|your.{0,6}title|role title/.test(k)) return 'current_title';
  if (/current.{0,20}(employer|company)|most recent (employer|company)|present (employer|company)|company you.{0,10}work/.test(k)) return 'current_company';
  if (/cover letter|why (do|are|us)|anything else|additional info|tell us/.test(k)) return 'cover';
  if (/first[\s_]*name|given name/.test(k)) return 'first_name';
  if (/last[\s_]*name|surname|family name/.test(k)) return 'last_name';
  if (/full name|your name|(^|\W)name(\W|$)/.test(k) && !/company|user|file/.test(k)) return 'full_name';
  if (/e[-\s]?mail/.test(k)) return 'email';
  if (/phone|mobile|cell/.test(k)) return 'phone';
  if (/linkedin/.test(k)) return 'linkedin';
  if (/github/.test(k)) return 'github';
  if (/portfolio|personal (site|website)|website|url/.test(k)) return 'website';
  if (/school|universit|college|institution/.test(k) && !/field|study|high school/.test(k)) return 'school';
  if (/degree/.test(k)) return 'degree';
  if (/field of study|major|discipline/.test(k)) return 'field';
  if (/city|location|where are you|based|current location/.test(k)) return 'location';
  if (/salary|compensation|desired pay|expected pay/.test(k)) return 'salary';
  if (/notice period/.test(k)) return 'notice';
  if (/start date|available|availability|when can you/.test(k)) return 'start';
  if (/how many years|years of (professional|full[-\s]?time|relevant|industry|software|work|experience)|years of experience|total years|years experience/.test(k)) return 'years';
  return null;
}

async function typeahead(page, sel, value) {
  const loc = page.locator(sel).first();
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await loc.click({ timeout: 4000 }).catch(() => {});
  await loc.fill('').catch(() => {});
  // type the city name only (first token) - full "City, ST" often filters to zero
  const query = value.split(',')[0].trim() || value;
  await loc.type(query, { delay: 60 });
  await new Promise(r => setTimeout(r, 1900));
  // click the first rendered option (robust in headless); fall back to keyboard
  const opt = page.locator('[role="option"]').first();
  const clicked = await opt.click({ timeout: 2500 }).then(() => true).catch(() => false);
  if (!clicked) { await page.keyboard.press('ArrowDown').catch(() => {}); await page.keyboard.press('Enter').catch(() => {}); }
  await new Promise(r => setTimeout(r, 300));
}

// Match by EXACT text first, then WHOLE-WORD (never substring - so "man" cannot
// match "Cayman" and "no" cannot match "Lebanon").
const norm = (s) => (s || '').toLowerCase().replace(/[‘’ʼ`]/g, "'").trim(); // curly -> straight apostrophe
const bestMatch = (opts, keywords) => {
  const clean = opts.map(o => ({ o, l: norm(o) })).filter(x => x.l && !/^select/.test(x.l));
  const kws = keywords.map(norm);
  for (const kw of kws) { const m = clean.find(x => x.l === kw); if (m) return m.o; }
  for (const kw of kws) {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp('(^|[^a-z0-9])' + esc + '([^a-z0-9]|$)', 'i');
    const m = clean.find(x => rx.test(x.l)); if (m) return m.o;
  }
  return null;
};
const looksLikeCountryCodes = (opts) => {
  const cc = opts.filter(o => /[+]\d{1,4}\s*$/.test((o || '').trim())).length;
  return opts.length >= 4 && cc > opts.length / 2;
};

// Open a dropdown, read ITS OWN options (scoped via aria-controls), then pick the
// best whole-word match. Refuses to pick if it read the wrong menu (country-code
// list on a non-country field) - returns wrongMenu so we leave it for the user.
async function chooseOption(page, f, keywords, isCountry) {
  if (f.tag === 'select') {
    const opts = await page.locator(`${f.sel} option`).allTextContents().catch(() => []);
    const pick = bestMatch(opts, keywords);
    if (pick) await page.selectOption(f.sel, { label: pick }).catch(() => {});
    return { opts, pick };
  }
  const ctl = page.locator(f.sel).first();
  await ctl.scrollIntoViewIfNeeded().catch(() => {});
  await ctl.click({ timeout: 4000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 700));
  const listId = await ctl.getAttribute('aria-controls').catch(() => null);
  let menu = listId ? page.locator(`[id="${listId}"]`) : null;
  let opts = menu ? await menu.locator('[role="option"], [class*="option"]').allTextContents().catch(() => []) : [];
  if (!opts.length) { menu = page.locator('[role="listbox"]').last(); opts = await menu.locator('[role="option"]').allTextContents().catch(() => []); }
  // guard: if we clearly grabbed the phone country-code list on a non-country field, bail
  if (!isCountry && looksLikeCountryCodes(opts)) {
    await page.keyboard.press('Escape').catch(() => {});
    return { opts: [], pick: null, wrongMenu: true };
  }
  const pick = bestMatch(opts, keywords);
  if (pick && menu) {
    // click the EXACT option text - never a substring (so "Male" can't hit "Female")
    const rx = new RegExp('^\\s*' + pick.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i');
    const exact = menu.locator('[role="option"]').filter({ hasText: rx }).first();
    const ok = await exact.click({ timeout: 2500 }).then(() => true).catch(() => false);
    if (!ok) await menu.getByText(pick, { exact: true }).first().click({ timeout: 2000 }).catch(() => {});
  }
  await page.keyboard.press('Escape').catch(() => {});
  await new Promise(r => setTimeout(r, 200));
  return { opts, pick };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HEADLESS = (AUTO || FILLONLY) ? true : !SHOW;   // AUTO/fill-only run headless in the background
const MODE = FILLONLY ? 'FILL-ONLY' : (AUTO ? 'AUTO' : 'ASSISTED');
console.log(`\napply-bot (${MODE}${HEADLESS ? ', headless' : ''}) :: ${id}\n  -> ${url}\n`);

let browser, ctx;
const baseArgs = HEADLESS ? ['--disable-blink-features=AutomationControlled', '--no-sandbox'] : ['--start-maximized'];
const vp = HEADLESS ? { width: 1280, height: 1600 } : null;
if (PROFILE) {
  // persistent, logged-in profile so Greenhouse (my.greenhouse.io) recognizes the
  // session -> applications track in MyGreenhouse and fields prefill.
  const profDir = `${HOME}/Sites/job/chrome-profile`;
  for (const opts of [{ channel: 'chrome', headless: HEADLESS, viewport: vp, args: baseArgs },
                      { headless: HEADLESS, viewport: vp, args: baseArgs }]) {
    try { ctx = await chromium.launchPersistentContext(profDir, opts); break; } catch (_) {}
  }
  if (!ctx) { console.error('could not launch persistent profile'); process.exit(1); }
  browser = ctx.browser();
} else {
  for (const opts of [{ channel: 'chrome', headless: HEADLESS, args: baseArgs },
                      { headless: HEADLESS, args: baseArgs },
                      { headless: HEADLESS }]) {
    try { browser = await chromium.launch(opts); break; } catch (_) {}
  }
  if (!browser) { console.error('could not launch a browser (try: npx playwright install chromium)'); process.exit(1); }
  ctx = await browser.newContext(HEADLESS
    ? { viewport: vp, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' }
    : { viewport: null });
}
const page = ctx.pages()[0] || await ctx.newPage();
let resumeUploaded = false;

const report = [];
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3000);
  // some boards hide the form behind an Apply button
  for (const t of ['Apply for this job', 'Apply', 'Apply now']) {
    const b = page.locator(`button:has-text("${t}"), a:has-text("${t}")`).first();
    if (await b.count().catch(() => 0)) { await b.click().catch(() => {}); await sleep(1500); break; }
  }

  // 1) Upload the resume FIRST. Many ATS (Ashby/Neo.Tax) run their own
  // "autofill from resume" that re-renders the form - if we type before that,
  // their autofill wipes our values. So upload, then wait for it to settle.
  if (resumePdf) {
    const fileSel = await page.evaluate(() => {
      const f = document.querySelector('input[type=file]');
      if (!f) return null;
      if (!f.id) f.setAttribute('data-abfile', '1');
      return f.id ? '#' + CSS.escape(f.id) : '[data-abfile="1"]';
    });
    if (fileSel) { await page.setInputFiles(fileSel, resumePdf).then(() => { resumeUploaded = true; report.push(['resume (file)', 'uploaded resume.pdf']); }).catch(e => report.push(['resume (file)', 'FAILED ' + e.message.slice(0, 40)])); }
    else report.push(['resume (file)', 'no file input found - upload manually']);
  } else report.push(['resume', 'no resume.pdf in kit - generate with /job-tailor <id> --pdf']);

  // 2) Wait for the site's own resume-autofill to finish re-rendering.
  await page.locator('text=/autofill (completed|complete|done)/i').first().waitFor({ timeout: 12000 }).catch(() => {});
  await sleep(4000);

  // 3) Enumerate the (re-rendered) form; note which fields are ALREADY filled
  // (by their autofill) so we do not overwrite good values.
  const fields = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input,textarea,select').forEach((el, i) => {
      if (el.type === 'hidden') return;
      if (!el.id) el.setAttribute('data-ab', 'ab' + i);
      let label = '';
      if (el.labels && el.labels[0]) label = el.labels[0].innerText;
      if (!label && el.getAttribute('aria-label')) label = el.getAttribute('aria-label');
      const lb = el.getAttribute('aria-labelledby');
      if (!label && lb) { const l = document.getElementById(lb); if (l) label = l.innerText; }
      if (!label && el.placeholder) label = el.placeholder;
      const key = (label + ' ' + (el.name || '') + ' ' + (el.id || '') + ' ' + (el.placeholder || '') + ' ' + (el.autocomplete || '')).toLowerCase();
      const req = el.required || el.getAttribute('aria-required') === 'true' || /\*|\brequired\b/.test(label);
      out.push({ sel: el.id ? '#' + CSS.escape(el.id) : `[data-ab="ab${i}"]`, type: (el.type || el.tagName).toLowerCase(), tag: el.tagName.toLowerCase(), label: (label || '').trim().slice(0, 70), key, filled: (el.value || '').trim().length > 0, required: req });
    });
    return out;
  });

  for (const f of fields) {
    if (f.type === 'file') continue;
    if (f.filled) { report.push([f.label || '(field)', 'kept site autofill']); continue; }
    // per-job custom answers (essays / one-off questions) win over everything
    const ck = Object.keys(CUSTOM).find(k => f.key.includes(k.toLowerCase()));
    if (ck) {
      const cv = String(CUSTOM[ck]);
      try {
        if (f.tag === 'select' || cv.length <= 24) {
          // short answer (e.g. "Yes") -> pick from the dropdown options
          const r = await chooseOption(page, f, [cv.toLowerCase()]);
          if (!r || !r.pick) { await page.locator(f.sel).first().fill(cv, { timeout: 4000 }).catch(() => {}); }
        } else {
          const loc = page.locator(f.sel).first(); await loc.scrollIntoViewIfNeeded().catch(() => {}); await loc.fill(cv, { timeout: 5000 });
        }
        report.push([f.label || ck, `custom: ${cv.slice(0, 44)}`]);
      } catch (e) { report.push([f.label || ck, 'custom - could not fill']); }
      continue;
    }
    const kind = classify(f.key);
    if (!kind) { if (f.label) report.push([f.label, 'left blank (review)']); continue; }
    // dropdown choice kinds: read real options, pick the best match, log the options
    if (CHOICE[kind]) {
      if (f.type === 'checkbox') continue;   // agreement checkboxes are ticked in the consent pass
      try {
        const { opts, pick, wrongMenu } = await chooseOption(page, f, CHOICE[kind], kind === 'country');
        const seen = opts.filter(o => o && !/^select/i.test(o.trim())).slice(0, 5).join(' | ');
        if (wrongMenu) report.push([f.label || kind, 'PICK MANUALLY (could not read this dropdown cleanly)']);
        else report.push([f.label || kind, pick ? `chose "${pick}"  [saw: ${seen}]` : `PICK MANUALLY  [saw: ${seen || 'none'}]`]);
      } catch (e) { report.push([f.label || kind, 'dropdown - do manually']); }
      continue;
    }
    const val = VALUES[kind];
    if (!val) continue;
    try {
      if (f.tag === 'select') {
        // degree / dropdowns: pick the option that contains our value's key word
        const word = kind === 'degree' ? 'bachelor' : String(val).toLowerCase();
        await page.selectOption(f.sel, { label: new RegExp(word, 'i') }).catch(async () => {
          const opts = await page.locator(`${f.sel} option`).allTextContents();
          const m = opts.find(o => o.toLowerCase().includes(word));
          if (m) await page.selectOption(f.sel, { label: m });
        });
        report.push([f.label || kind, `selected: ${val}`]);
      } else if (TYPEAHEAD.has(kind)) {
        await typeahead(page, f.sel, val);
        report.push([f.label || kind, `typeahead: ${String(val).slice(0, 34)}`]);
      } else {
        const loc = page.locator(f.sel).first();
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await loc.fill(val, { timeout: 4000 });
        report.push([f.label || kind, kind === 'cover' ? 'filled cover letter' : `filled: ${String(val).slice(0, 40)}`]);
      }
    } catch (e) { report.push([f.label || kind, 'could not fill - do manually']); }
  }

  // yes/no questions (sponsorship, work auth, 18+, relocate, still-student)
  const answered = await page.evaluate((rules) => {
    const clickIn = (c, ans) => {
      for (const l of c.querySelectorAll('label')) {
        const t = (l.innerText || '').trim().toLowerCase();
        if (t === ans.toLowerCase() || t.startsWith(ans.toLowerCase() + ' ')) { l.click(); return true; }
      }
      for (const b of c.querySelectorAll('button,[role="radio"],[role="button"],[role="option"]')) {
        if ((b.innerText || '').trim().toLowerCase() === ans.toLowerCase()) { b.click(); return true; }
      }
      return false;
    };
    const nodes = [...document.querySelectorAll('label,legend,p,div,span,h3,h4')];
    const out = [];
    for (const { re, ans, tag } of rules) {
      const rx = new RegExp(re, 'i');
      const q = nodes.find(n => rx.test(n.innerText || '') && (n.innerText || '').length < 240);
      if (!q) continue;
      let c = q;
      for (let i = 0; i < 5 && c.parentElement; i++) { c = c.parentElement; if (clickIn(c, ans)) { out.push(`${tag}=${ans}`); break; } }
    }
    return out;
  }, YESNO).catch(() => []);
  for (const a of answered) report.push([a.split('=')[0], `answered: ${a.split('=')[1]}`]);

  // ---- tick required consent / agreement checkboxes (applying implies consent) ----
  const consented = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input[type=checkbox]').forEach(cb => {
      const lab = (cb.labels && cb.labels[0] && cb.labels[0].innerText) || cb.getAttribute('aria-label') || (cb.closest('label') && cb.closest('label').innerText) || '';
      if (!cb.checked && /(i agree|i consent|consent to|agree that|acknowledge|by (checking|selecting)|privacy|terms|gdpr|data (processing|protection))/i.test(lab)) {
        cb.click(); out.push((lab || 'consent').trim().slice(0, 44));
      }
    });
    return out;
  }).catch(() => []);
  for (const c of consented) report.push([c, 'consent: checked']);

  // ---- full COPY of everything on the form (the audit trail Bunlong requires) ----
  const submitted = await page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('input,textarea,select').forEach(el => {
      if (el.type === 'hidden' || el.type === 'file') return;
      let label = (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('aria-label') || el.placeholder || el.name || '';
      let val = el.value || '';
      if (el.tagName === 'SELECT' && el.selectedOptions && el.selectedOptions[0]) val = el.selectedOptions[0].text;
      if (el.type === 'checkbox' || el.type === 'radio') val = el.checked ? 'checked' : '';
      if (!val) { let c = el; for (let i = 0; i < 5 && c.parentElement; i++) { c = c.parentElement; const sv = c.querySelector('[class*="singleValue"],[class*="multiValue"]'); if (sv) { val = sv.innerText; break; } } }
      label = (label || '').trim().slice(0, 80);
      val = (val || '').trim().slice(0, 140);
      if (label || val) rows.push({ label, value: val });
    });
    return rows;
  }).catch(() => []);

  // ---- confidence gate: every required field filled + resume uploaded ----
  const reqFields = fields.filter(f => f.required && f.type !== 'file');
  const missing = await page.evaluate((sels) => {
    const miss = [];
    for (const { sel, label } of sels) {
      const el = document.querySelector(sel); if (!el) continue;
      let filled = (el.value || '').trim().length > 0;
      if (!filled) { let c = el; for (let i = 0; i < 5 && c.parentElement; i++) { c = c.parentElement; if (c.querySelector('[class*="singleValue"],[class*="multiValue"]')) { filled = true; break; } } }
      if (!filled) miss.push(label);
    }
    return miss;
  }, reqFields.map(f => ({ sel: f.sel, label: f.label || f.key.slice(0, 30) }))).catch(() => reqFields.map(f => f.label));
  const ready = resumeUploaded && missing.length === 0;

  const shot = `${dir}/apply-preview.png`;
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});

  // ---- submit ONLY when 100% verified (AUTO mode, user-authorized 2026-07-14) ----
  // FILL-ONLY never submits - it fills + screenshots so YOU click submit (dodges
  // the anti-bot spam-flag, since the final click has no bot signature).
  let outcome = ready ? 'ready_to_submit' : 'filled_incomplete';
  if (AUTO && !FILLONLY) {
    if (ready) {
      const btn = page.locator('button:has-text("Submit application"), button:has-text("Submit Application"), button:has-text("Submit"), button:has-text("Send application")').first();
      const before = page.url();
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      const clicked = await btn.click({ timeout: 6000 }).then(() => true).catch(() => false);
      await sleep(5000);

      // ---- Greenhouse email security-code step: enter the code Bunlong's Gmail
      // received (the assistant writes it to security_code.txt), then resubmit. ----
      const needsCode = await page.locator('text=/security code|enter the code|verification code/i').count().catch(() => 0);
      if (needsCode) {
        console.log('AWAITING_CODE');            // signal to the orchestrator to fetch the code
        const codePath = `${dir}/security_code.txt`;
        try { fs.unlinkSync(codePath); } catch (_) {}
        let code = '';
        for (let i = 0; i < 45; i++) {           // wait up to ~135s for the code
          if (fs.existsSync(codePath)) { code = fs.readFileSync(codePath, 'utf8').trim(); break; }
          await sleep(3000);
        }
        if (code) {
          // focus the first empty code box and TYPE (real keystrokes auto-advance
          // segmented / multi-box code inputs; also works for a single field)
          const codeSel = await page.evaluate(() => {
            // the security-code box is the LAST empty visible text input (bottom of form)
            const inps = [...document.querySelectorAll('input[type="text"],input:not([type]),input[inputmode],input[type="tel"]')].filter(i => !i.value && i.offsetParent);
            const inp = inps[inps.length - 1];
            if (!inp) return null;
            if (!inp.id) inp.setAttribute('data-codebox', '1');
            return inp.id ? '#' + CSS.escape(inp.id) : '[data-codebox="1"]';
          }).catch(() => null);
          if (codeSel) {
            await page.locator(codeSel).scrollIntoViewIfNeeded().catch(() => {});
            await page.locator(codeSel).click({ timeout: 4000 }).catch(() => {});
            await page.keyboard.type(code, { delay: 120 });
          }
          await sleep(1200);
          await btn.click({ timeout: 6000 }).catch(() => {});
          await sleep(5000);
          report.push(['security code', `entered ${code}`]);
        } else report.push(['security code', 'timed out waiting for code']);
      }

      const okText = await page.locator('text=/thank you|application (received|submitted)|we.?ll be in touch|successfully (applied|submitted)|good news/i').first().count().catch(() => 0);
      const errCount = await page.locator('text=/is required|required field|please (complete|select|enter|provide|fill)/i').count().catch(() => 0);
      const submittedOk = clicked && (okText > 0 || page.url() !== before);
      // NEVER call a non-submit a "rejection" - it is a NOT-SUBMITTED state.
      outcome = submittedOk ? 'submitted' : (needsCode ? 'awaiting_code' : (errCount > 0 ? 'blocked_incomplete' : (clicked ? 'not_confirmed' : 'submit_failed')));
      await page.screenshot({ path: `${dir}/apply-result.png`, fullPage: true }).catch(() => {});
    } else outcome = 'held_incomplete';
  }

  const log = { id, url, stamp: new Date().toISOString(), outcome, ready,
    resume_uploaded: resumeUploaded, required_total: reqFields.length,
    required_missing: missing, fields: submitted };
  fs.writeFileSync(`${dir}/apply-log.json`, JSON.stringify(log, null, 2));

  console.log('FILL REPORT');
  for (const [k, v] of report) console.log(`  ${(k || '?').slice(0, 42).padEnd(42)} ${v}`);
  console.log(`\nOUTCOME: ${outcome}  (required ${reqFields.length - missing.length}/${reqFields.length}, resume ${resumeUploaded})`);
  if (missing.length) console.log(`MISSING: ${missing.join(' | ')}`);
  console.log(`log: ${dir}/apply-log.json\nscreenshot: ${shot}`);
} catch (e) {
  console.error('bot error:', String(e).slice(0, 200));
}
if (AUTO || FILLONLY) { await ctx.close().catch(() => {}); await (browser && browser.close ? browser.close() : Promise.resolve()).catch(() => {}); console.log('done (headless).'); }
else {
  console.log('\n>>> Browser is OPEN and filled. Review, then Submit yourself. Close the window when done.\n');
  await new Promise((resolve) => browser.on('disconnected', resolve));
  console.log('browser closed - done.');
}
