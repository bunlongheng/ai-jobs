#!/usr/bin/env node
// Easy Apply detection in a SEPARATE background browser (persistent chrome-profile),
// fully headless - never touches the user's working Chrome. Needs that profile logged
// into LinkedIn once (node login_linkedin.mjs). Stamps easy_apply + easy_apply_checked.
//
// RESOURCE POLICY (owner rule 2026-07-23: never choke the Mac): strictly SEQUENTIAL
// (one page at a time, one browser), CHUNKED with a full browser teardown between
// chunks to release RAM, gentle per-page pacing, and it BACKS OFF when system load is
// high. Slow-but-light beats fast-but-heavy. Args: [--limit N] [--chunk N].
import { createRequire } from "module"; import os from "os"; import path from "path";
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(os.homedir(), "Sites/jobs/web/node_modules/playwright"));
const D = require(path.join(os.homedir(), "Sites/jobs/web/node_modules/better-sqlite3"));
const db = new D(path.join(os.homedir(), "Sites/jobs/web/jobs.db"));
const PROFILE = path.join(os.homedir(), "Sites/jobs/chrome-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? +process.argv[i + 1] : d; };
const LIMIT = arg("--limit", 20);   // bound one run
const CHUNK = arg("--chunk", 8);    // teardown browser every N pages to free memory
const CORES = os.cpus().length;

// Back off when the machine is busy: if 1-min load per core > 0.7, wait it out.
async function waitForCalm() {
  for (let i = 0; i < 20; i++) {
    const load1 = os.loadavg()[0] / CORES;
    if (load1 < 0.7) return;
    console.log(`load ${load1.toFixed(2)}/core high - pausing 15s`);
    await sleep(15000);
  }
}

const rows = db.prepare(`SELECT id, url FROM applications WHERE status='kit_ready'
  AND pf_status IN ('wall','blocked','account_wall')
  AND (url LIKE '%linkedin.com/jobs/view%' OR url LIKE '%indeed.com/viewjob%')
  AND easy_apply_checked=0 LIMIT ?`).all(LIMIT);
if (!rows.length) { console.log("nothing to check"); process.exit(0); }

let easy = 0, ext = 0, loginWall = 0, closed = 0, i = 0;
while (i < rows.length) {
  await waitForCalm();
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, channel: "chrome" })
    .catch(() => chromium.launchPersistentContext(PROFILE, { headless: true }));
  const page = await ctx.newPage();
  for (let n = 0; n < CHUNK && i < rows.length; n++, i++) {
    const r = rows[i];
    try {
      await page.goto(r.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(2500);
      const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
      if (/sign in to|join now|new to linkedin|sign in to see/i.test(body) && !/easy apply/i.test(body)) { loginWall++; continue; }
      // CLOSED-JOB DETECTION (owner catch 2026-07-23): a dead posting should drop out
      // of Ready, not waste his time. Move to skipped with a note.
      if (/no longer accepting applications|no longer available|this job is no longer|applications are closed|position (has been )?filled|posting (has )?closed/i.test(body)) {
        db.prepare("UPDATE applications SET status='skipped', easy_apply_checked=1, notes=COALESCE(notes,'')||' [closed on source '||date('now')||']', updated_at=datetime('now') WHERE id=?").run(r.id);
        closed++; continue;
      }
      const found = /easy apply|easily apply/i.test(body) ? 1 : 0;
      db.prepare("UPDATE applications SET easy_apply=?, easy_apply_checked=1, updated_at=datetime('now') WHERE id=?").run(found, r.id);
      found ? easy++ : ext++;
    } catch { /* skip, stays unchecked for next run */ }
    await sleep(1800);
  }
  await ctx.close();          // release RAM between chunks
  await sleep(3000);          // let the OS reclaim before the next browser
}
console.log(`checked ${easy + ext}, easy ${easy}, external ${ext}, CLOSED ${closed}, login-walled ${loginWall}`);
if (loginWall > 3) console.log("PROFILE NOT LOGGED INTO LINKEDIN - run: node login_linkedin.mjs once");
