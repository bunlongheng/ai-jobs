// Owner is in Pelham, NH (03076) and will make an exception to on-site/hybrid for jobs
// within ~10 miles of home. We don't geocode - we match the job's location string against
// a curated set of towns inside that radius, with a rough straight-line mileage from
// Pelham center so the detail page can call out "Near home ~7mi". (owner request 2026-08-05)
const NEAR: Array<[re: RegExp, town: string, miles: number]> = [
  [/\bpelham,?\s*nh\b/i, "Pelham, NH", 0],
  [/\bwindham,?\s*nh\b/i, "Windham, NH", 5],
  [/\bhudson,?\s*nh\b/i, "Hudson, NH", 6],
  [/\bsalem,?\s*nh\b/i, "Salem, NH", 6],
  [/\bdracut,?\s*ma\b/i, "Dracut, MA", 5],
  [/\btyngsboro(ugh)?,?\s*ma\b/i, "Tyngsborough, MA", 6],
  [/\blowell,?\s*ma\b/i, "Lowell, MA", 7],
  [/\bnashua,?\s*nh\b/i, "Nashua, NH", 8],
  [/\bmethuen,?\s*ma\b/i, "Methuen, MA", 9],
  [/\blitchfield,?\s*nh\b/i, "Litchfield, NH", 9],
  [/\bderry,?\s*nh\b/i, "Derry, NH", 10],
];

export type NearHome = { town: string; miles: number };

/** If the job location is within ~10mi of home, return the matched town + rough miles. */
export function nearHome(location: string | null | undefined): NearHome | null {
  const loc = location || "";
  for (const [re, town, miles] of NEAR) if (re.test(loc)) return { town, miles };
  return null;
}
