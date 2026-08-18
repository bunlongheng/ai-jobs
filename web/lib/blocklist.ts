import path from "path";
import fs from "fs";
import { getLogo } from "./logos";

export type BlockedCompany = { company: string; logo: string | null };

/** Attach each company's cached logo - for rendering the blocked chips with a brand mark.
 *  Kept out of getBlocklist()/blockedSet() so the hot board-filter path never touches logos. */
export function withLogos(names: string[]): BlockedCompany[] {
  return names.map((company) => ({ company, logo: getLogo(company) }));
}

// Company blocklist: any company named here is hidden from EVERY board / search / trend view.
// Stored as a plain JSON array next to profile.json so it survives re-scraping. Blocking FILTERS
// the rows - it never deletes them - so un-blocking a company instantly brings its jobs back with
// their full history intact. That's the whole point: a reversible hide, not a destroy.
// (owner request 2026-08-17)
const ROOT = path.resolve(process.cwd(), "..");
// JOBS_BLOCKLIST overrides the path (parallels JOBS_DB) so tests can isolate from the real file.
export const BLOCKLIST = process.env.JOBS_BLOCKLIST || path.join(ROOT, "blocklist.json");
const norm = (s: string) => s.trim().toLowerCase();

export function getBlocklist(): string[] {
  try {
    const a = JSON.parse(fs.readFileSync(BLOCKLIST, "utf8"));
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Lower-cased set for fast case-insensitive membership tests. */
export function blockedSet(): Set<string> {
  return new Set(getBlocklist().map(norm));
}

export function isBlocked(company: string | null | undefined, set?: Set<string>): boolean {
  if (!company) return false;
  return (set || blockedSet()).has(norm(company));
}

/** Persist a cleaned list: trimmed, de-duped case-insensitively (first casing wins), sorted. */
export function setBlocklist(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of list) {
    const t = String(c || "").trim();
    if (!t) continue;
    const k = norm(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  out.sort((a, b) => a.localeCompare(b));
  fs.writeFileSync(BLOCKLIST, JSON.stringify(out, null, 2) + "\n");
  return out;
}
