#!/usr/bin/env node
// verify_resume.mjs - TRIPLE-CHECK that the resume JobFill injects is the CURRENT Resume++ master.
// Ran into this: editing the master in Resume++ left the injected PDF stale. This proves, from 3
// independent angles, that we're serving the latest - or tells you exactly what's stale + the fix.
// Run: `node verify_resume.mjs` (or `npm run verify-resume` from web/). No AI tokens. (owner 2026-08-19)
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB = process.env.RESUME_PLUS_WORKSPACE
  ? path.join(process.env.RESUME_PLUS_WORKSPACE, ".resume-plus", "web")
  : path.join(os.homedir(), "resume", ".resume-plus", "web");
const PORT = process.env.JOBS_PORT || "3017";

const md5 = (buf) => crypto.createHash("md5").update(buf).digest("hex");
const readMaybe = (p) => { try { return fs.readFileSync(p); } catch { return null; } };
const ok = (b) => (b ? "\x1b[32mOK\x1b[0m" : "\x1b[31mSTALE\x1b[0m");

let checks = [];
try {
  // Resume++ says which version is the master, and when it changed.
  const idx = JSON.parse(fs.readFileSync(path.join(WEB, "index.json"), "utf8"));
  const versions = idx.versions || idx;
  const master = versions.find((v) => v.is_master) || versions[0];
  if (!master) { console.error("No master flagged in Resume++."); process.exit(1); }
  console.log(`Resume++ master: "${master.name || master.id}" (${master.id}), updated ${master.updated_at || "?"}\n`);

  // 1) TEXT: resume-master.md (minus our header) === the master .md in Resume++
  const srcMd = (readMaybe(path.join(WEB, `${master.id}.md`)) || Buffer.from("")).toString("utf8").trim();
  const localMd = (readMaybe(path.join(ROOT, "resume-master.md")) || Buffer.from("")).toString("utf8")
    .replace(/^<!--[\s\S]*?-->\s*/, "").trim();
  const textOk = srcMd.length > 0 && srcMd === localMd;
  checks.push(["1. tailoring text  (resume-master.md == master .md)", textOk]);

  // 2) PDF: resume-bunlong.pdf === the rendered master pdf/<id>.pdf
  const srcPdf = readMaybe(path.join(WEB, "pdf", `${master.id}.pdf`));
  const localPdf = readMaybe(path.join(ROOT, "resume-bunlong.pdf"));
  const pdfOk = !!srcPdf && !!localPdf && md5(srcPdf) === md5(localPdf);
  checks.push([`2. injected PDF     (resume-bunlong.pdf == pdf/${master.id}.pdf)`, pdfOk]);
  if (!srcPdf) console.log("   ! Resume++ has no rendered PDF yet - open the master there and export once.");
  if (localPdf && srcPdf) console.log(`   local ${md5(localPdf).slice(0, 8)} (${localPdf.length}B)  vs  master ${md5(srcPdf).slice(0, 8)} (${srcPdf.length}B)`);

  // 3) LIVE SERVE: what the running JobFill API actually returns === resume-bunlong.pdf
  let serveOk = false, served = null;
  try {
    const kitId = process.env.VERIFY_KIT_ID || "";
    // any kit_ready id works; if not given, ask the API-independent way by hitting the master fallback via a known id.
    const testId = kitId || "instrumental-group-senior-full-stack-developer-react-node-js-js-";
    const res = await fetch(`http://localhost:${PORT}/api/jobfill/kit/${testId}/resume`);
    if (res.ok) { served = Buffer.from(await res.arrayBuffer()); serveOk = !!localPdf && md5(served) === md5(localPdf); }
  } catch { /* server down */ }
  checks.push(["3. live JobFill serve (API resume == resume-bunlong.pdf)", serveOk]);
  if (served && localPdf) console.log(`   served ${md5(served).slice(0, 8)} (${served.length}B)  vs  file ${md5(localPdf).slice(0, 8)}`);
} catch (e) {
  console.error(`Could not read Resume++ workspace at ${WEB}: ${e.message}`);
  process.exit(1);
}

console.log("");
for (const [label, pass] of checks) console.log(`  [${ok(pass)}]  ${label}`);
const allGood = checks.every(([, p]) => p);
console.log("");
if (allGood) {
  console.log("\x1b[32mUSING LATEST - all 3 checks pass. JobFill injects the current master.\x1b[0m");
} else {
  console.log("\x1b[31mSTALE - run `node pull_master_resume.mjs` to re-sync text + PDF, then re-run this.\x1b[0m");
  console.log("(If check 2 fails because Resume++ has no PDF, open the master in Resume++ and export once first.)");
  process.exit(2);
}
