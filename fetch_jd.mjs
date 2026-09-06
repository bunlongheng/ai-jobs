// fetch_jd.mjs - fill the empty jd column so kits can actually be tailored.
// Plain fetch, no browser: works for Greenhouse/Lever/HN/company career pages. LinkedIn and
// Indeed are Cloudflare/login walled and are skipped here - those need the signed-in browser
// on the dedicated box. Bounded + paced per the owner's resource policy. (2026-09-06)
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const ROOT = dirname(fileURLToPath(import.meta.url));
const db = new (require(join(ROOT, "web/node_modules/better-sqlite3")))(join(ROOT, "web/jobs.db"));

const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || 25;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const strip = (h) =>
  h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
   .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
   .replace(/&#x27;|&#39;/gi, "'").replace(/&quot;/gi, '"').replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
   .replace(/\s+/g, " ").trim();

async function jdFor(url) {
  if (/news\.ycombinator\.com\/item\?id=(\d+)/.test(url)) {
    const id = url.match(/id=(\d+)/)[1];
    const r = await fetch(`https://hn.algolia.com/api/v1/items/${id}`, { headers: { "User-Agent": UA } });
    if (!r.ok) return "";
    return strip(String((await r.json()).text || ""));
  }
  const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!r.ok) return "";
  const html = await r.text();
  // Greenhouse/Lever/most ATS put the posting in a known container; fall back to the whole body.
  const m = html.match(/<div[^>]+(?:id="content"|class="[^"]*(?:job__description|posting|opening|content)[^"]*")[^>]*>([\s\S]*?)<\/div>\s*<\/(?:div|section|main|body)>/i);
  return strip(m ? m[1] : html).slice(0, 12000);
}

const rows = db.prepare(
  "SELECT id, company, url FROM applications WHERE status='planned' AND url LIKE 'http%' " +
  "AND url NOT LIKE '%linkedin.com%' AND url NOT LIKE '%indeed.com%' " +
  "AND LENGTH(COALESCE(jd,'')) < 200 ORDER BY score DESC LIMIT ?"
).all(LIMIT);

const save = db.prepare("UPDATE applications SET jd=?, updated_at=datetime('now') WHERE id=?");
let ok = 0, bad = 0;
for (const row of rows) {
  let text = "";
  try { text = await jdFor(row.url); } catch { /* network/parse - counts as a miss */ }
  if (text && text.length > 400) { save.run(text, row.id); ok++; console.log(`OK   ${String(text.length).padStart(6)}  ${row.company.slice(0,40)}`); }
  else { bad++; console.log(`MISS ${String(text.length).padStart(6)}  ${row.company.slice(0,40)}`); }
  await new Promise((r) => setTimeout(r, 900)); // gentle pacing
}
console.log(`\njd fetched: ${ok}   missed: ${bad}   (of ${rows.length})`);
