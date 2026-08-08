// Hunter.io email finder - turns a company (name or domain) into the best real contact email to
// apply to, for jobs whose posting left no address (HN posts, LinkedIn/Indeed listings). Uses the
// free-tier Domain Search API (25 searches/mo, returns several people per search). Reads
// HUNTER_API_KEY from the environment - only ever imported by the server-side API route.
// (owner request 2026-08-08)

export type FoundEmail = {
  email: string;
  name: string;
  position: string;
  confidence: number; // 0-100 Hunter score
  type: string;       // "personal" | "generic"
  department: string;
};

type HunterEmail = {
  value: string;
  type?: string;
  confidence?: number;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  department?: string | null;
  seniority?: string | null;
};

// Roles worth reaching for a job application, best first.
const APPLY_ROLE = /recruit|talent|talent acquisition|people ops|\bhr\b|hiring|staffing|founder|co-?founder|\bceo\b|\bcto\b|head of|engineering manager|hiring manager|chief people/i;
const APPLY_DEPT = /(human_?resources|hr|executive|management|founder)/i;
// Generic inboxes that are still a legit place to apply, if no person is found.
const APPLY_GENERIC = /^(careers?|jobs?|hiring|recruit(ing|er)?|talent|hr|people|apply|join|hello|team|work)@/i;

function scoreEmail(e: HunterEmail): number {
  const pos = String(e.position || "");
  const dept = String(e.department || "");
  const conf = Number(e.confidence || 0);
  let s = conf; // base on Hunter confidence
  if (APPLY_ROLE.test(pos)) s += 60;           // a real recruiter / founder / eng manager wins
  if (APPLY_DEPT.test(dept)) s += 30;
  if (e.type === "personal") s += 15;          // a named human over a role inbox
  else if (APPLY_GENERIC.test(String(e.value))) s += 8; // careers@/jobs@ is still fine
  return s;
}

// Look up the best apply-to email for a company. Pass a domain when known (more accurate), else the
// company name (Hunter resolves the domain). Returns null + a reason when nothing usable is found.
export async function findEmail(
  opts: { company?: string; domain?: string }
): Promise<{ found: FoundEmail | null; reason: string }> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return { found: null, reason: "no-key" };
  const domain = (opts.domain || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  const company = (opts.company || "").trim();
  if (!domain && !company) return { found: null, reason: "no-company" };

  // Free plan caps domain-search at 10 results; requesting more is rejected outright.
  const qs = new URLSearchParams({ api_key: key, limit: "10" });
  if (domain) qs.set("domain", domain);
  else qs.set("company", company);

  let json: { data?: { emails?: HunterEmail[] }; errors?: { details?: string }[] };
  try {
    const r = await fetch(`https://api.hunter.io/v2/domain-search?${qs}`, { cache: "no-store" });
    json = await r.json();
    if (!r.ok) return { found: null, reason: json?.errors?.[0]?.details || `hunter ${r.status}` };
  } catch (e) {
    return { found: null, reason: "network: " + String(e).slice(0, 80) };
  }

  const emails = (json.data?.emails || []).filter((e) => e.value);
  if (!emails.length) return { found: null, reason: "no emails at this domain" };

  const best = emails.slice().sort((a, b) => scoreEmail(b) - scoreEmail(a))[0];
  const name = [best.first_name, best.last_name].filter(Boolean).join(" ").trim();
  return {
    found: {
      email: best.value,
      name,
      position: String(best.position || ""),
      confidence: Number(best.confidence || 0),
      type: String(best.type || ""),
      department: String(best.department || ""),
    },
    reason: "ok",
  };
}
