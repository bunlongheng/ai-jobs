#!/usr/bin/env node
// scan_watch.mjs - live "who's being scanned right now" feed for the board.
// Reads the ordered lane id-lists + the lane logs, derives the in-flight job per
// lane (prerun processes strictly in argv order, one result line printed per job
// AFTER it finishes, so current = list[completedLineCount]), enriches with
// company/title from jobs.db, and writes web/public/scan-status.json every 3s.
// Self-terminates when both lanes are done. Read-only against the DB.
import { createRequire } from "module";
import os from "os";
import path from "path";
import fs from "fs";
const require = createRequire(import.meta.url);
const ROOT = path.join(os.homedir(), "Sites/jobs");
const Database = require(path.join(ROOT, "web/node_modules/better-sqlite3"));
const db = new Database(path.join(ROOT, "web/jobs.db"), { readonly: true });
const OUT = path.join(ROOT, "web/public/scan-status.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// argv: node scan_watch.mjs <laneA.txt> <laneA.log> <laneB.txt> <laneB.log> ...
const args = process.argv.slice(2);
const lanes = [];
for (let i = 0; i < args.length; i += 3) lanes.push({ name: args[i], list: args[i + 1], log: args[i + 2] });

const RESULT = /^(GREEN|RED|WALL|NOEVENT|ERROR)\b/;
const readList = (f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").map((s) => s.trim()).filter(Boolean) : [];
const doneCount = (f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter((l) => RESULT.test(l)).length : 0;
const meta = db.prepare("SELECT company, title FROM applications WHERE id=?");

const total = lanes.reduce((n, l) => n + readList(l.list).length, 0);

while (true) {
  let done = 0, running = false;
  const active = [];
  for (const l of lanes) {
    const ids = readList(l.list);
    const d = doneCount(l.log);
    done += Math.min(d, ids.length);
    if (d < ids.length && ids[d]) {
      running = true;
      const m = meta.get(ids[d]) || {};
      active.push({ lane: l.name, id: ids[d], company: m.company || ids[d], title: m.title || "", n: d + 1, of: ids.length });
    }
  }
  fs.writeFileSync(OUT, JSON.stringify({ kind: "prescan", running, total, done, active, updatedAt: Date.now() }));
  if (!running) break;
  await sleep(3000);
}
console.log("scan_watch: both lanes complete.");
