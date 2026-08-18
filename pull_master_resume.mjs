// pull_master_resume.mjs - refresh ai-jobs' tailoring base FROM Resume++'s master.
// Resume++ (http://localhost:3027) is the single source of truth for the resume; this pulls its
// flagged master into resume-master.md so per-job prep always tailors from the latest approved
// resume. Run: `npm run pull-master`. (owner request 2026-08-18)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.RESUMEPP_BASE || "http://localhost:3027";

const HEADER = `<!--
resume-master.md - PULLED from Resume++ master via ${BASE}/api/resume  (run: npm run pull-master).
Resume++ is the single source of truth for the resume - edit the master THERE, then re-pull.
Do NOT hand-edit this file. Per-job tailoring reorders/re-weights THESE bullets toward the JD;
it never invents ([ADD METRIC] = a real number Bunlong fills in).
-->

`;

try {
  const list = await (await fetch(`${BASE}/api/resume`)).json();
  const versions = list.versions || list || [];
  const master = versions.find((v) => (v.is_master || v.master) && (v.kind || "resume") === "resume") || versions.find((v) => v.is_master || v.master);
  if (!master) { console.error("No master version found in Resume++ - flag one with the star, then re-run."); process.exit(1); }
  const one = await (await fetch(`${BASE}/api/resume/${master.id}`)).json();
  const v = one.version || one;
  const content = v.content || v.markdown || v.body || "";
  if (!content.trim()) { console.error("Master version has no content."); process.exit(1); }
  fs.writeFileSync(path.join(ROOT, "resume-master.md"), HEADER + content.trim() + "\n");
  console.log(`OK pulled Resume++ master "${master.name || master.id}" (${content.length} chars) -> resume-master.md`);
  console.log("   per-job prep now tailors from this. (re-run after changing the master in Resume++)");
} catch (e) {
  console.error(`Could not reach Resume++ at ${BASE} (${e.message}). Start it (port 3027) or set RESUMEPP_BASE, then re-run.`);
  process.exit(1);
}
