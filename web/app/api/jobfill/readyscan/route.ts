import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// READY-SCAN target count: the GREEN, fillable Ready pile whose trustworthiness we re-prove
// (cover PDF + resume + answers). No browser. Mirrors the pile verify_ready.mjs audits.
const TARGETS = `SELECT COUNT(*) n FROM applications
  WHERE status='kit_ready' AND pf_ats='plugin' AND COALESCE(pf_total,0)>0`;

// Kick off the READY-SCAN (run_readyscan.sh -> verify_ready.mjs --fix --demote) detached, so the
// Ready panel icon spins via scan-status.json (kind:ready). Guards against starting while ANY
// scan (pre-scan or ready-scan) is live. Zero AI tokens. (owner split 2026-08-07)
export async function POST() {
  const statusFile = path.join(process.cwd(), "public", "scan-status.json");
  try {
    const s = JSON.parse(fs.readFileSync(statusFile, "utf8"));
    if (s.running && Date.now() - s.updatedAt < 20000) return NextResponse.json({ ok: true, already: true });
  } catch { /* no status yet */ }

  const count = (db().prepare(TARGETS).get() as { n: number }).n;
  if (!count) return NextResponse.json({ ok: true, count: 0 });

  const root = path.join(process.cwd(), "..");
  const child = spawn("bash", [path.join(root, "run_readyscan.sh")], { cwd: root, detached: true, stdio: "ignore" });
  child.unref();
  return NextResponse.json({ ok: true, count });
}
