// sync_resumes_to_drive.mjs - render every APPLIED-to job's resume_md into a Georgia PDF and push
// it to My Drive/Resume++/Applied/ (Resume++ reads that folder). Idempotent: re-run updates each
// file in place, no dupes. Self-contained - reuses the portfolio's Drive OAuth client via three
// env vars in web/.env.local (gitignored): GDRIVE_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
// Run: `npm run sync-drive` (from web/). Zero AI tokens. (owner request 2026-08-18)
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";
const require = createRequire(import.meta.url);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const Database = require(path.join(ROOT, "web/node_modules/better-sqlite3"));
const { chromium } = require(path.join(ROOT, "web/node_modules/playwright"));
const { marked } = await import(pathToFileURL(path.join(ROOT, "web/node_modules/marked/lib/marked.esm.js")).href);

function loadEnv(p) { try { for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch {} }
loadEnv(path.join(ROOT, "web/.env.local"));

// The Drive OAuth CLIENT here is the portfolio's gdrive client (which minted the refresh token) -
// deliberately distinct from jobs' own GOOGLE_CLIENT_ID (NextAuth login), which is a different client.
const { GDRIVE_REFRESH_TOKEN, GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET } = process.env;
if (!GDRIVE_REFRESH_TOKEN || !GDRIVE_CLIENT_ID || !GDRIVE_CLIENT_SECRET) {
  console.error("Missing Drive env (GDRIVE_REFRESH_TOKEN / GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET) in web/.env.local");
  process.exit(1);
}
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const sanitize = (s) => String(s || "").replace(/[\/\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();

marked.setOptions({ gfm: true, breaks: false });
function pageHtml(md) {
  const body = marked.parse(String(md || "").replace(/^<!--[\s\S]*?-->\s*/m, ""));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page{size:letter;margin:.55in .55in}html,body{margin:0;padding:0}
  body{font-family:Georgia,"Times New Roman",serif;color:#1a1a1a;font-size:9.5pt;line-height:1.38}
  h1{font-size:19pt;margin:0 0 2px}h1+p{color:#444;font-size:9pt;margin:0 0 9px}
  h2{font-size:11pt;text-transform:uppercase;letter-spacing:.4px;border-bottom:1.5px solid #1a1a1a;padding-bottom:2px;margin:13px 0 6px}
  h3{font-size:9.2pt;margin:8px 0 2px;white-space:nowrap;letter-spacing:-.1px;page-break-after:avoid}
  p{margin:0 0 7px}ul{margin:0 0 8px;padding-left:18px}li{margin:0 0 3px;page-break-inside:avoid}
  a{color:#1a1a1a;text-decoration:none}strong{font-weight:700}.page-break{page-break-before:always;height:0}
  </style></head><body>${body}</body></html>`;
}

async function driveToken() {
  const r = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: GDRIVE_CLIENT_ID, client_secret: GDRIVE_CLIENT_SECRET, refresh_token: GDRIVE_REFRESH_TOKEN, grant_type: "refresh_token" }) })).json();
  if (!r.access_token) throw new Error("Drive token refresh failed: " + JSON.stringify(r).slice(0, 150));
  return r.access_token;
}
async function folder(token, parent, name) {
  const q = `'${parent}' in parents and name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const l = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`, { headers: bearer(token) })).json();
  if (l.files?.length) return l.files[0].id;
  const c = await (await fetch("https://www.googleapis.com/drive/v3/files?fields=id", { method: "POST", headers: { ...bearer(token), "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parent] }) })).json();
  return c.id;
}

const db = new Database(process.env.JOBS_DB || path.join(ROOT, "web/jobs.db"));
const rows = db.prepare(`SELECT id, company, title, resume_md FROM applications
  WHERE status IN ('applied','rejected','interviewing','offer') AND resume_md IS NOT NULL AND resume_md != ''`).all();
console.log(`resumes to sync (things you applied to): ${rows.length}`);
if (!rows.length) process.exit(0);

const token = await driveToken();
const applied = await folder(token, await folder(token, "root", "Resume++"), "Applied");
console.log("OK My Drive/Resume++/Applied/ ready");

const ex = {};
let pageTok = "";
do {
  const j = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${applied}' in parents and trashed=false`)}&fields=nextPageToken,files(id,name)&pageSize=200${pageTok ? "&pageToken=" + pageTok : ""}`, { headers: bearer(token) })).json();
  for (const f of j.files || []) ex[f.name] = f.id;
  pageTok = j.nextPageToken || "";
} while (pageTok);

const browser = await chromium.launch();
const page = await browser.newPage();
let created = 0, updated = 0;
for (const r of rows) {
  await page.setContent(pageHtml(r.resume_md), { waitUntil: "load" });
  const pdf = await page.pdf({ printBackground: true, format: "Letter" });
  const fname = `${sanitize(r.company)} - ${sanitize(r.title)}`.slice(0, 110) + ` [${r.id}].pdf`;
  if (ex[fname]) {
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${ex[fname]}?uploadType=media`, { method: "PATCH", headers: { ...bearer(token), "Content-Type": "application/pdf" }, body: pdf });
    updated++;
  } else {
    const boundary = "rpp" + Date.now().toString(16) + Math.round(Math.random() * 1e6);
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: fname, parents: [applied] })}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`), pdf, Buffer.from(`\r\n--${boundary}--`)]);
    await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", { method: "POST", headers: { ...bearer(token), "Content-Type": `multipart/related; boundary=${boundary}` }, body });
    created++;
  }
  if ((created + updated) % 15 === 0) console.log(`  ${created + updated}/${rows.length}...`);
}
await browser.close();
console.log(`DONE - created ${created}, updated ${updated}. My Drive/Resume++/Applied/`);
