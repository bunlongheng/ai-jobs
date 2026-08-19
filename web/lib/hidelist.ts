import path from "path";
import fs from "fs";

// Company HIDE list: a SOFT hide. Any company named here is filtered out of every board / search /
// trend view - exactly like the blocklist visually - BUT the scraper keeps scanning and adding its
// jobs (they just stay hidden). That is the whole difference from the blocklist: hide = declutter
// the view, block = declutter AND stop wasting scrapes. Stored as a plain JSON array next to
// profile.json so it survives re-scraping; hiding only FILTERS rows, so un-hiding brings them
// straight back with full history. (owner request 2026-08-19)
const ROOT = path.resolve(process.cwd(), "..");
// JOBS_HIDELIST overrides the path (parallels JOBS_DB / JOBS_BLOCKLIST) so tests isolate from the real file.
export const HIDELIST = process.env.JOBS_HIDELIST || path.join(ROOT, "hidelist.json");
const norm = (s: string) => s.trim().toLowerCase();

export function getHidelist(): string[] {
  try {
    const a = JSON.parse(fs.readFileSync(HIDELIST, "utf8"));
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Lower-cased set for fast case-insensitive membership tests. */
export function hiddenSet(): Set<string> {
  return new Set(getHidelist().map(norm));
}

export function isHidden(company: string | null | undefined, set?: Set<string>): boolean {
  if (!company) return false;
  return (set || hiddenSet()).has(norm(company));
}

/** Persist a cleaned list: trimmed, de-duped case-insensitively (first casing wins), sorted. */
export function setHidelist(list: string[]): string[] {
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
  fs.writeFileSync(HIDELIST, JSON.stringify(out, null, 2) + "\n");
  return out;
}
