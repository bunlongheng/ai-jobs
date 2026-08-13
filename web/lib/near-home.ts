import fs from "fs";
import path from "path";

// "Near home" jobs (within a short commute) are flagged on the detail page. The town list is
// user-configurable in profile.json (`near_home`: [{match, town, miles}]) so nothing about a
// location is hardcoded - it falls back to profile.example.json on a fresh clone. No geocoding;
// we match the job's location string against your curated regexes. (open-source: config-driven)
type NearRow = { match: string; town: string; miles: number };

function loadNear(): NearRow[] {
  for (const p of [path.join(process.cwd(), "..", "profile.json"), path.join(process.cwd(), "..", "profile.example.json")]) {
    try {
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      if (Array.isArray(j.near_home)) return j.near_home;
    } catch { /* try next */ }
  }
  return [];
}
const NEAR = loadNear();

export type NearHome = { town: string; miles: number };

/** If the job location matches a configured near-home town, return it + rough miles. */
export function nearHome(location: string | null | undefined): NearHome | null {
  const loc = location || "";
  for (const r of NEAR) {
    try { if (new RegExp(r.match, "i").test(loc)) return { town: r.town, miles: r.miles }; } catch { /* bad regex in config */ }
  }
  return null;
}
