#!/usr/bin/env node
// prerun.mjs - HEADLESS red-detector using the REAL JobFill extension engine.
// Loads web/extension into a real Chromium (persistent context), opens each ready
// job's application form, invokes the extension's own doFill() in its service
// worker, and lets the normal pipeline run: content.js fills -> background POSTs
// the event -> /api/jobfill/event stamps red/green into jobs.db -> board updates.
// NEVER submits (content.js has no submit path; watchForSubmit only observes).
// Usage: node prerun.mjs [kitId ...]   (default: every kit_ready row)
import { createRequire } from "module";
import os from "os";
import path from "path";
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(os.homedir(), "Sites/jobs/web/node_modules/playwright"));
const Database = require(path.join(os.homedir(), "Sites/jobs/web/node_modules/better-sqlite3"));

const ROOT = path.join(os.homedir(), "Sites/jobs");
const EXT = path.join(ROOT, "web/extension");
const db = new Database(path.join(ROOT, "web/jobs.db"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const formUrl = (u) => (u.includes("ashbyhq.com") ? u.replace(/\/$/, "") + "/application" : u);

const ids = process.argv.slice(2);
const jobs = ids.length
  ? ids.map((id) => db.prepare("SELECT id, url, company FROM applications WHERE id=?").get(id)).filter(Boolean)
  : db.prepare("SELECT id, url, company FROM applications WHERE status='kit_ready' ORDER BY score DESC").all();

const profileDir = path.join(os.homedir(), ".cache/jobfill-prerun-profile");
const ctx = await chromium.launchPersistentContext(profileDir, {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 }).catch(() => null);
if (!sw) { console.error("FATAL: extension service worker never started (headless+ext unsupported?)"); process.exit(2); }
console.log(`extension worker up. sweeping ${jobs.length} job(s)...`);

for (const j of jobs) {
  const page = await ctx.newPage();
  const before = db.prepare("SELECT COALESCE(MAX(id),0) m FROM events WHERE app_id=? AND outcome='filled'").get(j.id).m;
  try {
    await page.goto(formUrl(j.url), { waitUntil: "domcontentloaded", timeout: 45000 });
    await sleep(5000);
    const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 300);
    if (/security verification|verify you are human|cloudflare/i.test(body)) {
      console.log(`WALL   ${j.company} - ${j.id} (Cloudflare - needs your real Chrome)`);
      await page.close(); continue;
    }
    await sw.evaluate((kitId) => doFill(kitId), j.id);
    let ev = null;
    for (let i = 0; i < 12 && !ev; i++) { await sleep(4000); ev = db.prepare("SELECT id FROM events WHERE app_id=? AND outcome='filled' AND id>?").get(j.id, before); }
    const pf = db.prepare("SELECT pf_status, pf_covered, pf_total FROM applications WHERE id=?").get(j.id);
    const red = (pf.pf_total ?? 0) - (pf.pf_covered ?? 0);
    console.log(`${!ev ? "NOEVENT" : pf.pf_status === "ready" ? "GREEN" : `RED x${red}`}  ${j.company} - ${j.id} (${pf.pf_covered ?? "?"}/${pf.pf_total ?? "?"})`);
  } catch (e) {
    console.log(`ERROR  ${j.company} - ${j.id}: ${String(e).slice(0, 120)}`);
  }
  await page.close();
}
await ctx.close();
console.log("PRERUN DONE");
