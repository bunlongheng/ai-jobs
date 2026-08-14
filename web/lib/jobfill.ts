import path from "path";
import fs from "fs";
import { NextResponse } from "next/server";

// Repo root (= old Python-engine layout, now data-only): web/ lives one level down.
export const ROOT = path.resolve(process.cwd(), "..");
export const PROFILE = path.join(ROOT, "profile.json");
export const RULES = path.join(ROOT, "jobfill", "rules.json");
export const COMMANDS = path.join(ROOT, "jobfill", "commands.jsonl");
// Master resume path comes from profile.json (identity.resume_pdf) so it is not hardcoded.
function masterResume(): string {
  try {
    const r = (JSON.parse(fs.readFileSync(path.join(ROOT, "profile.json"), "utf8")).identity || {}).resume_pdf;
    if (r) return path.isAbsolute(r) ? r : path.join(ROOT, r);
  } catch { /* no profile yet */ }
  return path.join(ROOT, "resume.pdf");
}
export const MASTER_RESUME = masterResume();
export const KITS_DIR = path.join(ROOT, "applications");

/** True only for a loopback Host (127.0.0.1 / localhost / ::1) - i.e. a request from the same
 *  machine. The JobFill extension always talks to http://127.0.0.1:3017, so this distinguishes
 *  the extension from any LAN device (10.x/192.168.x) that reached the app via the is-local bypass. */
export function isLoopback(req: Request): boolean {
  const host = (req.headers.get("host") || "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

/** Extension-only API. Refuses (a) any web-page Origin - http(s) OR the literal 'null' a sandboxed
 *  iframe sends (closes the Origin:null CSRF gap) - and (b) any NON-loopback client, so a LAN device
 *  cannot reach the browser-driving command channel or the PII profile route even though the board
 *  itself is LAN-readable. The extension (127.0.0.1) and local curl pass. */
export function originBlocked(req: Request): NextResponse | null {
  const o = req.headers.get("origin");
  if (o !== null && !o.startsWith("chrome-extension://")) {
    return NextResponse.json({ error: "browser pages may not call this API" }, { status: 403 });
  }
  // Optionally pin to YOUR JobFill extension: set JOBFILL_EXTENSION_ID (the id Chrome assigns on
  // Load unpacked) and any other installed extension is refused. Unset = accept any extension
  // (fine for a single-user machine); the loopback check below is still the hard gate.
  const pin = process.env.JOBFILL_EXTENSION_ID;
  if (pin && o !== null && o !== `chrome-extension://${pin}`) {
    return NextResponse.json({ error: "unrecognized extension" }, { status: 403 });
  }
  if (!isLoopback(req)) {
    return NextResponse.json({ error: "this API is loopback-only" }, { status: 403 });
  }
  return null;
}

/** Board-mutation routes (jobs/like, applied, hold-company, recruiter-status) are called by the
 *  app's OWN client components, always same-origin. Allow same-origin + no-Origin (server nav);
 *  refuse any cross-origin request so a drive-by page cannot corrupt the pipeline via the
 *  localhost auth bypass. */
export function crossOriginBlocked(req: Request): NextResponse | null {
  const o = req.headers.get("origin");
  if (o === null) return null;
  try {
    if (new URL(o).host !== (req.headers.get("host") || "")) {
      return NextResponse.json({ error: "cross-origin blocked" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "bad origin" }, { status: 403 });
  }
  return null;
}

/** For same-machine-only side effects (spawning headless scans, paid Hunter lookups): require
 *  same-origin AND a loopback Host. The board triggers these from localhost (Host=localhost ->
 *  loopback); a non-browser LAN client (no Origin, Host=10.x) is refused - closing the LAN
 *  side-effect residual that plain crossOriginBlocked (which allows no-Origin) leaves open. */
export function localOnlyBlocked(req: Request): NextResponse | null {
  const xo = crossOriginBlocked(req);
  if (xo) return xo;
  if (!isLoopback(req)) return NextResponse.json({ error: "this action is loopback-only" }, { status: 403 });
  return null;
}

export function readJson<T>(p: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(p, "utf8")) as T; } catch { return fallback; }
}
