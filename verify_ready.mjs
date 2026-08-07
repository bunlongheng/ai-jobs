#!/usr/bin/env node
// verify_ready.mjs - EVAL for the board's "Ready" pile. "Ready" must be PROVABLY ready, not
// just prescanned: it needs a real kit (resume + cover text), a rendered cover-letter PDF on
// disk, and every screening question it asks must resolve to a canonical answer. This script
// checks each Ready job against that bar, AUTO-FIXES what it can (renders missing cover PDFs),
// and reports exactly what is still broken with evidence. Rerunnable. No AI tokens.
// Usage: node verify_ready.mjs [--fix]   (--fix renders missing cover PDFs; default: audit only)
import { createRequire } from "module";
import os from "os";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";
const require = createRequire(import.meta.url);
const ROOT = path.join(os.homedir(), "Sites/jobs");
const Database = require(path.join(ROOT, "web/node_modules/better-sqlite3"));
const db = new Database(path.join(ROOT, "web/jobs.db"));
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "jobfill/rules.json"), "utf8"));
const FIX = process.argv.includes("--fix");

const norm = (s) => String(s || "").toLowerCase().trim();
const isFile = (l) => /attach|resume|\bcv\b|curriculum|cover letter|upload|portfolio|rec-form/i.test(l);
const NOISE = /^select\b|^search$|^show more|^skip to|^pick date|^delete this entry|^what$|^country$|cookie|personalize content|^january|end date|from date|^to date|start date|^month|^year|job title|^company \*?$|name pronunciation|other links|^website|^linkedin|^first name|^last name|^email|^phone|^\d+$|^[a-z ]{1,3}$|opt-?in|whatsapp|veteran|disability|hispanic|gender|race|ethnic|pronoun|preferred name|^address|^city|^state|^zip|salary|^how did you hear|she\/her|he\/him/;
const resolves = (l) => rules.some((r) => { try { return new RegExp(r.match, "i").test(norm(l)); } catch { return false; } });

const ready = db.prepare("SELECT id, company, title, cover_md, resume_md, has_resume_pdf, pf_status, pf_covered, pf_total FROM applications WHERE status='kit_ready' AND pf_ats='plugin' AND COALESCE(pf_total,0)>0 ORDER BY score DESC").all();
const coverPdf = (id) => path.join(ROOT, "applications", id, "cover-letter.pdf");
const latestFields = (id) => { const e = db.prepare("SELECT fields FROM events WHERE app_id=? AND outcome='filled' AND fields IS NOT NULL ORDER BY id DESC LIMIT 1").get(id); if (!e) return []; try { return JSON.parse(e.fields); } catch { return []; } };

// PASS 1: audit
function audit() {
  return ready.map((j) => {
    const gaps = latestFields(j.id)
      .filter((f) => String(f[1] || "").toUpperCase().startsWith("MANUAL") && !isFile(f[0]) && !NOISE.test(norm(f[0])) && norm(f[0]).length >= 12 && !resolves(f[0]))
      .map((f) => f[0]);
    return {
      id: j.id, company: j.company,
      hasCoverMd: !!(j.cover_md && j.cover_md.trim()),
      hasCoverPdf: fs.existsSync(coverPdf(j.id)),
      hasResume: !!(j.resume_md && j.resume_md.trim()) || j.has_resume_pdf === 1,
      answerGaps: [...new Set(gaps)],
      // THE REAL BAR: how many form fields the last prescan left UNFILLED. "Ready" means the
      // owner just clicks Submit, so this must be tiny. (owner correction 2026-08-06)
      formGaps: Math.max(0, (j.pf_total || 0) - (j.pf_covered || 0)),
      covered: j.pf_covered || 0, total: j.pf_total || 0,
      notFillable: /wall|noform/.test(j.pf_status || ""), // Cloudflare-walled or URL has no form
    };
  });
}
const GAP_MAX = 2; // a truly-ready form leaves at most this many fields for the human

let rows = audit();

// AUTO-FIX: render missing cover PDFs for jobs that HAVE cover text
if (FIX) {
  const needPdf = rows.filter((r) => r.hasCoverMd && !r.hasCoverPdf).map((r) => r.id);
  if (needPdf.length) {
    console.log(`fixing: rendering ${needPdf.length} missing cover PDF(s)...`);
    try { execFileSync("node", [path.join(ROOT, "make_covers.mjs"), ...needPdf], { cwd: ROOT, stdio: "inherit" }); } catch (e) { console.log("cover render error:", String(e).slice(0, 120)); }
    rows = audit(); // re-check after fixing
  }
}

// DEMOTE fake-ready jobs (too many unfilled form fields) back to Not-ready so the label is
// honest. --demote actually writes it; default just flags. (owner correction 2026-08-06)
const DEMOTE = process.argv.includes("--demote");
const write = new Database(path.join(ROOT, "web/jobs.db"));

// VERDICT: a job is truly ready only if the kit is complete AND the real form fills clean.
const truly = (r) => r.hasCoverMd && r.hasCoverPdf && r.hasResume && r.answerGaps.length === 0 && r.formGaps <= GAP_MAX && !r.notFillable;
const pass = rows.filter(truly);
const fail = rows.filter((r) => !truly(r));

console.log(`\n=== READY EVAL - ${rows.length} jobs, ${pass.length} PROVEN ready, ${fail.length} NOT truly ready ===\n`);
let demoted = 0;
for (const r of fail) {
  const why = [];
  if (!r.hasResume) why.push("no resume");
  if (!r.hasCoverMd) why.push("no cover text");
  else if (!r.hasCoverPdf) why.push("cover PDF missing");
  if (r.answerGaps.length) why.push(`${r.answerGaps.length} unanswered Q`);
  if (r.formGaps > GAP_MAX) why.push(`${r.formGaps} form fields UNFILLED (${r.covered}/${r.total})`);
  if (r.notFillable) why.push("NOT FILLABLE (walled / URL has no form)");
  console.log(`  FAIL  ${r.company} (${r.id})\n        -> ${why.join(" | ")}`);
  // demote for form-fill failure OR not-fillable (kit-content gaps get fixed, not demoted)
  if (DEMOTE && (r.formGaps > GAP_MAX || r.notFillable)) { write.prepare("UPDATE applications SET pf_ats=NULL, updated_at=datetime('now') WHERE id=?").run(r.id); demoted++; }
}
console.log(`\nProven-ready: ${pass.length}/${rows.length}.${DEMOTE ? ` Demoted ${demoted} fake-ready -> Not-ready.` : ""} ${FIX ? "" : "(--fix renders covers, --demote moves fake-ready out)"}`);
fs.writeFileSync(path.join(ROOT, ".ready-eval.json"), JSON.stringify({ total: rows.length, pass: pass.length, fail: fail.map((r) => ({ id: r.id, company: r.company, hasResume: r.hasResume, hasCoverMd: r.hasCoverMd, hasCoverPdf: r.hasCoverPdf, answerGaps: r.answerGaps, formGaps: r.formGaps, fill: `${r.covered}/${r.total}` })) }, null, 2));
