#!/usr/bin/env node
// make_covers.mjs - render each kit's tailored cover_md into a real, styled PDF at
// applications/<id>/cover-letter.pdf. The extension attaches THIS pdf to the Cover Letter
// slot (never the resume, never a .txt). Run with ids, or with no args to do every
// kit_ready job that has a cover_md. (owner bug 2026-08-05: cover slot must be a real PDF)
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
const require = createRequire(import.meta.url);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = require(path.join(ROOT, "web/node_modules/playwright"));
const Database = require(path.join(ROOT, "web/node_modules/better-sqlite3"));
const db = new Database(path.join(ROOT, "web/jobs.db"));
const profile = JSON.parse(fs.readFileSync(path.join(ROOT, "profile.json"), "utf8"));
const id0 = profile.identity || {};

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const strip = (u) => String(u || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
const contact = [id0.email, id0.phone, id0.location, strip(id0.site), strip(id0.linkedin), strip(id0.github)].filter(Boolean).map(esc).join(" &nbsp;&middot;&nbsp; ");

// cover_md -> body paragraphs (drop the leading "# Cover Letter ..." heading).
function paras(md) {
  return md.replace(/^\s*#.*$/m, "").trim().split(/\n{2,}/).map((p) => p.trim().replace(/\n/g, "<br>")).filter(Boolean);
}
function html(md) {
  const body = paras(md).map((p) => `<p>${esc(p).replace(/&lt;br&gt;/g, "<br>")}</p>`).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: letter; margin: 0.9in 1in; }
    html,body{margin:0;padding:0}
    body{font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;color:#1a1a1a;font-size:11pt;line-height:1.55}
    .name{font-size:19pt;font-weight:700;letter-spacing:.2px;margin:0 0 2px}
    .contact{font-size:9.5pt;color:#444;margin:0 0 18px}
    .rule{height:2px;background:#1a1a1a;margin:0 0 18px}
    p{margin:0 0 12px}
  </style></head><body>
    <div class="name">${esc(id0.name || "Your Name")}</div>
    <div class="contact">${contact}</div>
    <div class="rule"></div>
    ${body}
  </body></html>`;
}

const ids = process.argv.slice(2);
const rows = ids.length
  ? ids.map((id) => db.prepare("SELECT id, cover_md FROM applications WHERE id=?").get(id)).filter((r) => r && r.cover_md)
  : db.prepare("SELECT id, cover_md FROM applications WHERE status='kit_ready' AND cover_md IS NOT NULL AND cover_md!=''").all();

if (!rows.length) { console.log("no kits with a cover_md to render."); process.exit(0); }
const browser = await chromium.launch();
const page = await browser.newPage();
let n = 0;
for (const r of rows) {
  const dir = path.join(ROOT, "applications", r.id);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "cover-letter.pdf");
  await page.setContent(html(r.cover_md), { waitUntil: "load" });
  await page.pdf({ path: out, printBackground: true, format: "Letter" });
  n++;
  if (n % 10 === 0) console.log(`  ${n}/${rows.length}...`);
}
await browser.close();
console.log(`rendered ${n} cover PDF(s).`);
