import path from "path";
import fs from "fs";
import { NextResponse } from "next/server";

// Repo root (= old Python-engine layout, now data-only): web/ lives one level down.
export const ROOT = path.resolve(process.cwd(), "..");
export const PROFILE = path.join(ROOT, "profile.json");
export const RULES = path.join(ROOT, "jobfill", "rules.json");
export const COMMANDS = path.join(ROOT, "jobfill", "commands.jsonl");
export const MASTER_RESUME = path.join(ROOT, process.env.MASTER_RESUME || "resume-master.pdf");
export const KITS_DIR = path.join(ROOT, "applications");

/** Web pages must not probe this PII API: any http(s) Origin is refused.
 *  The extension's background worker sends no Origin (or chrome-extension://). */
export function originBlocked(req: Request): NextResponse | null {
  const o = req.headers.get("origin") || "";
  if (o.startsWith("http://") || o.startsWith("https://")) {
    return NextResponse.json({ error: "browser pages may not call this API" }, { status: 403 });
  }
  return null;
}

export function readJson<T>(p: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(p, "utf8")) as T; } catch { return fallback; }
}
