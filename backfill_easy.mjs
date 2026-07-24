#!/usr/bin/env node
// One-pass backfill: mark easy_apply on LinkedIn rows by reading each guest
// viewjob page (gentle: 1 req / 2.5s, one pass only - never rerun the same day).
import { createRequire } from "module"; import os from "os";
const require = createRequire(import.meta.url);
const D = require(os.homedir() + "/Sites/jobs/web/node_modules/better-sqlite3");
const db = new D(os.homedir() + "/Sites/jobs/web/jobs.db");
const rows = db.prepare("SELECT id, url FROM applications WHERE url LIKE '%linkedin.com%' AND easy_apply=0 AND status IN ('kit_ready','planned')").all();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let hits = 0, fails = 0;
for (const r of rows) {
  try {
    const res = await fetch(r.url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" } });
    const html = res.ok ? await res.text() : "";
    if (/easy apply|apply-button--easy/i.test(html)) { db.prepare("UPDATE applications SET easy_apply=1 WHERE id=?").run(r.id); hits++; }
    else if (!res.ok) fails++;
  } catch { fails++; }
  await sleep(2500);
}
console.log(`linkedin rows checked: ${rows.length}, easy-apply flagged: ${hits}, fetch fails: ${fails}`);
