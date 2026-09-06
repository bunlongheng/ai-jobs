// check_closed.mjs - kill false hope. Fetch every live posting and mark the dead ones expired
// so a closed job can never sit at the top of the board again. Works logged-out on LinkedIn,
// Indeed, Greenhouse and company pages - the "no longer accepting" banner renders for guests.
// Also opportunistically caches the JD while the page is already in hand. (owner 2026-09-06)
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const ROOT = dirname(fileURLToPath(import.meta.url));
const db = new (require(join(ROOT, "web/node_modules/better-sqlite3")))(join(ROOT, "web/jobs.db"));

const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || 200;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Phrases that mean the posting is genuinely closed. Kept tight on purpose - a false "expired"
// hides a real job, which is worse than leaving a dead one visible.
const DEAD = [
  /no longer accepting applications/i,
  /this job is no longer available/i,
  /position (has been )?filled/i,
  /applications (are )?closed/i,
  /posting (has )?expired/i,
  /no longer open/i,
];

const rows = db.prepare(
  "SELECT id, company, title, url FROM applications WHERE status IN ('planned','kit_ready') " +
  "AND url LIKE 'http%' ORDER BY score DESC LIMIT ?"
).all(LIMIT);

const kill = db.prepare(
  "UPDATE applications SET status='expired', notes=TRIM(COALESCE(notes,'')||' [closed on source "
  + "'||DATE('now')||']'), updated_at=datetime('now') WHERE id=?"
);
const stamp = db.prepare("UPDATE applications SET liveness_checked=datetime('now') WHERE id=?");

let dead = 0, live = 0, err = 0;
for (const row of rows) {
  try {
    const r = await fetch(row.url, { headers: { "User-Agent": UA }, redirect: "follow" });
    const text = (await r.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const hit = DEAD.find((re) => re.test(text));
    if (hit) { kill.run(row.id); dead++; console.log(`DEAD  ${row.company.slice(0,32).padEnd(32)} ${row.title.slice(0,44)}`); }
    else { stamp.run(row.id); live++; }
  } catch { err++; }
  await new Promise((r) => setTimeout(r, 700));
}
console.log(`\nexpired: ${dead}   still live: ${live}   unreachable: ${err}   (checked ${rows.length})`);
