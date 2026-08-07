import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// PRE-SCAN targets only forms that still NEED filling: never-scanned, or still leaving >2
// fields for the human. Already-green rows and unfillable (wall/noform) rows are excluded -
// their trustworthiness is the separate READY-SCAN's job (/api/jobfill/readyscan). Must match
// the SELECT in run_prescan.sh exactly. (owner split 2026-08-07)
const TARGETS = `SELECT COUNT(*) n FROM applications
  WHERE status='kit_ready'
    AND url LIKE 'http%' AND url NOT LIKE '%linkedin.com%' AND url NOT LIKE '%indeed.com%'
    AND url NOT LIKE '%news.ycombinator.com%'
    AND COALESCE(pf_status,'') NOT IN ('wall','noform')
    AND (pf_total IS NULL OR (pf_total - COALESCE(pf_covered,0)) > 2)`;

// Kick off the headless prescan (run_prescan.sh - 2 lanes + watcher) as a detached process,
// so the board's per-row spinners light up via scan-status.json. Zero AI tokens. Guards
// against starting a second run while one is live. (owner request 2026-08-06)
export async function POST() {
  const statusFile = path.join(process.cwd(), "public", "scan-status.json");
  try {
    const s = JSON.parse(fs.readFileSync(statusFile, "utf8"));
    if (s.running && Date.now() - s.updatedAt < 20000) return NextResponse.json({ ok: true, already: true });
  } catch { /* no status yet */ }

  const count = (db().prepare(TARGETS).get() as { n: number }).n;
  if (!count) return NextResponse.json({ ok: true, count: 0 });

  const root = path.join(process.cwd(), "..");
  const child = spawn("bash", [path.join(root, "run_prescan.sh")], { cwd: root, detached: true, stdio: "ignore" });
  child.unref();
  return NextResponse.json({ ok: true, count });
}
