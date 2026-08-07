import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { originBlocked } from "@/lib/jobfill";

export const dynamic = "force-dynamic";

// Returns the LATEST extension version from the on-disk manifest. The popup compares this to
// its own loaded runtime version - if they differ, the popup shows a (!) so you know the
// loaded extension is stale and needs a reload. (owner request 2026-08-06)
export async function GET(req: Request) {
  const blocked = originBlocked(req);
  if (blocked) return blocked;
  let version = "";
  for (const p of [
    path.join(process.cwd(), "..", "jobfill", "extension", "manifest.json"),
    path.join(process.cwd(), "extension", "manifest.json"),
  ]) {
    try { version = JSON.parse(fs.readFileSync(p, "utf8")).version || ""; if (version) break; } catch { /* next */ }
  }
  return NextResponse.json({ version });
}
