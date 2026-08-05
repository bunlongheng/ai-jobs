import { db } from "./db";
import crypto from "crypto";

// company (lowercased substring) -> domain, for favicon resolution.
const DOMAIN: Record<string, string> = {
  coinbase: "coinbase.com", "neo.tax": "neo.tax", neotax: "neo.tax", discord: "discord.com",
  webflow: "webflow.com", stripe: "stripe.com", twilio: "twilio.com", reddit: "reddit.com",
  dropbox: "dropbox.com", vanta: "vanta.com", optum: "optum.com", "home depot": "homedepot.com",
  epam: "epam.com", factored: "factored.ai", abbott: "abbott.com", owner: "owner.com",
  imgix: "imgix.com", weather: "weather.com", veeva: "veeva.com", memora: "memorahealth.com",
  turing: "turing.com", linear: "linear.app", openai: "openai.com", replit: "replit.com",
  anthropic: "anthropic.com", figma: "figma.com", notion: "notion.so", ramp: "ramp.com",
  airtable: "airtable.com", plaid: "plaid.com", brex: "brex.com", rippling: "rippling.com",
};

const GENERIC_MD5 = "b8a0bf372c762e966cc99ede8682bc71"; // google s2 generic globe

// Candidate domains for a company not in the DOMAIN map, so the board isn't full of
// letter-avatars. Modern startups use .ai/.io/.co/.dev as often as .com, so try a few.
// The generic-globe filter in fetchFaviconDataUri rejects a parked/empty guess, so a
// miss just falls back to the avatar.
function candidateDomains(company: string): string[] {
  const c = (company || "").toLowerCase();
  for (const [k, v] of Object.entries(DOMAIN)) if (c.includes(k)) return [v];
  // company IS already a domain (e.g. "TherapyNotes.com", "Einstellen.io")
  const asDomain = c.trim().match(/^([a-z0-9][a-z0-9-]*\.(com|io|ai|co|app|dev|so|tax|net|org))$/);
  if (asDomain) return [asDomain[1]];
  const core = c
    .replace(/\([^)]*\)/g, " ")                                    // drop "(SSG)" etc.
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|group|holdings?|holding|partners|technologies|technology|labs|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
  if (core.length < 2) return [];
  return [".com", ".ai", ".io", ".co", ".dev"].map((t) => core + t);
}

async function fetchFaviconDataUri(dom: string): Promise<string | null> {
  try {
    const r = await fetch(`https://www.google.com/s2/favicons?domain=${dom}&sz=64`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 120 || crypto.createHash("md5").update(buf).digest("hex") === GENERIC_MD5) return null;
    return "data:image/png;base64," + buf.toString("base64");
  } catch {
    return null;
  }
}

/** Read a cached logo data URI (or null). Never downloads. */
export function getLogo(company: string | null | undefined): string | null {
  if (!company) return null;
  const row = db().prepare("SELECT data_uri FROM logos WHERE company = ?").get(company) as { data_uri: string | null } | undefined;
  return row?.data_uri ?? null;
}

/** Populate the cache for any company that has no row yet. Downloads once. */
export async function refreshLogos(): Promise<{ fetched: number; withLogo: number }> {
  const d = db();
  const companies = (d.prepare("SELECT DISTINCT company FROM applications WHERE company IS NOT NULL").all() as { company: string }[]).map((r) => r.company);
  const have = new Set((d.prepare("SELECT company FROM logos").all() as { company: string }[]).map((r) => r.company));
  const upsert = d.prepare("INSERT INTO logos (company, data_uri, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(company) DO UPDATE SET data_uri=excluded.data_uri, updated_at=datetime('now')");
  let fetched = 0, withLogo = 0;
  for (const co of companies) {
    if (have.has(co)) continue;
    let uri: string | null = null;
    for (const dom of candidateDomains(co)) { uri = await fetchFaviconDataUri(dom); if (uri) break; }
    upsert.run(co, uri);
    fetched++;
    if (uri) withLogo++;
  }
  return { fetched, withLogo };
}

/** Warm the favicon cache for tech-stack icons, stored under "tech:<slug>" keys so the
 *  board's Tech column can read them the same way it reads company logos. Downloads once. */
export async function refreshTechIcons(entries: { slug: string; domain: string }[]): Promise<{ fetched: number; withLogo: number }> {
  const d = db();
  const have = new Set((d.prepare("SELECT company FROM logos WHERE company LIKE 'tech:%'").all() as { company: string }[]).map((r) => r.company));
  const upsert = d.prepare("INSERT INTO logos (company, data_uri, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(company) DO UPDATE SET data_uri=excluded.data_uri, updated_at=datetime('now')");
  let fetched = 0, withLogo = 0;
  for (const e of entries) {
    const key = `tech:${e.slug}`;
    if (have.has(key)) continue;
    const uri = await fetchFaviconDataUri(e.domain);
    upsert.run(key, uri);
    fetched++;
    if (uri) withLogo++;
  }
  return { fetched, withLogo };
}
