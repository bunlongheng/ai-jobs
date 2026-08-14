import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findEmail } from "@/lib/hunter";
import { localOnlyBlocked } from "@/lib/jobfill";

export const dynamic = "force-dynamic";

// Hosts that are never the hiring company's own domain - job boards, ATSes, socials, mail.
const NOT_COMPANY = /(ycombinator|linkedin|indeed|greenhouse|lever\.co|ashbyhq|workday|myworkday|breezy|smartrecruiters|icims|gmail|googlemail|google\.com|github|twitter|x\.com|facebook|medium|notion\.so|bit\.ly|apply|jobs\.)/i;

// Pull the hiring company's own domain out of the posting text, if it left one.
function domainFromText(text: string, company: string): string {
  const hosts = new Set<string>();
  const re = /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const h = m[1].toLowerCase();
    if (/\.(png|jpe?g|gif|svg|webp|pdf|js|css|json)$/.test(h)) continue; // asset path, not a site
    if (NOT_COMPANY.test(h)) continue;
    if (h.split(".").length < 2) continue;
    hosts.add(h.replace(/^www\./, ""));
  }
  const list = [...hosts];
  if (!list.length) return "";
  const toks = company.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((w) => w.length >= 3);
  // Prefer a domain whose root contains a company-name token (e.g. "aqora" -> aqora.io).
  const match = list.find((h) => toks.some((t) => h.split(".")[0].includes(t) || t.includes(h.split(".")[0])));
  return match || list[0];
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = localOnlyBlocked(req); if (blocked) return blocked;
  const { id } = await params;
  const d = db();
  const job = d.prepare("SELECT id, company, url, jd, notes, found_email, found_email_meta FROM applications WHERE id=?").get(id) as
    | { id: string; company: string; url: string; jd: string | null; notes: string | null; found_email: string | null; found_email_meta: string | null }
    | undefined;
  if (!job) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  // Already cached - return it, don't spend a Hunter search.
  if (job.found_email) {
    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(job.found_email_meta || "{}"); } catch { /* ignore */ }
    return NextResponse.json({ ok: true, cached: true, email: job.found_email, ...meta });
  }

  if (!process.env.HUNTER_API_KEY) {
    return NextResponse.json({ ok: false, error: "no-key", message: "Add HUNTER_API_KEY to web/.env.local" }, { status: 400 });
  }

  const domain = domainFromText(`${job.jd || ""} ${job.notes || ""}`, job.company || "");
  const { found, reason } = await findEmail({ company: job.company, domain });
  if (!found) return NextResponse.json({ ok: false, error: reason });

  const meta = { name: found.name, position: found.position, confidence: found.confidence, type: found.type, department: found.department, domain: domain || null };
  d.prepare("UPDATE applications SET found_email=?, found_email_meta=?, updated_at=datetime('now') WHERE id=?")
    .run(found.email, JSON.stringify(meta), id);

  return NextResponse.json({ ok: true, cached: false, email: found.email, ...meta });
}
