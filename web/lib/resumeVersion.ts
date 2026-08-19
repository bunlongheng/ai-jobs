import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

// Resume version stamp for the board footer - so you can GLANCE and know which resume JobFill
// injects, and whether it's the current Resume++ master (not a stale copy). The "version" is the
// edit-revision number: Resume++ snapshots every save to history/<id>/NNNN.md, so the highest NNNN
// is the true revision (e.g. 33 = "v33"). `fresh` proves the injected resume-bunlong.pdf is byte-
// identical to the master's rendered PDF. All read live from disk - no hardcoded number, no bug.
// (owner request 2026-08-19)
const JOBS_ROOT = path.resolve(process.cwd(), ".."); // web/ -> jobs/
const WEB = process.env.RESUME_PLUS_WORKSPACE
  ? path.join(process.env.RESUME_PLUS_WORKSPACE, ".resume-plus", "web")
  : path.join(os.homedir(), "resume", ".resume-plus", "web");

export type ResumeVersion = { rev: number | null; fresh: boolean; updatedAt: string | null };

const md5 = (p: string): string | null => {
  try { return crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex"); } catch { return null; }
};

export function resumeVersion(): ResumeVersion {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(WEB, "index.json"), "utf8"));
    const versions = idx.versions || idx;
    const master = (Array.isArray(versions) ? versions : []).find((v: { is_master?: number }) => v.is_master) || versions[0];
    if (!master) return { rev: null, fresh: false, updatedAt: null };

    // revision = highest NNNN.md snapshot in history/<id>/
    let rev: number | null = null;
    try {
      const nums = fs.readdirSync(path.join(WEB, "history", master.id))
        .map((f) => (f.match(/^(\d+)\.md$/) || [])[1])
        .filter(Boolean)
        .map(Number);
      if (nums.length) rev = Math.max(...nums);
    } catch { /* no history dir */ }

    // fresh = the injected PDF is byte-identical to the master's rendered PDF
    const injected = md5(path.join(JOBS_ROOT, "resume-bunlong.pdf"));
    const masterPdf = md5(path.join(WEB, "pdf", `${master.id}.pdf`));
    const fresh = !!injected && !!masterPdf && injected === masterPdf;

    return { rev, fresh, updatedAt: master.updated_at || null };
  } catch {
    return { rev: null, fresh: false, updatedAt: null };
  }
}
