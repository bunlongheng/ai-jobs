#!/usr/bin/env node
// make_resume_pdf.mjs - render a resume_versions row's markdown into a styled Letter PDF and
// store it back on the row (pdf BLOB, has_pdf=1). Mirrors make_covers.mjs (Playwright page.pdf)
// and uses the SAME marked as the on-screen preview so the PDF matches. Run with version ids,
// or no args to render every version. (owner request 2026-08-18)
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
const require = createRequire(import.meta.url);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = require(path.join(ROOT, "web/node_modules/playwright"));
const Database = require(path.join(ROOT, "web/node_modules/better-sqlite3"));
const { marked } = await import(pathToFileURL(path.join(ROOT, "web/node_modules/marked/lib/marked.esm.js")).href);
const db = new Database(path.join(ROOT, "web/jobs.db"));

marked.setOptions({ gfm: true, breaks: false });

function pageHtml(md, kind) {
  // strip the leading editor-notes HTML comment before rendering
  const body = marked.parse(String(md || "").replace(/^<!--[\s\S]*?-->\s*/m, ""));
  // cover letters read as prose (roomier margins, no section rules); resumes are dense + ruled.
  const cover = kind === "cover";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: letter; margin: ${cover ? "0.9in 1in" : "0.55in 0.55in"}; }
    html,body{margin:0;padding:0}
    body{font-family:Georgia,"Times New Roman",serif;color:#1a1a1a;font-size:${cover ? "10.5pt" : "9.5pt"};line-height:${cover ? "1.5" : "1.38"}}
    h1{font-size:${cover ? "17pt" : "19pt"};margin:0 0 2px}
    h1 + p{color:#444;font-size:9pt;margin:0 0 ${cover ? "16px" : "9px"}}
    h2{font-size:11pt;text-transform:uppercase;letter-spacing:.4px;${cover ? "" : "border-bottom:1.5px solid #1a1a1a;padding-bottom:2px;"}margin:13px 0 6px}
    h3{font-size:9.2pt;margin:8px 0 2px;white-space:nowrap;letter-spacing:-.1px}
    p{margin:0 0 ${cover ? "12px" : "7px"}}
    ul{margin:0 0 8px;padding-left:18px}
    li{margin:0 0 3px}
    a{color:#1a1a1a;text-decoration:none}
    strong{font-weight:700}
    .page-break{page-break-before:always;height:0}
    h3{page-break-after:avoid}
    li{page-break-inside:avoid}
  </style></head><body>${body}</body></html>`;
}

const ids = process.argv.slice(2);
const rows = ids.length
  ? ids.map((id) => db.prepare("SELECT id, kind, content FROM resume_versions WHERE id=?").get(id)).filter(Boolean)
  : db.prepare("SELECT id, kind, content FROM resume_versions").all();
if (!rows.length) { console.log("no resume versions to render."); process.exit(0); }

const browser = await chromium.launch();
const page = await browser.newPage();
// render sets pdf + has_pdf only; it does NOT bump updated_at (that tracks content edits)
const save = db.prepare("UPDATE resume_versions SET pdf = ?, has_pdf = 1 WHERE id = ?");
let n = 0;
for (const r of rows) {
  await page.setContent(pageHtml(r.content, r.kind), { waitUntil: "load" });
  const buf = await page.pdf({ printBackground: true, format: "Letter" });
  save.run(buf, r.id);
  n++;
}
await browser.close();
console.log(`rendered ${n} resume PDF(s).`);
