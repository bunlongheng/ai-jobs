// pull_master_resume.mjs - refresh ai-jobs' tailoring base FROM Resume++'s master.
// Resume++ is the single source of truth for the resume; it stores versions on disk at
// ~/resume/.resume-plus/web/ (index.json + <id>.md). This reads the FLAGGED master straight
// from that workspace (no server needed - works even when Resume++'s web app is down) and writes
// it to resume-master.md, so per-job prep always tailors from the latest approved resume.
// Run: `npm run pull-master`. (owner request 2026-08-18)
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.env.RESUME_PLUS_WORKSPACE || path.join(os.homedir(), "resume");
const WEB = path.join(WORKSPACE, ".resume-plus", "web");

const HEADER = `<!--
resume-master.md - PULLED from Resume++'s master at ${WEB} (run: npm run pull-master).
Resume++ is the single source of truth - edit/approve the master THERE, then re-pull.
Do NOT hand-edit this file. Per-job tailoring reorders/re-weights THESE bullets toward the JD;
it never invents ([ADD METRIC] = a real number Bunlong fills in).
-->

`;

try {
  const idx = JSON.parse(fs.readFileSync(path.join(WEB, "index.json"), "utf8"));
  const versions = idx.versions || idx;
  const master = versions.find((v) => v.is_master) || versions[0];
  if (!master) { console.error("No master version in Resume++ - flag one in the builder, then re-run."); process.exit(1); }
  const content = fs.readFileSync(path.join(WEB, `${master.id}.md`), "utf8");
  if (!content.trim()) { console.error(`Master markdown (${master.id}.md) is empty.`); process.exit(1); }
  fs.writeFileSync(path.join(ROOT, "resume-master.md"), HEADER + content.trim() + "\n");
  console.log(`OK pulled Resume++ master "${master.name || master.id}" (${master.id}, ${content.length} chars) -> resume-master.md`);
  console.log("   per-job prep now tailors from this. (re-run after changing the master in Resume++)");
} catch (e) {
  console.error(`Could not read Resume++ workspace at ${WEB} (${e.message}). Set RESUME_PLUS_WORKSPACE if it lives elsewhere.`);
  process.exit(1);
}
